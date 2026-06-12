import { NextRequest, NextResponse } from "next/server";
import { verifyUnsub } from "@/lib/unsubscribe";
import { setSubscriberStatus } from "@/lib/repo/subscribers";

// Unsubscribe via a signed token — no login. Used by Gmail/Yahoo one-click
// (List-Unsubscribe-Post) and by the confirm page's button. email + token come
// from the query string; one-click bodies are `List-Unsubscribe=One-Click`.
export const dynamic = "force-dynamic";

async function unsubscribe(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("e") || "";
  const token = req.nextUrl.searchParams.get("t") || "";
  if (!email || !verifyUnsub(email, token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  await setSubscriberStatus(email, "unsubscribed");
  return NextResponse.json({ ok: true });
}

export const POST = unsubscribe;

// A GET must NOT have side effects (mail scanners prefetch links). Bounce it to
// the human confirm page instead.
export function GET(req: NextRequest) {
  const e = req.nextUrl.searchParams.get("e") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  return NextResponse.redirect(
    new URL(`/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`, req.url)
  );
}
