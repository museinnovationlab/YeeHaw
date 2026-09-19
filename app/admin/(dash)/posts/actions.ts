"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth";
import {
  savePost,
  deletePost,
  getPostById,
  claimBlueskyPost,
  releaseBlueskyPost,
  recordBlueskyUrl,
  setScheduledSend,
  type PostInput,
} from "@/lib/repo/posts";
import { broadcastPost } from "@/lib/broadcast";
import { getWeekendPicks, renderWhatToWatchHtml, isTmdbConfigured } from "@/lib/tmdb";
import { sendEmail, isEmailConfigured, DAILY_LIMIT } from "@/lib/email";
import { renderPostEmail } from "@/lib/emailTemplate";
import { resolveEmailEmbeds } from "@/lib/emailEmbeds";
import { unsubscribeUrl, listUnsubscribeHeaders } from "@/lib/unsubscribe";
import { getSubscribedRecipients } from "@/lib/repo/subscribers";
import { postToBluesky, isBlueskyConfigured } from "@/lib/bluesky";
import { generateShareBlurb, type SharePlatform } from "@/lib/ai";
import { SITE_URL } from "@/lib/site";

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

  // Resolve video/Spotify embeds into image cards ONCE, not per recipient.
  const emailPost = { ...post, bodyHtml: await resolveEmailEmbeds(post.bodyHtml ?? "") };

  let sent = 0;
  const failed: { to: string; error: string }[] = [];
  for (const to of unique) {
    // Render per-recipient so the unsubscribe link/header is personalized.
    const { subject, html } = renderPostEmail(emailPost, {
      unsubscribeUrl: unsubscribeUrl(to, post.slug),
    });
    const r = await sendEmail({
      to,
      subject: `[TEST] ${subject}`,
      html,
      headers: listUnsubscribeHeaders(to, post.slug),
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
  /** the Resend plan's daily cap (0 = none) and whether this send exceeds it */
  dailyLimit: number;
  overLimit: boolean;
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
    dailyLimit: DAILY_LIMIT,
    overLimit: DAILY_LIMIT > 0 && recipients.length > DAILY_LIMIT,
  };
}

/** Send a published post to the whole list — see lib/broadcast.ts for the rails. */
export async function broadcastPostAction(
  postId: string
): Promise<{ sent: number; failedBatches: number; recipients: number }> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  const post = await getPostById(postId);
  if (!post) throw new Error("Save the post first.");
  const result = await broadcastPost(post);
  revalidatePath("/admin");
  return result;
}

/**
 * Schedule (or cancel, with null) the broadcast for an already-published post.
 * The cron fires it within ~15 minutes of the time. Unpublished posts set
 * their send time through the schedule flow in save() instead.
 */
export async function scheduleSendAction(postId: string, whenIso: string | null): Promise<void> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  const post = await getPostById(postId);
  if (!post) throw new Error("Save the post first.");
  if (whenIso) {
    if (post.emailSentAt) throw new Error("This issue has already been sent.");
    if (post.status !== "published") throw new Error("Publish the post first, or schedule the send when you schedule the post.");
    if (new Date(whenIso).getTime() < Date.now() - 60_000) throw new Error("Pick a time in the future.");
  }
  await setScheduledSend(postId, whenIso);
  revalidatePath("/admin");
}

/**
 * Cross-post a published issue to Bluesky.
 *
 * Claim-before-post (same reasoning as the broadcast): republishing, a double
 * click, or the cron re-running must never produce two posts. If the post
 * itself fails, the claim is released so it can be retried.
 */
export async function postToBlueskyAction(
  postId: string,
  blurbOverride?: string
): Promise<{ url?: string; skipped?: string; error?: string }> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  if (!isBlueskyConfigured) return { skipped: "Bluesky isn't configured." };

  const post = await getPostById(postId);
  if (!post) throw new Error("Save the post first.");
  if (post.status !== "published") return { skipped: "Publish the post first." };
  if (post.importedFromArchive) return { skipped: "Archive imports aren't cross-posted." };
  if (post.bskyPostedAt) return { skipped: "Already posted to Bluesky." };

  const claimed = await claimBlueskyPost(postId);
  if (!claimed) return { skipped: "Already posted to Bluesky." };

  try {
    const url = `${SITE_URL}/posts/${post.slug}`;
    const blurb =
      blurbOverride?.trim() ||
      (await generateShareBlurb({
        platform: "bluesky",
        title: post.title,
        dek: post.dek,
        bodyHtml: post.bodyHtml,
      }).catch(() => post.dek || post.title));

    const res = await postToBluesky({
      text: `${blurb}\n\n${url}`,
      url,
      title: post.title,
      description: post.dek,
      imageUrl: post.featuredImageUrl,
    });
    if (res.error || !res.url) {
      await releaseBlueskyPost(postId);
      return { error: res.error || "Bluesky post failed." };
    }
    await recordBlueskyUrl(postId, res.url);
    revalidatePath("/admin");
    return { url: res.url };
  } catch (e) {
    await releaseBlueskyPost(postId);
    return { error: e instanceof Error ? e.message : "Bluesky post failed." };
  }
}

export type ShareKit = Record<SharePlatform | "substack", string>;

/**
 * Draft share copy for the platforms that have no usable posting API —
 * Substack has none at all, X charges for write access, and Threads and
 * Instagram require a business account plus Meta app review. Copy-paste is the
 * honest answer for those, so make the copy good.
 */
export async function generateShareKitAction(postId: string): Promise<ShareKit> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");

  const post = await getPostById(postId);
  if (!post) throw new Error("Save the post first.");
  const url = `${SITE_URL}/posts/${post.slug}`;
  const base = { title: post.title, dek: post.dek, bodyHtml: post.bodyHtml };

  const platforms: SharePlatform[] = ["threads", "twitter", "instagram"];
  const blurbs = await Promise.all(
    platforms.map((platform) =>
      generateShareBlurb({ platform, ...base })
        .then((text) => ({ platform, text }))
        .catch(() => ({ platform, text: "" }))
    )
  );

  const kit = { substack: post.substackMarkdown || htmlToMarkdown(post.bodyHtml || "") } as ShareKit;
  for (const b of blurbs) {
    // Instagram can't have a clickable link in the caption, so don't paste one.
    kit[b.platform] = b.platform === "instagram" ? b.text : `${b.text}\n\n${url}`;
  }
  kit.bluesky = "";
  return kit;
}

/** Minimal HTML -> Markdown for the Substack paste. */
function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "_$1_")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, "\n![]($1)\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<hr[^>]*>/gi, "\n---\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
