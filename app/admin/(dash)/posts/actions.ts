"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth";
import { savePost, type PostInput } from "@/lib/repo/posts";
import { getWeekendPicks, renderWhatToWatchHtml, isTmdbConfigured } from "@/lib/tmdb";

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

/** Build a "What to Watch This Weekend" HTML block from TMDb + the sports
 *  calendar. The editor inserts it; the author trims/edits before publishing. */
export async function generateWhatToWatchAction(): Promise<{ html: string }> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  if (!isTmdbConfigured) throw new Error("TMDB_API_KEY is not configured.");
  const picks = await getWeekendPicks(new Date());
  return { html: renderWhatToWatchHtml(picks) };
}
