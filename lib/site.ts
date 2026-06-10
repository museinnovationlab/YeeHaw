// Central site identity. URLs come from SITE_URL (set in Vercel / .env.local) so
// sitemap, RSS, canonical tags and JSON-LD all agree and switch over to the real
// domain automatically once SITE_URL is updated post-transfer.
//
// Tolerate a scheme-less value (e.g. "yee-haw.vercel.app") — `new URL()` in the
// metadata config throws ERR_INVALID_URL without a protocol, which fails the build.
function normalizeSiteUrl(raw: string | undefined): string {
  const v = (raw || "https://yeehaw.io").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
export const SITE_URL = normalizeSiteUrl(process.env.SITE_URL);
export const SITE_NAME = "YeeHaw";
export const SITE_TAGLINE = "A Saturday Morning Mixtape";
export const SITE_DESCRIPTION =
  "Weird finds, useful ideas, and good little detours. A nostalgic internet mixtape of products, movies, music, articles, and other good stuff.";
export const SITE_AUTHOR = "Taylor";
