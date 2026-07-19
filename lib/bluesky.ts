import "server-only";

/**
 * Minimal Bluesky (AT Protocol) client — just enough to post a link card.
 *
 * Flow: createSession with an APP PASSWORD (never the account password; app
 * passwords are revocable and can't change account settings), then
 * createRecord an app.bsky.feed.post. A bare URL renders as plain text, so we
 * also upload the featured image as a blob and attach an external embed to get
 * the preview card.
 */

const HOST = process.env.BLUESKY_HOST || "https://bsky.social";
const HANDLE = process.env.BLUESKY_HANDLE;
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD;

export const isBlueskyConfigured = Boolean(HANDLE && APP_PASSWORD);

/** Bluesky caps posts at 300 graphemes. */
export const BSKY_MAX = 300;
/** Blobs are size-limited; keep well under to avoid a rejected upload. */
const MAX_THUMB_BYTES = 900_000;

interface Session {
  accessJwt: string;
  did: string;
}

async function createSession(): Promise<Session> {
  const res = await fetch(`${HOST}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: HANDLE, password: APP_PASSWORD }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    accessJwt?: string;
    did?: string;
    message?: string;
  };
  if (!res.ok || !data.accessJwt || !data.did) {
    throw new Error(data.message || `bluesky auth failed (${res.status})`);
  }
  return { accessJwt: data.accessJwt, did: data.did };
}

/**
 * Link facets index into UTF-8 BYTES, not characters. Using string indices
 * silently misplaces links as soon as the text contains an emoji or accent,
 * so every offset here is computed on the encoded bytes.
 */
export function linkFacets(text: string, url: string): unknown[] {
  const enc = new TextEncoder();
  const idx = text.indexOf(url);
  if (idx < 0) return [];
  const byteStart = enc.encode(text.slice(0, idx)).length;
  const byteEnd = byteStart + enc.encode(url).length;
  return [
    {
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
    },
  ];
}

/** Cloudinary can hand us a smaller derivative; other hosts we take as-is. */
function thumbUrl(url: string): string {
  return url.includes("/upload/")
    ? url.replace("/upload/", "/upload/c_limit,w_1200,q_auto,f_jpg/")
    : url;
}

async function uploadThumb(
  session: Session,
  imageUrl: string
): Promise<unknown | null> {
  try {
    const res = await fetch(thumbUrl(imageUrl), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_THUMB_BYTES) return null;

    const up = await fetch(`${HOST}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": type,
      },
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });
    if (!up.ok) return null;
    const data = (await up.json()) as { blob?: unknown };
    return data.blob ?? null;
  } catch {
    // A missing card is a cosmetic loss; never fail the post over it.
    return null;
  }
}

export interface BlueskyPostInput {
  text: string;
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

/** Post to Bluesky. Returns the post URI, or an error string — never throws. */
export async function postToBluesky(
  input: BlueskyPostInput
): Promise<{ uri?: string; url?: string; error?: string }> {
  if (!isBlueskyConfigured) return { error: "bluesky_not_configured" };
  try {
    const session = await createSession();
    const thumb = input.imageUrl ? await uploadThumb(session, input.imageUrl) : null;

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text: input.text,
      createdAt: new Date().toISOString(),
      facets: linkFacets(input.text, input.url),
      embed: {
        $type: "app.bsky.embed.external",
        external: {
          uri: input.url,
          title: input.title.slice(0, 300),
          description: (input.description || "").slice(0, 1000),
          ...(thumb ? { thumb } : {}),
        },
      },
    };

    const res = await fetch(`${HOST}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => ({}))) as { uri?: string; message?: string };
    if (!res.ok || !data.uri) {
      return { error: data.message || `bluesky post failed (${res.status})` };
    }
    // at://did/app.bsky.feed.post/<rkey> -> a human-facing permalink
    const rkey = data.uri.split("/").pop();
    return {
      uri: data.uri,
      url: `https://bsky.app/profile/${HANDLE}/post/${rkey}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "bluesky_failed" };
  }
}
