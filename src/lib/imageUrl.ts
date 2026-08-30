const HEIC_RE = /\.(heic|heif)(?:\?|$)/i;

export function isHeicUrl(url: string | null | undefined): boolean {
  return Boolean(url && HEIC_RE.test(url));
}

/**
 * Keep the original Storage URL in the database, but render HEIC/HEIF files
 * through Supabase Image Transformations so browsers receive a web-friendly image.
 * A square contain box preserves the whole frame. We also cap render dimensions
 * so fullscreen zoom does not ask mobile browsers to decode unnecessarily huge HEIC variants.
 */
export function displayImageUrl(url: string | null | undefined, width = 1600, height?: number): string {
  if (!url) return "";
  if (!isHeicUrl(url)) return url;
  if (!url.includes("/storage/v1/object/public/")) return url;

  const rendered = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  );
  const maxRender = 1800;
  const w = Math.min(maxRender, Math.max(64, Math.round(width)));
  const h = Math.min(maxRender, Math.max(64, Math.round(height ?? width)));
  const separator = rendered.includes("?") ? "&" : "?";
  return `${rendered}${separator}width=${w}&height=${h}&resize=contain&quality=84`;
}
