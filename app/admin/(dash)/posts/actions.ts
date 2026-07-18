"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth";
import {
  savePost,
  deletePost,
  getPostById,
  claimEmailSend,
  releaseEmailSend,
  type PostInput,
} from "@/lib/repo/posts";
import { getWeekendPicks, renderWhatToWatchHtml, isTmdbConfigured } from "@/lib/tmdb";
import { sendEmail, sendBatch, isEmailConfigured, BATCH_MAX, type BatchEmail } from "@/lib/email";
import { renderPostEmail } from "@/lib/emailTemplate";
import { unsubscribeUrl, listUnsubscribeHeaders } from "@/lib/unsubscribe";
import { getSubscribedRecipients } from "@/lib/repo/subscribers";

export async function savePostAction(input: PostInput): Promise<{ id: string; slug: string }> {
  // Server actions are callable endpoints — always re-check auth here.
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");

  const res = await savePost(input);

  // Refresh anything that might show this post.
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/admin");
  revalidatePath(`/posts/${res.slug}`);
  return res;
}

/**
 * Send a TEST copy of a post to 1–5 specified addresses (e.g. yourself). Never
 * touches the subscriber list and never sets emailSentAt — so the real send
 * later is unaffected. Sends the SAVED version of the post.
 */
export async function sendTestEmailAction(
  postId: string,
  recipientsRaw: string
): Promise<{ sent: number; failed: { to: string; error: string }[] }> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  if (!isEmailConfigured) throw new Error("Email isn't configured (RESEND_API_KEY).");

  const post = await getPostById(postId);
  if (!post) throw new Error("Save the post first, then send a test.");

  const recipients = recipientsRaw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  const unique = [...new Set(recipients)].slice(0, 5);
  if (!unique.length) throw new Error("Enter at least one valid email address.");

  let sent = 0;
  const failed: { to: string; error: string }[] = [];
  for (const to of unique) {
    // Render per-recipient so the unsubscribe link/header is personalized.
    const { subject, html } = renderPostEmail(post, { unsubscribeUrl: unsubscribeUrl(to) });
    const r = await sendEmail({
      to,
      subject: `[TEST] ${subject}`,
      html,
      headers: listUnsubscribeHeaders(to),
      tags: [{ name: "post", value: post.slug }],
    });
    if (r.error) failed.push({ to, error: r.error });
    else sent += 1;
  }
  return { sent, failed };
}

export interface BroadcastPreview {
  recipients: number;
  alreadySent: boolean;
  sentAt?: string;
  published: boolean;
  isArchive: boolean;
  subject: string;
}

/**
 * What the confirm step shows before anything is sent. Read-only — a send to
 * 87 people has no undo, so the count is surfaced first.
 */
export async function getBroadcastPreviewAction(postId: string): Promise<BroadcastPreview> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");

  const post = await getPostById(postId);
  if (!post) throw new Error("Save the post first.");
  const recipients = await getSubscribedRecipients();
  return {
    recipients: recipients.length,
    alreadySent: Boolean(post.emailSentAt),
    sentAt: post.emailSentAt,
    published: post.status === "published",
    isArchive: Boolean(post.importedFromArchive),
    subject: post.emailSubject || post.title || "YeeHaw",
  };
}

/**
 * Send a published post to the whole subscriber list.
 *
 * Safety model, in order:
 *  - admin auth, post must exist and be published
 *  - claimEmailSend() atomically sets emailSentAt BEFORE sending, so a double
 *    click or retry can't mail anyone twice
 *  - recipients come from getSubscribedRecipients(), which excludes
 *    unsubscribed, bounced and complained addresses
 *  - each message is rendered per-recipient for a personalized unsubscribe
 *    link/header, and tagged post:<slug> so analytics attributes it
 *  - if the very first batch fails outright, the claim is released so you can
 *    fix the problem and retry
 */
export async function broadcastPostAction(
  postId: string
): Promise<{ sent: number; failedBatches: number; recipients: number }> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  if (!isEmailConfigured) throw new Error("Email isn't configured (RESEND_API_KEY).");

  const post = await getPostById(postId);
  if (!post) throw new Error("Save the post first.");
  if (post.status !== "published") {
    throw new Error("Publish the post before sending it to subscribers.");
  }
  // Backfilled Squarespace issues are published but decades old and carry no
  // emailSentAt, so without this they'd look perfectly sendable.
  if (post.importedFromArchive) {
    throw new Error("This is a backfilled archive issue — it can't be broadcast.");
  }

  const recipients = await getSubscribedRecipients();
  if (!recipients.length) throw new Error("No active subscribers to send to.");

  // Claim first — see claimEmailSend. Losing the race means someone/something
  // already sent this issue.
  const claimed = await claimEmailSend(postId);
  if (!claimed) {
    throw new Error("This issue has already been sent to subscribers.");
  }

  const messages: BatchEmail[] = recipients.map((to) => {
    const { subject, html } = renderPostEmail(post, { unsubscribeUrl: unsubscribeUrl(to) });
    return {
      to,
      subject,
      html,
      headers: listUnsubscribeHeaders(to),
      tags: [{ name: "post", value: post.slug }],
    };
  });

  let sent = 0;
  let failedBatches = 0;
  for (let i = 0; i < messages.length; i += BATCH_MAX) {
    const chunk = messages.slice(i, i + BATCH_MAX);
    const res = await sendBatch(chunk);
    if (res.error) {
      failedBatches += 1;
      console.error("broadcast batch failed:", res.error);
      // Nothing went out at all — let the user fix and retry.
      if (i === 0 && sent === 0) {
        await releaseEmailSend(postId);
        throw new Error(`Send failed, nothing went out: ${res.error}`);
      }
    } else {
      sent += chunk.length;
    }
    // Resend allows 10 req/s per team; pause between chunks to stay clear.
    if (i + BATCH_MAX < messages.length) await new Promise((r) => setTimeout(r, 500));
  }

  revalidatePath("/admin");
  return { sent, failedBatches, recipients: recipients.length };
}

/** Permanently delete a post. */
export async function deletePostAction(id: string, slug?: string): Promise<void> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  await deletePost(id);
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/admin");
  if (slug) revalidatePath(`/posts/${slug}`);
}

/** Build a "What to Watch This Weekend" HTML block from TMDb + the sports
 *  calendar. The editor inserts it; the author trims/edits before publishing. */
export async function generateWhatToWatchAction(): Promise<{ html: string }> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  if (!isTmdbConfigured) throw new Error("TMDB_API_KEY is not configured.");
  const picks = await getWeekendPicks(new Date());
  return { html: renderWhatToWatchHtml(picks) };
}
