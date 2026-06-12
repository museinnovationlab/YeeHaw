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

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
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
