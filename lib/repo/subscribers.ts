import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import type { Subscriber, SubscriberStatus } from "@/lib/types";

const COL = "subscribers";

// Doc id IS the normalized email, so adds are naturally idempotent — the live
// signup form and a bulk import can't create duplicates of the same person.
function emailId(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function isValidEmail(e: string): boolean {
  return EMAIL_RE.test(e.trim().toLowerCase());
}

function iso(v: unknown): string | undefined {
  const ts = v as { toDate?: () => Date };
  if (ts && typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof v === "string") return v;
  return undefined;
}

function toSub(id: string, d: Record<string, unknown>): Subscriber {
  return {
    id,
    email: (d.email as string) ?? id,
    name: (d.name as string) || undefined,
    status: (d.status as SubscriberStatus) ?? "subscribed",
    source: (d.source as Subscriber["source"]) ?? "site",
    createdAt: iso(d.createdAt) ?? "",
    updatedAt: iso(d.updatedAt) ?? "",
    unsubscribedAt: iso(d.unsubscribedAt),
  };
}

type AddResult = "added" | "exists" | "invalid";

/** Add a single subscriber (used by the public signup form). Idempotent. */
export async function addSubscriber(
  rawEmail: string,
  opts?: { source?: Subscriber["source"]; name?: string }
): Promise<AddResult> {
  if (!isFirebaseAdminConfigured) return "invalid";
  const email = emailId(rawEmail);
  if (!isValidEmail(email)) return "invalid";
  const ref = adminDb().collection(COL).doc(email);
  const snap = await ref.get();
  if (snap.exists) return "exists";
  await ref.set({
    email,
    status: "subscribed",
    source: opts?.source ?? "site",
    ...(opts?.name ? { name: opts.name } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return "added";
}

/** Bulk add (admin importer / seed). Skips existing, reports a tally. */
export async function addSubscribersBulk(
  items: { email: string; name?: string; source?: Subscriber["source"] }[]
): Promise<{ added: number; skipped: number; invalid: number }> {
  if (!isFirebaseAdminConfigured) return { added: 0, skipped: 0, invalid: 0 };
  const db = adminDb();
  const existing = new Set((await db.collection(COL).get()).docs.map((d) => d.id));
  let added = 0,
    skipped = 0,
    invalid = 0;
  let batch = db.batch();
  let n = 0;
  for (const it of items) {
    const email = emailId(it.email);
    if (!isValidEmail(email)) {
      invalid++;
      continue;
    }
    if (existing.has(email)) {
      skipped++;
      continue;
    }
    existing.add(email);
    batch.set(db.collection(COL).doc(email), {
      email,
      status: "subscribed",
      source: it.source ?? "import",
      ...(it.name ? { name: it.name } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    added++;
    n++;
    if (n >= 400) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n) await batch.commit();
  return { added, skipped, invalid };
}

export async function getAllSubscribers(): Promise<Subscriber[]> {
  if (!isFirebaseAdminConfigured) return [];
  const snap = await adminDb().collection(COL).get();
  return snap.docs
    .map((d) => toSub(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function getSubscriberCounts(): Promise<{
  subscribed: number;
  unsubscribed: number;
  total: number;
}> {
  const all = await getAllSubscribers();
  return {
    subscribed: all.filter((s) => s.status === "subscribed").length,
    unsubscribed: all.filter((s) => s.status === "unsubscribed").length,
    total: all.length,
  };
}

export async function setSubscriberStatus(
  email: string,
  status: SubscriberStatus
): Promise<void> {
  if (!isFirebaseAdminConfigured) return;
  await adminDb()
    .collection(COL)
    .doc(emailId(email))
    .set(
      {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        unsubscribedAt:
          status === "unsubscribed" ? FieldValue.serverTimestamp() : FieldValue.delete(),
      },
      { merge: true }
    );
}

export async function deleteSubscriber(email: string): Promise<void> {
  if (!isFirebaseAdminConfigured) return;
  await adminDb().collection(COL).doc(emailId(email)).delete();
}
