"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth";
import {
  addSubscribersBulk,
  setSubscriberStatus,
  deleteSubscriber,
} from "@/lib/repo/subscribers";
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
