import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/site";

// Signed unsubscribe tokens so a link can unsubscribe its own address without
// login, and nobody can unsubscribe someone else by guessing their email.
// Reuses CRON_SECRET in prod (already set in Vercel) — set EMAIL_TOKEN_SECRET to
// override. The dev fallback only matters for local testing.
const SECRET =
  process.env.EMAIL_TOKEN_SECRET || process.env.CRON_SECRET || "yeehaw-dev-unsub-secret";

function norm(email: string): string {
  return email.trim().toLowerCase();
}

export function unsubToken(email: string): string {
  return createHmac("sha256", SECRET).update(norm(email)).digest("base64url").slice(0, 24);
}

export function verifyUnsub(email: string, token: string): boolean {
  if (!email || !token) return false;
  const expected = unsubToken(email);
  if (expected.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

/** Human-facing confirm page link (goes in the email footer). */
export function unsubscribeUrl(email: string): string {
  const e = encodeURIComponent(norm(email));
  return `${SITE_URL}/unsubscribe?e=${e}&t=${unsubToken(email)}`;
}

/** RFC 8058 one-click headers (Gmail/Yahoo POST to this to unsubscribe). */
export function listUnsubscribeHeaders(email: string): Record<string, string> {
  const e = encodeURIComponent(norm(email));
  return {
    "List-Unsubscribe": `<${SITE_URL}/api/unsubscribe?e=${e}&t=${unsubToken(email)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
