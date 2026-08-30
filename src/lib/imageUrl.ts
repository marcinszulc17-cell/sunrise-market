const HEIC_RE = /\.(heic|heif)(?:\?|$)/i;

export function isHeicUrl(url: string | null | undefined): boolean {
  return Boolean(url && HEIC_RE.test(url));
}

/**
 * Keep the original Storage URL in the database, but render HEIC/HEIF files
 * through Supabase Image Transformations so browsers receive a web-friendly image.
 * Use a square contain box by default. This avoids crop and avoids imposing a 4:3
 * presentation box on portrait/panorama images such as cockpit photos.
 */
export function displayImageUrl(url: string | null | undefined, width = 1600, height?: number): string {
  if (!url) return "";
  if (!isHeicUrl(url)) return url;
  if (!url.includes("/storage/v1/object/public/")) return url;

  const rendered = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  );
  const w = Math.max(64, Math.round(width));
  const h = Math.max(64, Math.round(height ?? width));
  const separator = rendered.includes("?") ? "&" : "?";
  return `${rendered}${separator}width=${w}&height=${h}&resize=contain&quality=85`;
}
