import "server-only";
import { EMAIL_STYLE as S, escapeHtml as esc } from "@/lib/emailTemplate";

/**
 * Turn video/Spotify embeds into email-safe image cards.
 *
 * Email clients can't run iframes, so on the site these stay live widgets
 * but in the newsletter they become: a linked thumbnail for videos, and a
 * Spotify-styled card (cover art + title + green button) for playlists. Both
 * come from public oEmbed endpoints — no API keys.
 *
 * Call this ONCE per post before the per-recipient render loop, not inside
 * it: the email is rendered separately for every subscriber, and fetching
 * thumbnails 86 times per video would be silly. Anything that fails to
 * resolve is left as an iframe, and emailifyBody() still turns those into the
 * plain "▶ Watch the video" links — so the worst case is today's behavior.
 */

const TIMEOUT = 5000;
const SPOTIFY_GREEN = "#1DB954";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(TIMEOUT) });
    return res.ok;
  } catch {
    return false;
  }
}

interface OEmbed {
  title?: string;
  thumbnail_url?: string;
}

interface VideoInfo {
  watchUrl: string;
  thumb: string;
  title?: string;
  service: "YouTube" | "Vimeo";
}
interface SpotifyInfo {
  url: string;
  cover?: string;
  title?: string;
  type: string;
}

// Per-instance memo so a test send followed by the real broadcast doesn't
// refetch. Keyed by embed id; holds the promise so concurrent lookups share.
const memo = new Map<string, Promise<VideoInfo | SpotifyInfo | null>>();
function once<T extends VideoInfo | SpotifyInfo>(key: string, fn: () => Promise<T | null>) {
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key) as Promise<T | null>;
}

function youtube(id: string) {
  return once<VideoInfo>(`yt:${id}`, async () => {
    const watchUrl = `https://www.youtube.com/watch?v=${id}`;
    // maxres is true 16:9 with no letterbox bars but isn't generated for
    // every video; hq (480x360, bars on widescreen) always exists.
    const maxres = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    const [hd, meta] = await Promise.all([
      exists(maxres),
      getJson<OEmbed>(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`),
    ]);
    // oEmbed succeeding is the proof the video exists and is embeddable. A
    // deleted/private/mistyped id has no thumbnail either, so without this a
    // broken image would ship instead of the text-link fallback.
    if (!meta) return null;
    return {
      service: "YouTube",
      watchUrl,
      thumb: hd ? maxres : meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      title: meta.title,
    };
  });
}

function vimeo(id: string) {
  return once<VideoInfo>(`vimeo:${id}`, async () => {
    const watchUrl = `https://vimeo.com/${id}`;
    const meta = await getJson<OEmbed>(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(watchUrl)}&width=1280`
    );
    if (!meta?.thumbnail_url) return null; // no thumb -> keep the text-link fallback
    return { service: "Vimeo", watchUrl, thumb: meta.thumbnail_url, title: meta.title };
  });
}

function spotify(type: string, id: string) {
  return once<SpotifyInfo>(`sp:${type}:${id}`, async () => {
    const url = `https://open.spotify.com/${type}/${id}`;
    const meta = await getJson<OEmbed>(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (!meta) return null; // unknown id -> keep the text-link fallback
    return { url, type, cover: meta.thumbnail_url, title: meta.title };
  });
}

const clip = (s: string | undefined, n: number) =>
  s && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s || "";

/** Full-width linked thumbnail with a caption row, framed like author images. */
function videoCard(v: VideoInfo): string {
  const title = clip(v.title, 90);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
  <tr><td>
    <a href="${esc(v.watchUrl)}" style="display:block;text-decoration:none;">
      <img src="${esc(v.thumb)}" alt="${esc(title || `Video on ${v.service}`)}" width="544" style="display:block;width:100%;max-width:100%;height:auto;border-radius:10px;border:2px solid ${S.INK};" />
    </a>
  </td></tr>
  <tr><td style="padding-top:8px;font-family:${S.FONT_BODY};font-size:15px;line-height:1.4;">
    <a href="${esc(v.watchUrl)}" style="color:${S.PURPLE};font-weight:bold;text-decoration:none;">▶ Watch on ${v.service}</a>${title ? `<span style="color:${S.INK};opacity:0.7;"> · ${esc(title)}</span>` : ""}
  </td></tr>
</table>`;
}

/** Dark card echoing the Spotify widget: cover art left, title + green button right. */
function spotifyCard(p: SpotifyInfo): string {
  const title = clip(p.title, 70);
  const label = p.type === "show" ? "podcast" : p.type;
  const cover = p.cover
    ? `<td width="112" valign="middle" style="padding:14px 0 14px 14px;">
      <a href="${esc(p.url)}" style="display:block;"><img src="${esc(p.cover)}" alt="" width="112" height="112" style="display:block;width:112px;height:112px;border-radius:8px;border:0;" /></a>
    </td>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${S.INK};border-radius:12px;">
  <tr>
    ${cover}
    <td valign="middle" style="padding:14px 18px;">
      <div style="font-family:${S.FONT_MONO};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${SPOTIFY_GREEN};">Spotify ${esc(label)}</div>
      ${title ? `<div style="font-family:${S.FONT_HEADING};font-size:18px;line-height:1.2;color:${S.CREAM};margin:4px 0 12px;">${esc(title)}</div>` : `<div style="height:8px;"></div>`}
      <a href="${esc(p.url)}" style="display:inline-block;font-family:${S.FONT_HEADING};background:${SPOTIFY_GREEN};color:${S.INK};font-weight:800;text-decoration:none;padding:9px 16px;border-radius:999px;font-size:13px;">▶ Listen on Spotify</a>
    </td>
  </tr>
</table>`;
}

const RE_YT = /<div[^>]*data-youtube-video[^>]*>\s*<iframe[^>]*\ssrc="[^"]*youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})[^"]*"[^>]*>\s*<\/iframe>\s*<\/div>|<iframe[^>]*\ssrc="[^"]*youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})[^"]*"[^>]*>\s*<\/iframe>/gi;
const RE_VIMEO = /<iframe[^>]*\ssrc="[^"]*player\.vimeo\.com\/video\/(\d+)[^"]*"[^>]*>\s*<\/iframe>/gi;
const RE_SPOTIFY = /<iframe[^>]*\ssrc="[^"]*open\.spotify\.com\/embed\/(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]{22})[^"]*"[^>]*>\s*<\/iframe>/gi;

/**
 * Replace every resolvable embed in `html` with its email card. Fetches run in
 * parallel and each is bounded by TIMEOUT; a failure leaves that embed
 * untouched for the downstream text-link fallback.
 */
export async function resolveEmailEmbeds(html: string): Promise<string> {
  if (!html || !/<iframe/i.test(html)) return html;

  // Collect matches first so all lookups can run concurrently.
  type Job = { match: string; render: () => Promise<string | null> };
  const jobs: Job[] = [];

  for (const m of html.matchAll(RE_YT)) {
    const id = m[1] || m[2];
    jobs.push({ match: m[0], render: async () => { const v = await youtube(id); return v ? videoCard(v) : null; } });
  }
  for (const m of html.matchAll(RE_VIMEO)) {
    const id = m[1];
    jobs.push({ match: m[0], render: async () => { const v = await vimeo(id); return v ? videoCard(v) : null; } });
  }
  for (const m of html.matchAll(RE_SPOTIFY)) {
    const [, type, id] = m;
    jobs.push({ match: m[0], render: async () => { const p = await spotify(type, id); return p ? spotifyCard(p) : null; } });
  }
  if (!jobs.length) return html;

  const cards = await Promise.all(jobs.map((j) => j.render().catch(() => null)));
  let out = html;
  jobs.forEach((j, i) => {
    if (cards[i]) out = out.replace(j.match, cards[i]!);
  });
  return out;
}
