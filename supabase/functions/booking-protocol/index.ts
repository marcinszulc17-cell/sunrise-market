import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "booking-protocols";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const BUYER_FIELDS = [
  "id", "status", "resource_kind",
  "handover_at", "handover_odometer", "handover_fuel_percent", "handover_condition", "handover_notes", "handover_kit_complete",
  "return_at", "return_odometer", "return_fuel_percent", "return_condition", "return_notes", "return_kit_complete",
  "damage_found", "damage_note", "deposit_decision", "deposit_retained_requested_gross", "deposit_decision_note",
  "handover_buyer_status", "handover_buyer_responded_at", "handover_buyer_note",
  "return_buyer_status", "return_buyer_responded_at", "return_buyer_note",
].join(",");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "zdjecie.jpg";
}
function numOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function boolOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return value === true || value === "true" || value === 1 || value === "1";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
  if (!serviceKey) return json({ ok: false, error: "server_config" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "unauthorized" }, 401);

  const sb = createClient(url, serviceKey, { db: { schema: "market" } });

  async function getSeller() {
    const { data } = await sb.from("sellers").select("id").eq("auth_user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
    if (!user.email) return null;
    const { data: byEmail } = await sb.from("sellers").select("id").is("auth_user_id", null).ilike("email", user.email).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return byEmail?.id as string | undefined ?? null;
  }

  async function bookingAccess(bookingId: string) {
    const sellerId = await getSeller();
    const { data: booking } = await sb.from("bookings").select("id,seller_id,buyer_id,resource_id,booking_type,status,deposit_gross,deposit_status,ends_at").eq("id", bookingId).maybeSingle();
    if (!booking) return { booking: null, sellerId, seller: false, buyer: false, resourceKind: null as string | null };
    let resourceKind: string | null = null;
    if (booking.resource_id) {
      const { data: resource } = await sb.from("booking_resources").select("kind").eq("id", booking.resource_id).maybeSingle();
      resourceKind = (resource?.kind as string | undefined) ?? null;
    }
    return { booking, sellerId, seller: !!sellerId && booking.seller_id === sellerId, buyer: booking.buyer_id === user.id, resourceKind };
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let action = "get";
    let bookingId = "";
    let phase = "handover";
    let photoId = "";
    let payload: Record<string, unknown> = {};
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      action = String(form.get("action") ?? "upload_photo");
      bookingId = String(form.get("booking_id") ?? "");
      phase = String(form.get("phase") ?? "handover");
      const candidate = form.get("file");
      file = candidate instanceof File ? candidate : null;
    } else {
      const body = await req.json().catch(() => ({}));
      action = String(body?.action ?? "get");
      bookingId = String(body?.booking_id ?? "");
      phase = String(body?.phase ?? "handover");
      photoId = String(body?.photo_id ?? "");
      payload = (body?.payload && typeof body.payload === "object") ? body.payload as Record<string, unknown> : {};
    }

    if (!bookingId) return json({ ok: false, error: "missing_booking" }, 400);
    const access = await bookingAccess(bookingId);
    if (!access.booking || (!access.seller && !access.buyer)) return json({ ok: false, error: "forbidden" }, 403);

    if (action === "get") {
      const selectFields = access.seller ? "*" : BUYER_FIELDS;
      const { data: protocol, error: protocolError } = await sb.from("booking_handover_protocols").select(selectFields).eq("booking_id", bookingId).maybeSingle();
      if (protocolError) throw protocolError;
      if (protocol && !protocol.resource_kind && access.resourceKind) protocol.resource_kind = access.resourceKind;
      const { data: photos, error: photosError } = await sb.from("booking_protocol_photos").select("id,phase,file_name,mime_type,created_at").eq("booking_id", bookingId).order("created_at");
      if (photosError) throw photosError;
      return json({ ok: true, protocol: protocol ?? null, photos: photos ?? [], can_edit: access.seller, can_respond: access.buyer });
    }

    if (action === "buyer_respond") {
      if (!access.buyer) return json({ ok: false, error: "buyer_only" }, 403);
      if (access.booking.booking_type !== "daily") return json({ ok: false, error: "rental_only" }, 400);
      if (!["handover", "return"].includes(phase)) return json({ ok: false, error: "invalid_phase" }, 400);
      const response = String(payload.status ?? "");
      if (!["acknowledged", "disputed"].includes(response)) return json({ ok: false, error: "invalid_response" }, 400);
      const note = String(payload.note ?? "").trim().slice(0, 2000);
      if (response === "disputed" && note.length < 3) return json({ ok: false, error: "dispute_note_required" }, 400);

      const { data: protocol, error: protocolError } = await sb.from("booking_handover_protocols").select("id,handover_at,return_at,handover_buyer_status,return_buyer_status").eq("booking_id", bookingId).maybeSingle();
      if (protocolError) throw protocolError;
      if (!protocol) return json({ ok: false, error: "protocol_not_ready" }, 409);
      const phaseAt = phase === "handover" ? protocol.handover_at : protocol.return_at;
      const current = phase === "handover" ? protocol.handover_buyer_status : protocol.return_buyer_status;
      if (!phaseAt) return json({ ok: false, error: "phase_not_ready" }, 409);
      if (current !== "pending") return json({ ok: false, error: "already_responded" }, 409);

      const now = new Date().toISOString();
      const patch = phase === "handover" ? {
        handover_buyer_status: response,
        handover_buyer_responded_at: now,
        handover_buyer_responded_by: user.id,
        handover_buyer_note: note || null,
        updated_at: now,
      } : {
        return_buyer_status: response,
        return_buyer_responded_at: now,
        return_buyer_responded_by: user.id,
        return_buyer_note: note || null,
        updated_at: now,
      };
      const { data, error } = await sb.from("booking_handover_protocols").update(patch).eq("id", protocol.id).select(BUYER_FIELDS).single();
      if (error) throw error;
      if (data && !data.resource_kind && access.resourceKind) data.resource_kind = access.resourceKind;
      return json({ ok: true, protocol: data });
    }

    if (!access.seller) return json({ ok: false, error: "seller_only" }, 403);

    async function ensureProtocol() {
      const { data: existing } = await sb.from("booking_handover_protocols").select("*").eq("booking_id", bookingId).maybeSingle();
      if (existing) return existing;
      const { data: created, error } = await sb.from("booking_handover_protocols").insert({
        booking_id: bookingId,
        seller_id: access.booking!.seller_id,
        buyer_id: access.booking!.buyer_id,
        resource_id: access.booking!.resource_id,
        resource_kind: access.resourceKind,
        created_by: user.id,
        updated_by: user.id,
      }).select("*").single();
      if (error) throw error;
      return created;
    }

    if (action === "save_handover" || action === "save_return") {
      const protocol = await ensureProtocol();
      const isHandover = action === "save_handover";
      const buyerResponse = isHandover ? protocol.handover_buyer_status : protocol.return_buyer_status;
      if (buyerResponse && buyerResponse !== "pending") return json({ ok: false, error: "buyer_response_locked" }, 409);
      const patch: Record<string, unknown> = {
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        resource_kind: protocol.resource_kind ?? access.resourceKind,
      };
      if (isHandover) {
        patch.status = protocol.status === "draft" ? "issued" : protocol.status;
        patch.handover_at = payload.handover_at ? String(payload.handover_at) : protocol.handover_at ?? new Date().toISOString();
        patch.handover_odometer = numOrNull(payload.handover_odometer);
        patch.handover_fuel_percent = numOrNull(payload.handover_fuel_percent);
        patch.handover_condition = String(payload.handover_condition ?? "").slice(0, 4000) || null;
        patch.handover_notes = String(payload.handover_notes ?? "").slice(0, 4000) || null;
        patch.handover_kit_complete = boolOrNull(payload.handover_kit_complete);
      } else {
        patch.status = "returned";
        patch.return_at = payload.return_at ? String(payload.return_at) : new Date().toISOString();
        patch.return_odometer = numOrNull(payload.return_odometer);
        patch.return_fuel_percent = numOrNull(payload.return_fuel_percent);
        patch.return_condition = String(payload.return_condition ?? "").slice(0, 4000) || null;
        patch.return_notes = String(payload.return_notes ?? "").slice(0, 4000) || null;
        patch.return_kit_complete = boolOrNull(payload.return_kit_complete);
        patch.damage_found = Boolean(payload.damage_found);
        patch.damage_note = String(payload.damage_note ?? "").slice(0, 4000) || null;
      }
      const { data, error } = await sb.from("booking_handover_protocols").update(patch).eq("id", protocol.id).select("*").single();
      if (error) throw error;
      return json({ ok: true, protocol: data });
    }

    if (action === "save_deposit_decision") {
      const protocol = await ensureProtocol();
      const decision = String(payload.deposit_decision ?? "pending");
      if (!["pending", "refund", "partial", "retain"].includes(decision)) return json({ ok: false, error: "invalid_decision" }, 400);
      const requested = numOrNull(payload.deposit_retained_requested_gross) ?? 0;
      const deposit = Number(access.booking.deposit_gross ?? 0);
      if (requested < 0 || requested > deposit) return json({ ok: false, error: "invalid_amount" }, 400);
      const { data, error } = await sb.from("booking_handover_protocols").update({
        deposit_decision: decision,
        deposit_retained_requested_gross: requested,
        deposit_decision_note: String(payload.deposit_decision_note ?? "").slice(0, 4000) || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }).eq("id", protocol.id).select("*").single();
      if (error) throw error;
      return json({ ok: true, protocol: data });
    }

    if (action === "upload_photo") {
      if (!file) return json({ ok: false, error: "missing_file" }, 400);
      if (!ALLOWED.has(file.type)) return json({ ok: false, error: "invalid_file_type" }, 400);
      if (file.size > MAX_BYTES) return json({ ok: false, error: "file_too_large" }, 400);
      if (!["handover", "return"].includes(phase)) return json({ ok: false, error: "invalid_phase" }, 400);
      const protocol = await ensureProtocol();
      const buyerResponse = phase === "handover" ? protocol.handover_buyer_status : protocol.return_buyer_status;
      if (buyerResponse && buyerResponse !== "pending") return json({ ok: false, error: "buyer_response_locked" }, 409);
      const id = crypto.randomUUID();
      const ext = (safeName(file.name).split(".").pop() || "jpg").toLowerCase();
      const path = `${access.booking.seller_id}/${bookingId}/${phase}/${id}.${ext}`;
      const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data, error } = await sb.from("booking_protocol_photos").insert({
        id,
        protocol_id: protocol.id,
        booking_id: bookingId,
        phase,
        storage_path: path,
        file_name: safeName(file.name),
        mime_type: file.type,
        created_by: user.id,
      }).select("id,phase,file_name,mime_type,created_at").single();
      if (error) {
        await sb.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return json({ ok: true, photo: data });
    }

    if (action === "photo_url") {
      if (!photoId) return json({ ok: false, error: "missing_photo" }, 400);
      const { data: photo, error } = await sb.from("booking_protocol_photos").select("id,booking_id,storage_path").eq("id", photoId).eq("booking_id", bookingId).maybeSingle();
      if (error) throw error;
      if (!photo) return json({ ok: false, error: "not_found" }, 404);
      const { data: signed, error: signedError } = await sb.storage.from(BUCKET).createSignedUrl(photo.storage_path, 120);
      if (signedError) throw signedError;
      return json({ ok: true, url: signed.signedUrl, expires_in: 120 });
    }

    if (action === "delete_photo") {
      if (!photoId) return json({ ok: false, error: "missing_photo" }, 400);
      const { data: photo, error } = await sb.from("booking_protocol_photos").select("id,booking_id,storage_path,phase").eq("id", photoId).eq("booking_id", bookingId).maybeSingle();
      if (error) throw error;
      if (!photo) return json({ ok: true });
      const protocol = await ensureProtocol();
      const buyerResponse = photo.phase === "handover" ? protocol.handover_buyer_status : protocol.return_buyer_status;
      if (buyerResponse && buyerResponse !== "pending") return json({ ok: false, error: "buyer_response_locked" }, 409);
      await sb.storage.from(BUCKET).remove([photo.storage_path]);
      const { error: deleteError } = await sb.from("booking_protocol_photos").delete().eq("id", photoId);
      if (deleteError) throw deleteError;
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (error) {
    return json({ ok: false, error: String((error as Error).message ?? error) }, 400);
  }
});
