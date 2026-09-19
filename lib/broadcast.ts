import "server-only";
import type { Post } from "@/lib/types";
import { sendBatch, isEmailConfigured, BATCH_MAX, DAILY_LIMIT, type BatchEmail } from "@/lib/email";
import { renderPostEmail } from "@/lib/emailTemplate";
import { resolveEmailEmbeds } from "@/lib/emailEmbeds";
import { unsubscribeUrl, listUnsubscribeHeaders } from "@/lib/unsubscribe";
import { getSubscribedRecipients } from "@/lib/repo/subscribers";
import { claimEmailSend, releaseEmailSend, recordEmailRecipients } from "@/lib/repo/posts";

export interface BroadcastResult {
  sent: number;
  failedBatches: number;
  recipients: number;
}

/**
 * Send a published post to the whole subscriber list.
 *
 * Shared by the editor's "Send to subscribers" button and the cron (for
 * scheduled sends), so both paths get identical safety rails:
 *  - post must be published and not a backfilled archive issue
 *  - refuses BEFORE claiming if the recipient count exceeds the Resend plan's
 *    daily cap — a partial send can't be resumed once emailSentAt is set
 *  - claimEmailSend() atomically sets emailSentAt before sending, so a double
 *    click, a retry, or a cron re-run can never mail anyone twice
 *  - recipients exclude unsubscribed, bounced and complained addresses
 *  - embeds resolve to image cards ONCE, then each message renders with its
 *    own unsubscribe link and the post tag that drives analytics
 *  - if nothing at all went out, the claim is released so it can be retried
 *
 * Callers are responsible for auth (the action checks the admin session; the
 * cron checks CRON_SECRET).
 */
export async function broadcastPost(post: Post): Promise<BroadcastResult> {
  if (!isEmailConfigured) throw new Error("Email isn't configured (RESEND_API_KEY).");
  if (post.status !== "published") {
    throw new Error("Publish the post before sending it to subscribers.");
  }
  if (post.importedFromArchive) {
    throw new Error("This is a backfilled archive issue — it can't be broadcast.");
  }

  const recipients = await getSubscribedRecipients();
  if (!recipients.length) throw new Error("No active subscribers to send to.");

  if (DAILY_LIMIT > 0 && recipients.length > DAILY_LIMIT) {
    throw new Error(
      `This would send ${recipients.length} emails but the Resend plan allows ${DAILY_LIMIT}/day. ` +
        `Nothing was sent. Upgrade the Resend plan, then set RESEND_DAILY_LIMIT=0 in Vercel.`
    );
  }

  const claimed = await claimEmailSend(post.id);
  if (!claimed) throw new Error("This issue has already been sent to subscribers.");

  let sent = 0;
  let failedBatches = 0;
  try {
    const emailPost = { ...post, bodyHtml: await resolveEmailEmbeds(post.bodyHtml ?? "") };
    const messages: BatchEmail[] = recipients.map((to) => {
      const { subject, html } = renderPostEmail(emailPost, {
        unsubscribeUrl: unsubscribeUrl(to, post.slug),
      });
      return {
        to,
        subject,
        html,
        headers: listUnsubscribeHeaders(to, post.slug),
        tags: [{ name: "post", value: post.slug }],
      };
    });

    for (let i = 0; i < messages.length; i += BATCH_MAX) {
      const chunk = messages.slice(i, i + BATCH_MAX);
      const res = await sendBatch(chunk);
      if (res.error) {
        failedBatches += 1;
        console.error("broadcast batch failed:", res.error);
        if (i === 0 && sent === 0) {
          await releaseEmailSend(post.id);
          throw new Error(`Send failed, nothing went out: ${res.error}`);
        }
      } else {
        // Count what Resend actually accepted, not what we handed it.
        const accepted = res.ids.length || chunk.length;
        if (res.ids.length && res.ids.length !== chunk.length) {
          console.error(`broadcast: submitted ${chunk.length} but Resend accepted ${res.ids.length}`);
        }
        sent += accepted;
      }
      // Resend allows 10 req/s per team; pause between chunks to stay clear.
      if (i + BATCH_MAX < messages.length) await new Promise((r) => setTimeout(r, 500));
    }
  } catch (e) {
    // Rendering/resolution failed before anything was sent: give the claim back.
    if (sent === 0) await releaseEmailSend(post.id).catch(() => {});
    throw e;
  }

  await recordEmailRecipients(post.id, sent).catch(() => {});
  return { sent, failedBatches, recipients: recipients.length };
}
