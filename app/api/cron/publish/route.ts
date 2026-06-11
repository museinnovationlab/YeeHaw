import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { publishDueScheduledPosts } from "@/lib/repo/posts";

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
    // TODO(email): when Resend lands, send the broadcast here for each newly
    // published post, guarded by emailSentAt so it only ever fires once.
  }

  return NextResponse.json({
    ok: true,
    published: published.length,
    slugs: published.map((p) => p.slug),
  });
}

export const GET = handle;
export const POST = handle;
