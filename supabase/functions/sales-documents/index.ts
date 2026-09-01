import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "sales-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(["invoice", "correction", "sale_confirmation", "receipt", "other"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "dokument.pdf";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
    if (!service) return json({ error: "Brak konfiguracji serwera" }, 500);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Brak autoryzacji" }, 401);

    const sb = createClient(url, service, { db: { schema: "market" } });
    const { data: seller } = await sb.from("sellers")
      .select("id,seller_type,legal_name")
      .eq("auth_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const contentType = req.headers.get("content-type") ?? "";
    let action = "list";
    let orderId = "";
    let documentId = "";
    let documentType = "invoice";
    let documentNumber: string | null = null;
    let issuedAt: string | null = null;
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      action = String(form.get("action") ?? "upload");
      orderId = String(form.get("order_id") ?? "");
      documentType = String(form.get("document_type") ?? "invoice");
      documentNumber = String(form.get("document_number") ?? "").trim() || null;
      issuedAt = String(form.get("issued_at") ?? "").trim() || null;
      const maybeFile = form.get("file");
      file = maybeFile instanceof File ? maybeFile : null;
    } else {
      const body = await req.json().catch(() => ({}));
      action = String(body?.action ?? "list");
      orderId = String(body?.order_id ?? "");
      documentId = String(body?.document_id ?? "");
    }

    async function orderAccess(id: string) {
      if (!id) return { buyer: false, seller: false };
      const { data: order } = await sb.from("orders").select("buyer_id").eq("id", id).maybeSingle();
      const buyer = order?.buyer_id === user.id;
      let ownsSellerPart = false;
      if (seller?.id) {
        const { data: item } = await sb.from("order_items").select("id").eq("order_id", id).eq("seller_id", seller.id).limit(1).maybeSingle();
        ownsSellerPart = !!item;
      }
      return { buyer, seller: ownsSellerPart };
    }

    if (action === "list") {
      const access = await orderAccess(orderId);
      if (!access.buyer && !access.seller) return json({ error: "Brak dostępu do zamówienia" }, 403);
      let query = sb.from("sales_documents")
        .select("id,order_id,seller_id,document_type,source,status,document_number,issued_at,file_name,external_provider,integration_status,created_at")
        .eq("order_id", orderId)
        .eq("status", "available")
        .order("created_at", { ascending: false });
      if (access.seller && !access.buyer && seller?.id) query = query.eq("seller_id", seller.id);
      const { data: docs, error } = await query;
      if (error) throw error;
      const sellerIds = [...new Set((docs ?? []).map((d: any) => d.seller_id))];
      const { data: names } = sellerIds.length
        ? await sb.from("sellers").select("id,legal_name,seller_type").in("id", sellerIds)
        : { data: [] } as any;
      const bySeller = Object.fromEntries((names ?? []).map((s: any) => [s.id, s]));
      return json({
        documents: (docs ?? []).map((d: any) => ({
          ...d,
          seller_name: bySeller[d.seller_id]?.legal_name ?? "Sprzedawca",
          seller_type: bySeller[d.seller_id]?.seller_type ?? null,
        })),
      });
    }

    if (action === "upload") {
      if (!seller?.id) return json({ error: "To konto nie jest sprzedawcą" }, 403);
      if (seller.seller_type === "private_partner") return json({ error: "Sprzedaż prywatna nie korzysta z modułu faktur" }, 403);
      const access = await orderAccess(orderId);
      if (!access.seller) return json({ error: "To zamówienie nie zawiera Twoich pozycji" }, 403);
      if (!file) return json({ error: "Wybierz plik PDF" }, 400);
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return json({ error: "Dozwolone są tylko pliki PDF" }, 400);
      if (file.size > MAX_BYTES) return json({ error: "Plik może mieć maksymalnie 10 MB" }, 400);
      if (!TYPES.has(documentType)) return json({ error: "Nieprawidłowy typ dokumentu" }, 400);

      const id = crypto.randomUUID();
      const path = `${seller.id}/${orderId}/${id}.pdf`;
      const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      const { data: row, error: insertError } = await sb.from("sales_documents").insert({
        id,
        order_id: orderId,
        seller_id: seller.id,
        document_type: documentType,
        source: "manual",
        status: "available",
        document_number: documentNumber,
        issued_at: issuedAt,
        storage_path: path,
        file_name: safeName(file.name),
        mime_type: "application/pdf",
        integration_status: "manual_uploaded",
        created_by: user.id,
      }).select("id,document_type,source,status,document_number,issued_at,file_name,created_at").single();
      if (insertError) {
        await sb.storage.from(BUCKET).remove([path]);
        throw insertError;
      }
      return json({ ok: true, document: row });
    }

    if (action === "download") {
      if (!documentId) return json({ error: "Brak dokumentu" }, 400);
      const { data: doc, error: docError } = await sb.from("sales_documents")
        .select("id,order_id,seller_id,storage_path,file_name,status")
        .eq("id", documentId)
        .maybeSingle();
      if (docError) throw docError;
      if (!doc || doc.status !== "available") return json({ error: "Dokument niedostępny" }, 404);
      const access = await orderAccess(doc.order_id);
      if (!access.buyer && !(access.seller && seller?.id === doc.seller_id)) return json({ error: "Brak dostępu do dokumentu" }, 403);
      const { data: signed, error: signedError } = await sb.storage.from(BUCKET).createSignedUrl(doc.storage_path, 120, { download: doc.file_name });
      if (signedError) throw signedError;
      return json({ url: signed.signedUrl, expires_in: 120 });
    }

    return json({ error: "Nieznana akcja" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
