const HEIC_RE = /\.(heic|heif)(?:\?|$)/i;

export function isHeicUrl(url: string | null | undefined): boolean {
  return Boolean(url && HEIC_RE.test(url));
}

/**
 * Zdjęcia ze Storage serwujemy przez transformację Supabase (/render/image):
 *  • przekodowuje formaty, których przeglądarki nie wyświetlają (HEIC/HEIF z iPhone'a),
 *  • zmniejsza plik do potrzebnego rozmiaru (miniatura nie ciągnie 3 MB oryginału).
 * Adres w bazie zostaje oryginalny; tu tylko budujemy adres do wyświetlenia.
 */
export function displayImageUrl(url: string | null | undefined, width = 1600, height?: number): string {
  if (!url) return "";
  const isObject = url.includes("/storage/v1/object/public/");
  const isRender = url.includes("/storage/v1/render/image/public/");
  if (!isObject && !isRender) return url;

  const maxRender = 1800;
  const w = Math.min(maxRender, Math.max(64, Math.round(width)));
  const base = (isObject ? url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") : url).split("?")[0];
  const q = new URLSearchParams({ width: String(w), quality: "84" });
  if (height) { q.set("height", String(Math.min(maxRender, Math.max(64, Math.round(height))))); q.set("resize", "contain"); }
  return `${base}?${q}`;
}
