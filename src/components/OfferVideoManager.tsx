// Film przy ofercie — wgranie, podgląd, usunięcie.
//
// DLACZEGO JEDEN FILM, 60 SEKUND I 50 MB
// Każde odtworzenie to pobranie całego pliku, a pakiet transferu (250 GB/mies.)
// jest wspólny dla Sunrise Market i MySunrise. Jeden nieograniczony plik obejrzany
// kilkaset razy zjadłby miesiąc obu platformom naraz. Do tego kupujący ogląda to
// najczęściej na telefonie, w terenie — film, który ładuje się pół minuty, jest
// gorszy niż brak filmu.
//
// Limity są egzekwowane w trzech miejscach, świadomie: tutaj (zrozumiały komunikat),
// w kodzie wysyłki (uploadProductVideo) i na koszu w bazie (twardy limit 50 MB).
import { useRef, useState } from "react";
import { uploadProductVideo, setOfferVideo, removeOfferVideo, VIDEO_MAX_MB, VIDEO_MAX_SEC } from "../lib/api";

type Props = {
  offerId: string;
  film: { url: string; poster: string | null } | null;
  onChange: (film: { url: string; poster: string | null } | null) => void;
};

export default function OfferVideoManager({ offerId, film, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function wgraj(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const up = await uploadProductVideo(f);
      await setOfferVideo(offerId, up.url, up.poster);
      onChange(up);
      setMsg(up.poster
        ? "Film dodany. Klient zobaczy miniaturę, a film pobierze się dopiero po kliknięciu."
        : "Film dodany. Nie udało się wyciąć miniatury — galeria pokaże pierwsze zdjęcie oferty.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function usun() {
    setBusy(true); setMsg(null);
    try { await removeOfferVideo(offerId); onChange(null); setMsg("Film usunięty."); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">🎬 Film produktu</div>
          <div className="text-xs" style={{ color: "var(--mut)" }}>
            Nieobowiązkowy. Jeden film na ofertę, do {VIDEO_MAX_SEC} sekund i {VIDEO_MAX_MB} MB, w formacie MP4 lub WEBM.
          </div>
        </div>
        {film && !busy && (
          <button onClick={usun} className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ border: "1px solid rgba(239,68,68,.35)", color: "#fca5a5" }}>
            Usuń film
          </button>
        )}
      </div>

      {film ? (
        <video src={film.url} poster={film.poster ?? undefined} controls playsInline preload="none"
          className="mt-3 w-full rounded-xl bg-black" style={{ maxHeight: 260 }} />
      ) : (
        <div className="mt-3">
          <input ref={input} type="file" accept="video/mp4,video/webm" disabled={busy}
            onChange={(e) => wgraj(e.target.files)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-4 file:py-2 file:font-semibold" />
          <p className="mt-2 text-xs leading-5" style={{ color: "var(--mut)" }}>
            Film z iPhone'a zapisuje się jako <strong>.mov</strong> — wyeksportuj go jako MP4.
            Plik .mov odtworzy się na iPhonie, ale u części kupujących na Androidzie
            zostanie czarny prostokąt i nikt im nie wyjaśni dlaczego.
          </p>
        </div>
      )}

      {busy && <p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Wysyłam film… przy większym pliku to może potrwać minutę.</p>}
      {msg && <p className="mt-2 text-sm" style={{ color: "var(--gold)" }}>{msg}</p>}
    </div>
  );
}
