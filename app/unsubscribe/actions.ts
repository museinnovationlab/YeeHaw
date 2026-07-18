"use server";

import { verifyUnsub } from "@/lib/unsubscribe";
import { setSubscriberStatus } from "@/lib/repo/subscribers";
import { recordUnsubscribe } from "@/lib/repo/emailEvents";

// Public (token-gated) — no admin login. Used by the confirm page.
export async function unsubscribeAction(
  email: string,
  token: string,
  post?: string
): Promise<void> {
  if (!verifyUnsub(email, token)) throw new Error("Invalid or expired link.");
  await setSubscriberStatus(email, "unsubscribed");
  await recordUnsubscribe(email, post).catch((e) =>
    console.error("unsubscribe event failed:", e)
  );
}

export async function resubscribeAction(email: string, token: string): Promise<void> {
  if (!verifyUnsub(email, token)) throw new Error("Invalid or expired link.");
  await setSubscriberStatus(email, "subscribed");
}
