const HEIC_RE = /\.(heic|heif)(?:\?|$)/i;

export function isHeicUrl(url: string | null | undefined): boolean {
  return Boolean(url && HEIC_RE.test(url));
}

/**
 * Zdjęcia ze Storage serwujemy przez transformację Supabase (/render/image):
 *  • zmniejsza plik do potrzebnego rozmiaru (miniatura nie ciągnie 3 MB oryginału),
 *  • przekodowuje formaty, których przeglądarki nie wyświetlają (HEIC/HEIF z iPhone'a).
 * UWAGA (2026-09-06): przy samym `width` transformacja gubi proporcje przy plikach HEIC
 * (4032×3024 wychodziło jako 2000×4284 — rozciągnięte zdjęcie). Dlatego ZAWSZE podajemy
 * `width` + `height` + `resize=contain` (kwadratowe pole, całe zdjęcie w środku, bez zniekształceń).
 */
export function displayImageUrl(url: string | null | undefined, width = 1600, height?: number): string {
  if (!url) return "";
  const isObject = url.includes("/storage/v1/object/public/");
  const isRender = url.includes("/storage/v1/render/image/public/");
  if (!isObject && !isRender) return url;

  const maxRender = 1800;
  const clamp = (n: number) => Math.min(maxRender, Math.max(64, Math.round(n)));
  const base = (isObject ? url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") : url).split("?")[0];
  return `${base}?width=${clamp(width)}&height=${clamp(height ?? width)}&resize=contain&quality=84`;
}
