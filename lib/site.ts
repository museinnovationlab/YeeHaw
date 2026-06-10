// Central site identity. URLs come from SITE_URL (set in Vercel / .env.local) so
// sitemap, RSS, canonical tags and JSON-LD all agree and switch over to the real
// domain automatically once SITE_URL is updated post-transfer.
export const SITE_URL = (process.env.SITE_URL || "https://yeehaw.io").replace(/\/+$/, "");
export const SITE_NAME = "YeeHaw";
export const SITE_TAGLINE = "A Saturday Morning Mixtape";
export const SITE_DESCRIPTION =
  "Weird finds, useful ideas, and good little detours. A nostalgic internet mixtape of products, movies, music, articles, and other good stuff.";
export const SITE_AUTHOR = "Taylor";
