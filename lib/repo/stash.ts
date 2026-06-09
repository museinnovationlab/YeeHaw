import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import type { StashItem, StashStatus } from "@/lib/types";

const COL = "stash";

function toItem(id: string, d: Record<string, unknown>): StashItem {
  const iso = (v: unknown): string | undefined => {
    const ts = v as { toDate?: () => Date };
    if (ts && typeof ts.toDate === "function") return ts.toDate().toISOString();
    if (typeof v === "string") return v;
    return undefined;
  };
  // backward compat: older docs only had a `used` boolean, no `status`.
  const status: StashStatus =
    (d.status as StashStatus) ?? (d.used ? "used" : "active");
  return {
    id,
    text: (d.text as string) ?? "",
    status,
    createdAt: iso(d.createdAt) ?? "",
    usedAt: iso(d.usedAt),
    removedAt: iso(d.removedAt),
  };
}

/** Bulk-add stash items (one per text). Returns how many were added. */
export async function addStashItems(texts: string[]): Promise<number> {
  if (!isFirebaseAdminConfigured) return 0;
  const db = adminDb();
  const batch = db.batch();
  let n = 0;
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    batch.set(db.collection(COL).doc(), {
      text,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });
    n += 1;
  }
  if (n) await batch.commit();
  return n;
}

/** All stash items (small collection — filtered/sorted in memory). */
export async function getAllStash(): Promise<StashItem[]> {
  if (!isFirebaseAdminConfigured) return [];
  const snap = await adminDb().collection(COL).get();
  return snap.docs
    .map((d) => toItem(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getActiveStash(): Promise<StashItem[]> {
  return (await getAllStash()).filter((i) => i.status === "active");
}

export async function setStashStatus(ids: string[], status: StashStatus): Promise<void> {
  if (!isFirebaseAdminConfigured || !ids.length) return;
  const db = adminDb();
  const batch = db.batch();
  for (const id of ids) {
    batch.set(
      db.collection(COL).doc(id),
      {
        status,
        usedAt: status === "used" ? FieldValue.serverTimestamp() : FieldValue.delete(),
        removedAt: status === "removed" ? FieldValue.serverTimestamp() : FieldValue.delete(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

/** Permanent delete (used from the Removed list only). */
export async function deleteStashItem(id: string): Promise<void> {
  if (!isFirebaseAdminConfigured) return;
  await adminDb().collection(COL).doc(id).delete();
}
