import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import {
  publishDueScheduledPosts,
  getPostById,
  claimBlueskyPost,
  releaseBlueskyPost,
  recordBlueskyUrl,
  getDueScheduledSends,
  recordScheduleError,
} from "@/lib/repo/posts";
import { broadcastPost } from "@/lib/broadcast";
import type { Post } from "@/lib/types";
import { postToBluesky, isBlueskyConfigured } from "@/lib/bluesky";
import { generateShareBlurb } from "@/lib/ai";
import { SITE_URL } from "@/lib/site";

// Publishes scheduled posts whose time has come. Triggered by a scheduler
// (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically; an
// external pinger like cron-job.org can send the same header). Idempotent.
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  // Header only — never a query param (secrets in URLs end up in access logs).
  const auth = req.headers.get("authorization");
  if (!auth || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const published = await publishDueScheduledPosts();

  if (published.length) {
    revalidatePath("/");
    revalidatePath("/archive");
    for (const p of published) revalidatePath(`/posts/${p.slug}`);

    // Cross-post scheduled issues as they go live. Claim-guarded, so a cron
    // retry can't double-post. The email broadcast stays MANUAL on purpose —
    // it has no undo, so it always waits for an explicit click.
    if (isBlueskyConfigured) {
      for (const p of published) {
        try {
          const post = await getPostById(p.id);
          if (!post || post.bskyEnabled === false || post.importedFromArchive) continue;
          if (post.bskyPostedAt) continue;
          if (!(await claimBlueskyPost(p.id))) continue;
          const url = `${SITE_URL}/posts/${post.slug}`;
          const blurb = await generateShareBlurb({
            platform: "bluesky",
            title: post.title,
            dek: post.dek,
            bodyHtml: post.bodyHtml,
          }).catch(() => post.dek || post.title);
          const r = await postToBluesky({
            text: `${blurb}\n\n${url}`,
            url,
            title: post.title,
            description: post.dek,
            imageUrl: post.featuredImageUrl,
          });
          if (r.url) await recordBlueskyUrl(p.id, r.url);
          else await releaseBlueskyPost(p.id);
        } catch (e) {
          console.error("cron bluesky post failed:", e);
          await releaseBlueskyPost(p.id).catch(() => {});
        }
      }
    }
  }

  // Scheduled email sends, strictly AFTER publishing so a send can never run
  // ahead of the publish it depends on. Two sources:
  //  1. posts that just published with "email when it publishes" ticked
  //  2. published posts whose separate send time has arrived
  // broadcastPost() carries all the rails (claim-before-send, quota guard,
  // suppression). A failure is recorded on the post and the schedule cleared —
  // retrying an over-quota send every 15 minutes would never succeed, and the
  // editor shows the reason so the author can send manually.
  const emailed: string[] = [];
  const emailFailed: string[] = [];
  async function trySend(post: Post) {
    if (post.emailSentAt) return;
    try {
      await broadcastPost(post);
      emailed.push(post.slug);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "send failed";
      console.error(`cron broadcast failed for ${post.slug}:`, msg);
      await recordScheduleError(post.id, msg).catch(() => {});
      emailFailed.push(post.slug);
    }
  }
  for (const p of published) {
    const post = await getPostById(p.id);
    if (post?.emailOnPublish) await trySend(post);
  }
  for (const post of await getDueScheduledSends()) await trySend(post);

  return NextResponse.json({
    ok: true,
    published: published.length,
    slugs: published.map((p) => p.slug),
    emailed,
    emailFailed,
  });
}

export const GET = handle;
export const POST = handle;
