import "server-only";

// Thin wrapper over the Resend send API. The From domain (yeehaw.io) is verified
// in Resend, so any @yeehaw.io sender works; replies go to hello@ (forwarded).
const KEY = process.env.RESEND_API_KEY;
export const isEmailConfigured = Boolean(KEY);
export const EMAIL_FROM = process.env.EMAIL_FROM || "YeeHaw <hello@yeehaw.io>";
export const REPLY_TO = process.env.EMAIL_REPLY_TO || "hello@yeehaw.io";

export interface SendResult {
  id?: string;
  error?: string;
}

export interface BatchEmail {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}

/** Resend's batch endpoint accepts at most 100 messages per request. */
export const BATCH_MAX = 100;

/**
 * Send up to BATCH_MAX personalized emails in a single request. Each entry
 * keeps its own headers and tags, so per-recipient unsubscribe links and the
 * post tag that drives analytics both survive.
 */
export async function sendBatch(
  emails: BatchEmail[]
): Promise<{ ids: string[]; error?: string }> {
  if (!KEY) return { ids: [], error: "email_not_configured" };
  if (!emails.length) return { ids: [] };
  if (emails.length > BATCH_MAX) return { ids: [], error: `batch_too_large_${emails.length}` };
  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        emails.map((e) => ({
          from: EMAIL_FROM,
          to: e.to,
          subject: e.subject,
          html: e.html,
          reply_to: REPLY_TO,
          headers: e.headers,
          tags: e.tags,
        }))
      ),
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { id: string }[];
      message?: string;
      name?: string;
    };
    if (!res.ok) return { ids: [], error: data?.message || data?.name || `http_${res.status}` };
    return { ids: (data?.data ?? []).map((d) => d.id) };
  } catch (e) {
    return { ids: [], error: e instanceof Error ? e.message : "batch_send_failed" };
  }
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}): Promise<SendResult> {
  if (!KEY) return { error: "email_not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        reply_to: opts.replyTo ?? REPLY_TO,
        headers: opts.headers,
        tags: opts.tags,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { error: data?.message || data?.name || `http_${res.status}` };
    return { id: data?.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "send_failed" };
  }
}
