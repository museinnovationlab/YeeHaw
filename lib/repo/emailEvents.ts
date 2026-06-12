import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";

const COL = "emailEvents";

export interface EmailEvent {
  id: string;
  type: string; // delivered | opened | clicked | bounced | complained | sent | ...
  emailId: string;
  recipient: string;
  post?: string; // from the "post" send tag
  link?: string; // clicked URL
  createdAt: string;
}

/** Idempotent on webhook retries when `id` is the unique svix message id. */
export async function recordEmailEvent(e: {
  id: string;
  type: string;
  emailId: string;
  recipient: string;
  post?: string;
  link?: string;
}): Promise<void> {
  if (!isFirebaseAdminConfigured) return;
  await adminDb()
    .collection(COL)
    .doc(e.id)
    .set(
      {
        type: e.type,
        emailId: e.emailId ?? "",
        recipient: (e.recipient ?? "").toLowerCase(),
        ...(e.post ? { post: e.post } : {}),
        ...(e.link ? { link: e.link } : {}),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

function iso(v: unknown): string {
  const ts = v as { toDate?: () => Date };
  if (ts && typeof ts.toDate === "function") return ts.toDate().toISOString();
  return typeof v === "string" ? v : "";
}

export async function getAllEmailEvents(): Promise<EmailEvent[]> {
  if (!isFirebaseAdminConfigured) return [];
  const snap = await adminDb().collection(COL).get();
  return snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      type: (x.type as string) ?? "",
      emailId: (x.emailId as string) ?? "",
      recipient: (x.recipient as string) ?? "",
      post: x.post as string | undefined,
      link: x.link as string | undefined,
      createdAt: iso(x.createdAt),
    };
  });
}

export interface PostEmailStats {
  post: string;
  delivered: number;
  opens: number; // unique recipients who opened
  clicks: number; // unique recipients who clicked
  totalClicks: number;
  topLinks: { link: string; count: number }[];
}

/** Aggregate events into per-post stats (small scale → in memory). */
export async function getEmailStatsByPost(): Promise<PostEmailStats[]> {
  const events = await getAllEmailEvents();
  const byPost = new Map<string, EmailEvent[]>();
  for (const e of events) {
    const key = e.post || "(untagged)";
    if (!byPost.has(key)) byPost.set(key, []);
    byPost.get(key)!.push(e);
  }

  const out: PostEmailStats[] = [];
  for (const [post, evs] of byPost) {
    const delivered = new Set(evs.filter((e) => e.type === "delivered").map((e) => e.recipient));
    const opened = new Set(evs.filter((e) => e.type === "opened").map((e) => e.recipient));
    const clickedRecipients = new Set(evs.filter((e) => e.type === "clicked").map((e) => e.recipient));
    const linkCounts = new Map<string, number>();
    for (const e of evs) {
      if (e.type === "clicked" && e.link) linkCounts.set(e.link, (linkCounts.get(e.link) ?? 0) + 1);
    }
    const topLinks = [...linkCounts.entries()]
      .map(([link, count]) => ({ link, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    out.push({
      post,
      delivered: delivered.size,
      opens: opened.size,
      clicks: clickedRecipients.size,
      totalClicks: evs.filter((e) => e.type === "clicked").length,
      topLinks,
    });
  }
  return out.sort((a, b) => b.delivered - a.delivered);
}
