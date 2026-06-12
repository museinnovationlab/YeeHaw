"use server";

import { verifyUnsub } from "@/lib/unsubscribe";
import { setSubscriberStatus } from "@/lib/repo/subscribers";

// Public (token-gated) — no admin login. Used by the confirm page.
export async function unsubscribeAction(email: string, token: string): Promise<void> {
  if (!verifyUnsub(email, token)) throw new Error("Invalid or expired link.");
  await setSubscriberStatus(email, "unsubscribed");
}

export async function resubscribeAction(email: string, token: string): Promise<void> {
  if (!verifyUnsub(email, token)) throw new Error("Invalid or expired link.");
  await setSubscriberStatus(email, "subscribed");
}
