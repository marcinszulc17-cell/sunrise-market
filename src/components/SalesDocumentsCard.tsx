import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type SalesDocument = {
  id: string;
  document_type: string;
  source: "manual" | "sunrise_studio" | "external";
  document_number: string | null;
  issued_at: string | null;
  file_name: string;
  seller_name?: string;
  seller_type?: string | null;
  created_at: string;
};

type Props = {
  orderId: string;
  mode: "seller" | "buyer";
  allowUpload?: boolean;
  invoiceRequested?: boolean;
};

const typeLabel: Record<string, string> = {
  invoice: "Faktura",
  correction: "Korekta",
  sale_confirmation: "Potwierdzenie sprzedaży",
  receipt: "Paragon / rachunek",
  other: "Inny dokument",
};

export default function SalesDocumentsCard({ orderId, mode, allowUpload = false, invoiceRequested = false }: Props) {
  const [docs, setDocs] = useState<SalesDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("invoice");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");

  async function load() {
    setLoading(true);
    const { data, error: invokeError } = await supabase.functions.invoke("sales-documents", {
      body: { action: "list", order_id: orderId },
    });
    if (invokeError || data?.error) setError(data?.error ?? invokeError?.message ?? "Nie udało się pobrać dokumentów.");
    else {
      setDocs((data?.documents ?? []) as SalesDocument[]);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [orderId]);

  async function download(documentId: string) {
    const { data, error: invokeError } = await supabase.functions.invoke("sales-documents", {
      body: { action: "download", document_id: documentId },
    });
    if (invokeError || data?.error || !data?.url) {
      setError(data?.error ?? invokeError?.message ?? "Nie udało się pobrać dokumentu.");
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  async function upload() {
    if (!file) { setError("Wybierz plik PDF."); return; }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setError("Dozwolone są tylko pliki PDF."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Plik może mieć maksymalnie 10 MB."); return; }

    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("action", "upload");
    form.append("order_id", orderId);
    form.append("document_type", documentType);
    if (documentNumber.trim()) form.append("document_number", documentNumber.trim());
    if (issuedAt) form.append("issued_at", issuedAt);
    form.append("file", file);

    const { data, error: invokeError } = await supabase.functions.invoke("sales-documents", { body: form });
    setUploading(false);
    if (invokeError || data?.error) {
      setError(data?.error ?? invokeError?.message ?? "Nie udało się dodać dokumentu.");
      return;
    }
    setFile(null);
    setDocumentNumber("");
    setIssuedAt("");
    setShowForm(false);
    await load();
  }

  if (mode === "buyer" && !loading && docs.length === 0 && !invoiceRequested) return null;

  return <section className="mt-4 rounded-xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-semibold">Dokumenty sprzedaży</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>
          {mode === "seller"
            ? allowUpload
              ? "Dodaj dokument wystawiony w swoim programie. Sunrise Market nie wystawia faktury za Ciebie."
              : "Przy sprzedaży prywatnej nie wymagamy faktury. Dokumenty pojawią się tutaj tylko wtedy, gdy będą dotyczyć tej transakcji."
            : "Dokumenty udostępnione przez sprzedawców tego zamówienia."}
        </div>
      </div>
      {mode === "seller" && allowUpload && <button onClick={() => setShowForm(v => !v)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ border: "1px solid var(--line)", color: "var(--gold)" }}>
        {showForm ? "Anuluj" : "+ Dodaj dokument"}
      </button>}
    </div>

    {invoiceRequested && docs.length === 0 && <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(200,150,90,.08)", border: "1px solid rgba(200,150,90,.24)", color: "var(--gold)" }}>
      {mode === "seller" && allowUpload ? "Klient podał dane do faktury — dokument możesz wystawić w swoim programie i dodać tutaj jako PDF." : mode === "buyer" ? "Dane do faktury zostały przekazane sprzedawcy. Dokument nie został jeszcze dodany do zamówienia." : "Sprzedaż prywatna — dane do faktury nie tworzą automatycznie obowiązku wystawienia faktury przez prywatnego sprzedawcę."}
    </div>}

    {showForm && allowUpload && <div className="mt-4 grid gap-3 rounded-xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Typ dokumentu
          <select value={documentType} onChange={e => setDocumentType(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
            <option value="invoice">Faktura</option>
            <option value="correction">Korekta</option>
            <option value="sale_confirmation">Potwierdzenie sprzedaży</option>
            <option value="receipt">Paragon / rachunek</option>
            <option value="other">Inny dokument</option>
          </select>
        </label>
        <label className="text-xs">Numer dokumentu — opcjonalnie
          <input value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} placeholder="np. FV/09/2026/12" />
        </label>
        <label className="text-xs">Data wystawienia — opcjonalnie
          <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} />
        </label>
        <label className="text-xs">PDF — maks. 10 MB
          <input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
        </label>
      </div>
      <div><button disabled={uploading || !file} onClick={upload} className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--gold)", color: "#17120c" }}>{uploading ? "Dodawanie…" : "Udostępnij klientowi"}</button></div>
    </div>}

    {error && <div className="mt-3 text-xs" style={{ color: "#fca5a5" }}>{error}</div>}
    {loading && <div className="mt-3 text-xs" style={{ color: "var(--mut)" }}>Ładowanie dokumentów…</div>}

    {!loading && docs.length > 0 && <div className="mt-4 space-y-2">
      {docs.map(doc => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div className="min-w-0">
          <div className="text-sm font-medium">{typeLabel[doc.document_type] ?? "Dokument"}{doc.document_number ? ` · ${doc.document_number}` : ""}</div>
          <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>
            {mode === "buyer" && doc.seller_name ? `${doc.seller_name} · ` : ""}{doc.issued_at ? `wystawiono ${new Date(`${doc.issued_at}T12:00:00`).toLocaleDateString("pl-PL")} · ` : ""}{doc.source === "sunrise_studio" ? "Sunrise Studio" : doc.source === "manual" ? "dodane przez sprzedawcę" : "system zewnętrzny"}
          </div>
        </div>
        <button onClick={() => download(doc.id)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ border: "1px solid var(--line)", color: "var(--gold)" }}>Pobierz PDF</button>
      </div>)}
    </div>}
  </section>;
}
