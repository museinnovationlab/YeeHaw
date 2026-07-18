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

/**
 * Record an unsubscribe against the issue it came from. Resend has no webhook
 * for this — the unsubscribe flow is ours — so we write the event directly.
 * The id is deterministic (address + issue) so a repeat click, the one-click
 * header firing twice, or an unsub/resub/unsub cycle can't inflate the count.
 */
export async function recordUnsubscribe(email: string, post?: string): Promise<void> {
  const recipient = (email ?? "").trim().toLowerCase();
  if (!recipient) return;
  await recordEmailEvent({
    id: `unsub-${post || "none"}-${recipient}`,
    type: "unsubscribed",
    emailId: "",
    recipient,
    post,
  });
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

const UNTAGGED = "(untagged)";

function groupByPost(events: EmailEvent[]): Map<string, EmailEvent[]> {
  const m = new Map<string, EmailEvent[]>();
  for (const e of events) {
    const key = e.post || UNTAGGED;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(e);
  }
  return m;
}

const pctOf = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface IssueSummary {
  post: string;
  sentAt: string; // earliest event time for the issue
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

export interface EmailReport {
  overall: {
    issues: number;
    recipients: number; // total delivered across all issues
    opened: number;
    clicked: number;
    openRate: number; // %
    clickRate: number; // %
    avgClicksPerIssue: number;
    unsubscribed: number;
    unsubRate: number; // % of delivered
  };
  issues: IssueSummary[];
}

/** List of sends + an all-time roll-up (for the Analytics index). */
export async function getEmailReport(): Promise<EmailReport> {
  const groups = groupByPost(await getAllEmailEvents());
  const issues: IssueSummary[] = [];
  let recipients = 0,
    opened = 0,
    clicked = 0,
    totalClicks = 0,
    unsubscribed = 0;

  for (const [post, evs] of groups) {
    const deliveredSet = new Set(evs.filter((e) => e.type === "delivered").map((e) => e.recipient));
    const openedSet = new Set(evs.filter((e) => e.type === "opened").map((e) => e.recipient));
    const clickedSet = new Set(evs.filter((e) => e.type === "clicked").map((e) => e.recipient));
    const unsubSet = new Set(
      evs.filter((e) => e.type === "unsubscribed").map((e) => e.recipient)
    );
    const sentAt = evs.map((e) => e.createdAt).filter(Boolean).sort()[0] ?? "";
    issues.push({
      post,
      sentAt,
      delivered: deliveredSet.size,
      opened: openedSet.size,
      clicked: clickedSet.size,
      unsubscribed: unsubSet.size,
    });
    recipients += deliveredSet.size;
    opened += openedSet.size;
    clicked += clickedSet.size;
    unsubscribed += unsubSet.size;
    totalClicks += evs.filter((e) => e.type === "clicked").length;
  }

  issues.sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""));
  return {
    overall: {
      issues: issues.length,
      recipients,
      opened,
      clicked,
      openRate: pctOf(opened, recipients),
      clickRate: pctOf(clicked, recipients),
      avgClicksPerIssue: issues.length ? round1(totalClicks / issues.length) : 0,
      unsubscribed,
      unsubRate: pctOf(unsubscribed, recipients),
    },
    issues,
  };
}

export interface IssueDetail {
  post: string;
  sentAt: string;
  delivered: number;
  /** how many Resend accepted, when known — the denominator for delivery */
  accepted?: number;
  bounced: string[]; // hard-bounced addresses (auto-suppressed)
  unsubscribed: string[]; // who opted out from this issue
  /** accepted − delivered − bounced: still awaiting confirmation */
  pending: number;
  opened: string[]; // recipient emails who opened
  notOpened: string[]; // delivered − opened
  totalClicks: number;
  avgClicksPerRecipient: number;
  openRate: number;
  clickRate: number;
  clickers: { recipient: string; opened: boolean; clicks: number; links: { link: string; count: number }[] }[];
  topLinks: { link: string; count: number }[];
}

/** Per-issue detail with recipient-level open/click breakdown. */
export async function getIssueDetail(
  post: string,
  accepted?: number
): Promise<IssueDetail | null> {
  const events = (await getAllEmailEvents()).filter((e) => (e.post || UNTAGGED) === post);
  if (!events.length) return null;

  const deliveredSet = new Set(events.filter((e) => e.type === "delivered").map((e) => e.recipient));
  const openedSet = new Set(events.filter((e) => e.type === "opened").map((e) => e.recipient));
  const bouncedSet = new Set(events.filter((e) => e.type === "bounced").map((e) => e.recipient));
  // A "sent" event (subscribe to email.sent in Resend) gives the denominator
  // even when the stored accepted count is missing, e.g. for older issues.
  const sentSet = new Set(events.filter((e) => e.type === "sent").map((e) => e.recipient));
  const unsubSet = new Set(
    events.filter((e) => e.type === "unsubscribed").map((e) => e.recipient)
  );
  const denominator = accepted ?? (sentSet.size || undefined);
  const audience = deliveredSet.size ? deliveredSet : new Set(events.map((e) => e.recipient));

  const opened = [...audience].filter((r) => openedSet.has(r)).sort();
  const notOpened = [...audience].filter((r) => !openedSet.has(r)).sort();

  const clickEvents = events.filter((e) => e.type === "clicked" && e.link);
  const totalClicks = clickEvents.length;

  const byRecipient = new Map<string, Map<string, number>>();
  for (const e of clickEvents) {
    if (!byRecipient.has(e.recipient)) byRecipient.set(e.recipient, new Map());
    const m = byRecipient.get(e.recipient)!;
    m.set(e.link!, (m.get(e.link!) ?? 0) + 1);
  }
  const clickers = [...byRecipient.entries()]
    .map(([recipient, links]) => {
      const linkList = [...links.entries()].map(([link, count]) => ({ link, count })).sort((a, b) => b.count - a.count);
      return {
        recipient,
        opened: openedSet.has(recipient),
        clicks: linkList.reduce((s, l) => s + l.count, 0),
        links: linkList,
      };
    })
    .sort((a, b) => b.clicks - a.clicks);

  const linkCounts = new Map<string, number>();
  for (const e of clickEvents) linkCounts.set(e.link!, (linkCounts.get(e.link!) ?? 0) + 1);
  const topLinks = [...linkCounts.entries()].map(([link, count]) => ({ link, count })).sort((a, b) => b.count - a.count);

  return {
    post,
    sentAt: events.map((e) => e.createdAt).filter(Boolean).sort()[0] ?? "",
    delivered: audience.size,
    accepted: denominator,
    bounced: [...bouncedSet].sort(),
    unsubscribed: [...unsubSet].sort(),
    pending: denominator
      ? Math.max(0, denominator - deliveredSet.size - bouncedSet.size)
      : 0,
    opened,
    notOpened,
    totalClicks,
    avgClicksPerRecipient: audience.size ? round1(totalClicks / audience.size) : 0,
    openRate: pctOf(opened.length, audience.size),
    clickRate: pctOf(clickers.length, audience.size),
    clickers,
    topLinks,
  };
}
