import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";

/**
 * Fixed-window rate limiting backed by Firestore.
 *
 * Serverless functions don't share memory, so an in-process counter would reset
 * on every cold start and differ per instance — useless as a control. Firestore
 * is already a dependency here, so this avoids standing up Redis for what is
 * currently a handful of signups a week.
 *
 * Deliberately fail-OPEN: if the limiter itself errors we allow the request.
 * A broken limiter must not take the signup form down with it.
 */

const COL = "rateLimits";

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** First entry of x-forwarded-for is the real client on Vercel. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export async function rateLimit(opts: {
  key: string; // e.g. "subscribe:1.2.3.4"
  limit: number; // max actions per window
  windowSeconds: number;
}): Promise<LimitResult> {
  const { key, limit, windowSeconds } = opts;
  if (!isFirebaseAdminConfigured) {
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const resetAt = windowStart + windowSeconds * 1000;
  // Window start is in the id, so a new window is naturally a fresh document.
  const id = `${key}:${windowStart}`.replace(/\//g, "_");

  try {
    const ref = adminDb().collection(COL).doc(id);
    const count = await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.exists ? (snap.data()?.count as number) : 0) ?? 0;
      const next = current + 1;
      tx.set(
        ref,
        {
          count: next,
          // Lets a Firestore TTL policy on `expiresAt` sweep old windows.
          expiresAt: new Date(resetAt + 60_000),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return next;
    });

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  } catch (e) {
    console.error("rateLimit failed open:", e);
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}
