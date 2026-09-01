import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type SalesDocument = {
  id: string;
  order_id: string;
  seller_id: string;
  seller_name?: string;
  seller_type?: string | null;
  document_type: string;
  source: "manual" | "sunrise_studio" | "external";
  status: string;
  document_number: string | null;
  issued_at: string | null;
  file_name: string | null;
  external_provider: string | null;
  integration_status: string | null;
  created_at: string;
};

type Props = {
  orderId: string;
  mode: "seller" | "buyer";
  invoiceRequested?: boolean;
  allowUpload?: boolean;
};

const typeLabel: Record<string, string> = {
  invoice: "Faktura",
  correction: "Korekta",
  sale_confirmation: "Potwierdzenie sprzedaży",
  receipt: "Paragon / potwierdzenie",
  other: "Inny dokument",
};

const sourceLabel: Record<string, string> = {
  manual: "dodany przez sprzedawcę",
  sunrise_studio: "Sunrise Studio",
  external: "system zewnętrzny",
};

export default function SalesDocumentsPanel({ orderId, mode, invoiceRequested = false, allowUpload = true }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState(invoiceRequested ? "invoice" : "sale_confirmation");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { setDocumentType(invoiceRequested ? "invoice" : "sale_confirmation"); }, [invoiceRequested]);

  async function load() {
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke("sales-documents", {
      body: { action: "list", order_id: orderId },
    });
    if (error || data?.error) {
      setMessage(data?.error ?? error?.message ?? "Nie udało się pobrać dokumentów.");
      setDocuments([]);
    } else {
      setDocuments((data?.documents ?? []) as SalesDocument[]);
      setLoaded(true);
    }
    setLoading(false);
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) await load();
  }

  async function upload() {
    if (!allowUpload) { setMessage("Sprzedaż prywatna nie korzysta z modułu faktur."); return; }
    if (!file) { setMessage("Wybierz plik PDF."); return; }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setMessage("Dozwolone są tylko pliki PDF."); return; }
    if (file.size > 10 * 1024 * 1024) { setMessage("Plik może mieć maksymalnie 10 MB."); return; }

    setUploading(true);
    setMessage(null);
    const form = new FormData();
    form.append("action", "upload");
    form.append("order_id", orderId);
    form.append("document_type", documentType);
    if (documentNumber.trim()) form.append("document_number", documentNumber.trim());
    if (issuedAt) form.append("issued_at", issuedAt);
    form.append("file", file);

    const { data, error } = await supabase.functions.invoke("sales-documents", { body: form });
    setUploading(false);
    if (error || data?.error) {
      setMessage(data?.error ?? error?.message ?? "Nie udało się dodać dokumentu.");
      return;
    }
    setFile(null);
    setDocumentNumber("");
    setIssuedAt("");
    setAdding(false);
    setMessage("Dokument został bezpiecznie dodany do zamówienia.");
    await load();
  }

  async function download(documentId: string) {
    setDownloading(documentId);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke("sales-documents", {
      body: { action: "download", document_id: documentId },
    });
    setDownloading(null);
    if (error || data?.error || !data?.url) {
      setMessage(data?.error ?? error?.message ?? "Nie udało się otworzyć dokumentu.");
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  return <section className="mt-4 rounded-xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
    <button type="button" onClick={toggle} className="flex w-full items-start justify-between gap-3 text-left">
      <div>
        <div className="font-semibold">📄 Dokumenty sprzedaży</div>
        <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>
          {mode === "seller"
            ? allowUpload
              ? invoiceRequested
                ? "Klient podał dane do faktury. Wystaw dokument w swoim programie i dodaj tutaj gotowy PDF."
                : "Sunrise Market nie wystawia dokumentów za Ciebie. Możesz przekazać klientowi gotowy dokument PDF."
              : "To sprzedaż prywatna. Sunrise Market nie wymaga od Ciebie wystawienia faktury."
            : invoiceRequested
              ? "Jeśli sprzedawca wystawi dokument, będzie dostępny tutaj."
              : "Tutaj pojawią się dokumenty przekazane przez sprzedawcę."}
        </div>
      </div>
      <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--gold)" }}>{open ? "Ukryj" : "Pokaż"}</span>
    </button>

    {open && <div className="mt-4">
      {message && <div className="mb-3 text-xs" style={{ color: message.startsWith("Dokument został") ? "var(--green)" : "#fca5a5" }}>{message}</div>}

      {mode === "seller" && allowUpload && <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => setAdding(v => !v)} className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ border: "1px solid var(--line)", background: "var(--glass)" }}>
          {adding ? "Anuluj" : "+ Dodaj dokument PDF"}
        </button>
      </div>}

      {mode === "seller" && allowUpload && adding && <div className="mb-4 grid gap-3 rounded-xl p-4 sm:grid-cols-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <label className="text-xs">Typ dokumentu
          <select value={documentType} onChange={e => setDocumentType(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }}>
            <option value="invoice">Faktura</option>
            <option value="correction">Korekta</option>
            <option value="sale_confirmation">Potwierdzenie sprzedaży</option>
            <option value="receipt">Paragon / potwierdzenie</option>
            <option value="other">Inny dokument</option>
          </select>
        </label>
        <label className="text-xs">Numer dokumentu <span style={{ color: "var(--mut)" }}>(opcjonalnie)</span>
          <input value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }} placeholder="np. FV/09/2026/123" />
        </label>
        <label className="text-xs">Data wystawienia <span style={{ color: "var(--mut)" }}>(opcjonalnie)</span>
          <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }} />
        </label>
        <label className="text-xs">Plik PDF · maks. 10 MB
          <input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
        </label>
        <div className="sm:col-span-2 flex justify-end">
          <button type="button" disabled={uploading || !file} onClick={upload} className="rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C9965A,#E7C27D)" }}>
            {uploading ? "Dodawanie…" : "Dodaj do zamówienia"}
          </button>
        </div>
        <div className="sm:col-span-2 text-[11px]" style={{ color: "var(--mut)" }}>
          Dokument przygotowujesz we własnym programie. Sunrise Market tylko bezpiecznie udostępnia go klientowi. Po podłączeniu Sunrise Studio ten sam widok będzie mógł uzupełniać się automatycznie.
        </div>
      </div>}

      <div className="space-y-2">
        {loading && <div className="text-xs" style={{ color: "var(--mut)" }}>Ładowanie dokumentów…</div>}
        {!loading && loaded && documents.length === 0 && <div className="text-xs" style={{ color: "var(--mut)" }}>{allowUpload && invoiceRequested ? "Dokument nie został jeszcze dodany." : "Brak dokumentów przy tym zamówieniu."}</div>}
        {documents.map(doc => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{typeLabel[doc.document_type] ?? "Dokument"}{doc.document_number ? ` · ${doc.document_number}` : ""}</div>
            <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>
              {mode === "buyer" && doc.seller_name ? `${doc.seller_name} · ` : ""}{sourceLabel[doc.source] ?? doc.source}{doc.issued_at ? ` · ${new Date(`${doc.issued_at}T00:00:00`).toLocaleDateString("pl-PL")}` : ""}
            </div>
          </div>
          <button type="button" disabled={downloading === doc.id} onClick={() => download(doc.id)} className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ border: "1px solid var(--line)" }}>
            {downloading === doc.id ? "Otwieranie…" : "Pobierz PDF"}
          </button>
        </div>)}
      </div>
    </div>}
  </section>;
}
