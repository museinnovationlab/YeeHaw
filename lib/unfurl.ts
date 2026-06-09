import "server-only";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface LinkMeta {
  url: string; // the URL the user gave
  finalUrl: string;
  title: string;
  description: string;
  image: string | null; // best preview image URL (original source)
  source: string; // human label for credit (site name / @handle / channel)
}

function decode(s: string): string {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}
function abs(u: string, base: string): string {
  try {
    return new URL(u, base).href;
  } catch {
    return u;
  }
}
function host(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isYouTube(u: string): boolean {
  const h = host(u);
  return h === "youtube.com" || h === "m.youtube.com" || h === "youtu.be";
}

async function youtubeMeta(url: string): Promise<LinkMeta | null> {
  try {
    const api = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const res = await fetch(api, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      url,
      finalUrl: url,
      title: decode(d.title || ""),
      description: "",
      image: d.thumbnail_url || null,
      source: d.author_name || "YouTube",
    };
  } catch {
    return null;
  }
}

function parseOg(html: string, finalUrl: string, originalUrl: string): LinkMeta {
  const metas: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\s+([^>]+?)\/?>/gi)) {
    const a = m[1];
    const key = (a.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (a.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (key && val != null && !(key.toLowerCase() in metas)) metas[key.toLowerCase()] = decode(val);
  }
  const titleTag = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
  const h = host(finalUrl);
  const seg = (() => {
    try {
      return new URL(finalUrl).pathname.split("/").filter(Boolean)[0];
    } catch {
      return "";
    }
  })();
  let source = metas["og:site_name"] || h;
  if (h.includes("instagram.com") && seg && !["p", "reel", "tv"].includes(seg)) source = "@" + seg;
  if ((h.includes("twitter.com") || h.includes("x.com")) && seg) source = "@" + seg;
  const img = metas["og:image"] || metas["twitter:image"] || metas["twitter:image:src"];
  return {
    url: originalUrl,
    finalUrl,
    title: decode(metas["og:title"] || metas["twitter:title"] || titleTag || ""),
    description: decode(metas["og:description"] || metas["twitter:description"] || metas["description"] || "").slice(0, 300),
    image: img ? abs(img, finalUrl) : null,
    source,
  };
}

/** Best-effort metadata for a URL. Returns a minimal fallback (link only) if the
 *  site blocks bots. */
export async function unfurl(url: string): Promise<LinkMeta> {
  const fallback: LinkMeta = { url, finalUrl: url, title: "", description: "", image: null, source: host(url) || url };
  if (isYouTube(url)) {
    const yt = await youtubeMeta(url);
    if (yt) return yt;
  }
  try {
    const ctrl = AbortSignal.timeout(12000);
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: ctrl });
    const finalUrl = res.url || url;
    const ctype = res.headers.get("content-type") || "";
    if (ctype.startsWith("image/")) {
      // a direct image link
      return { url, finalUrl, title: "", description: "", image: finalUrl, source: host(finalUrl) };
    }
    if (!res.ok || !ctype.includes("text/html")) return fallback;
    const html = (await res.text()).slice(0, 600000);
    return parseOg(html, finalUrl, url);
  } catch {
    return fallback;
  }
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const u = m[0].replace(/[.,;:]+$/, "");
    if (!seen.has(u)) seen.add(u);
  }
  return [...seen].slice(0, 10);
}
