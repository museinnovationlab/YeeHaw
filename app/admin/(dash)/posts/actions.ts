"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth";
import { savePost, deletePost, getPostById, type PostInput } from "@/lib/repo/posts";
import { getWeekendPicks, renderWhatToWatchHtml, isTmdbConfigured } from "@/lib/tmdb";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { renderPostEmail } from "@/lib/emailTemplate";
import { unsubscribeUrl, listUnsubscribeHeaders } from "@/lib/unsubscribe";

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
