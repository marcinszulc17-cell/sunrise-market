// Opis oferty z prostym formatowaniem tekstu (bez HTML od sprzedawcy/dostawcy):
//  - akapity rozdzielone pustą linią,
//  - krótka samotna linia przed kolejnym blokiem = nagłówek sekcji,
//  - blok linii zaczynających się od „•” / „-” = lista punktowana,
//  - blok linii „Klucz: wartość” = tabela parametrów,
//  - pozostałe pojedyncze nowe linie są zachowane (whitespace-pre-line).
// Wcześniej każdy blok szedł do <p>, więc listy i parametry zlewały się w jeden wiersz.

export type DescBlock =
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; rows: [string, string][] }
  | { kind: "para"; text: string };

const BULLET = /^\s*[•\-–]\s+/;
const KV = /^([^:\n]{1,80}):\s+(.+)$/;

export function parseDescription(text: string): DescBlock[] {
  const raw = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: DescBlock[] = [];
  raw.forEach((block, i) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 1 && i < raw.length - 1 && lines[0].length <= 48 && !/[.:;!?]$/.test(lines[0]) && !BULLET.test(lines[0])) {
      out.push({ kind: "heading", text: lines[0] });
    } else if (lines.every((l) => BULLET.test(l))) {
      out.push({ kind: "list", items: lines.map((l) => l.replace(BULLET, "")) });
    } else if (lines.length >= 2 && lines.every((l) => KV.test(l))) {
      out.push({ kind: "table", rows: lines.map((l) => { const m = l.match(KV)!; return [m[1].trim(), m[2].trim()] as [string, string]; }) });
    } else {
      out.push({ kind: "para", text: lines.join("\n") });
    }
  });
  return out;
}

export default function RichDescription({ text }: { text: string }) {
  const blocks = parseDescription(text);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {blocks.map((b, i) => {
        if (b.kind === "heading") return <h3 key={i} className="mt-2 text-base font-bold" style={{ color: "var(--ink)" }}>{b.text}</h3>;
        if (b.kind === "list") return (
          <ul key={i} className="flex flex-col gap-1.5">
            {b.items.map((it, j) => <li key={j} className="flex gap-2 leading-relaxed"><span style={{ color: "var(--gold)" }}>•</span><span>{it}</span></li>)}
          </ul>
        );
        if (b.kind === "table") return (
          <div key={i} className="overflow-hidden rounded-xl text-sm" style={{ border: "1px solid var(--line)" }}>
            {b.rows.map(([k, v], j) => (
              <div key={j} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 py-2" style={{ background: j % 2 ? "transparent" : "var(--glass)", borderTop: j ? "1px solid var(--line)" : undefined }}>
                <span style={{ color: "var(--mut)" }}>{k}</span>
                <span className="text-right font-medium break-words">{v}</span>
              </div>
            ))}
          </div>
        );
        return <p key={i} className="whitespace-pre-line leading-relaxed" style={{ color: "var(--ink)" }}>{b.text}</p>;
      })}
    </div>
  );
}

type Doc = { name?: string; title?: string; url?: string };

/** Karty katalogowe, instrukcje i deklaracje dołączone do oferty (`attributes.documents`). */
export function OfferDocuments({ docs }: { docs: unknown }) {
  const list = (Array.isArray(docs) ? docs : []).filter((d: Doc) => typeof d?.url === "string" && /^https:\/\//.test(d.url!)) as Doc[];
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((d, i) => (
        <li key={i}>
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <span aria-hidden>📄</span>
            <span className="flex-1">{d.title || d.name || "Dokument PDF"}</span>
            <span className="text-xs" style={{ color: "var(--mut)" }}>PDF ↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
