"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth";
import {
  addSubscribersBulk,
  setSubscriberStatus,
  deleteSubscriber,
  getAllSubscribers,
} from "@/lib/repo/subscribers";
import { checkDomains, type DomainVerdict } from "@/lib/mxCheck";
import type { SubscriberStatus } from "@/lib/types";

async function requireAdmin() {
  const u = await getAdminUser();
  if (!u) throw new Error("Unauthorized");
}

// Tolerant parser: accepts plain emails (one per line), "email, name", or
// pasted CSV (with or without a header). Grabs the first email-looking token on
// each line and treats a trailing non-email cell as the name.
function parsePaste(text: string): { email: string; name?: string }[] {
  const EMAIL = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/;
  const out: { email: string; name?: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(EMAIL);
    if (!m) continue; // header row or junk
    const email = m[0];
    // name = the longest other cell that isn't an email
    const cells = trimmed
      .split(/[,;\t]/)
      .map((c) => c.trim().replace(/^["']|["']$/g, ""))
      .filter((c) => c && !EMAIL.test(c));
    const name = cells.sort((a, b) => b.length - a.length)[0];
    out.push({ email, ...(name ? { name } : {}) });
  }
  return out;
}

/** Bulk import pasted subscribers. Returns a tally. */
export async function importSubscribersAction(
  text: string
): Promise<{ parsed: number; added: number; skipped: number; invalid: number }> {
  await requireAdmin();
  const items = parsePaste(text).map((i) => ({ ...i, source: "import" as const }));
  const res = await addSubscribersBulk(items);
  revalidatePath("/admin/subscribers");
  return { parsed: items.length, ...res };
}

export async function setSubscriberStatusAction(
  email: string,
  status: SubscriberStatus
): Promise<void> {
  await requireAdmin();
  await setSubscriberStatus(email, status);
  revalidatePath("/admin/subscribers");
}

export async function deleteSubscriberAction(email: string): Promise<void> {
  await requireAdmin();
  await deleteSubscriber(email);
  revalidatePath("/admin/subscribers");
}

export interface DomainAuditRow {
  domain: string;
  verdict: DomainVerdict;
  detail: string;
  emails: string[];
}

export interface DomainAudit {
  checked: number; // active subscribers scanned
  domains: number; // unique domains looked up
  problems: DomainAuditRow[]; // dead / a_fallback / unknown, worst first
  okDomains: number;
}

/**
 * Look up every active subscriber's domain and report which ones can't receive
 * mail. Read-only on purpose: it suggests, you decide. An MX check catches dead
 * DOMAINS (like domainworld.com, which has no MX and deferral-loops), not dead
 * MAILBOXES at live domains — those only surface as bounces after a send.
 */
export async function auditSubscriberDomainsAction(): Promise<DomainAudit> {
  await requireAdmin();

  const active = (await getAllSubscribers()).filter((s) => s.status === "subscribed");
  const byDomain = new Map<string, string[]>();
  for (const s of active) {
    const d = s.email.split("@")[1]?.toLowerCase();
    if (!d) continue;
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d)!.push(s.email);
  }

  const results = await checkDomains([...byDomain.keys()]);
  const RANK: Record<DomainVerdict, number> = { dead: 0, a_fallback: 1, unknown: 2, ok: 3 };
  const problems: DomainAuditRow[] = [];
  let okDomains = 0;

  for (const [domain, emails] of byDomain) {
    const r = results.get(domain);
    if (!r || r.verdict === "ok") {
      okDomains += 1;
      continue;
    }
    problems.push({ domain, verdict: r.verdict, detail: r.detail, emails: emails.sort() });
  }
  problems.sort(
    (a, b) => RANK[a.verdict] - RANK[b.verdict] || b.emails.length - a.emails.length
  );

  return { checked: active.length, domains: byDomain.size, problems, okDomains };
}
