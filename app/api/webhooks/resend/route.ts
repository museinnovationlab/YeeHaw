import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { recordEmailEvent } from "@/lib/repo/emailEvents";

// Resend webhooks are signed with Svix. We verify the signature, then store the
// event (delivered/opened/clicked/bounced/complained) keyed by the unique svix
// message id (idempotent on retries).
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // node:crypto + firebase-admin need Node, not Edge

function verifySvix(secret: string, id: string, ts: string, sig: string, body: string): boolean {
  if (!id || !ts || !sig) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  // header is space-separated "v1,<sig> v1,<sig>"
  for (const part of sig.split(" ")) {
    const s = part.split(",")[1];
    if (!s) continue;
    const a = Buffer.from(s);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  // Wrap everything so ANY failure is reported in the response body (visible in
  // Resend's delivery log) instead of an opaque 500.
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

    const body = await req.text();
    // Svix headers come as either svix-* or the standard webhook-* names.
    const h = (a: string, b: string) => req.headers.get(a) || req.headers.get(b) || "";
    const id = h("svix-id", "webhook-id");
    const ts = h("svix-timestamp", "webhook-timestamp");
    const signature = h("svix-signature", "webhook-signature");
    if (!verifySvix(secret, id, ts, signature, body)) {
      return NextResponse.json({ error: "bad_signature" }, { status: 401 });
    }

    const evt = JSON.parse(body) as { type?: string; data?: Record<string, unknown> };
    const data = (evt.data ?? {}) as {
      email_id?: string;
      to?: string | string[];
      tags?: { name: string; value: string }[];
      click?: { link?: string };
    };
    const type = (evt.type ?? "").replace(/^email\./, "");
    const recipient = Array.isArray(data.to) ? data.to[0] : data.to ?? "";
    const post = (data.tags ?? []).find((t) => t.name === "post")?.value;

    await recordEmailEvent({
      id: id || `${data.email_id}-${type}-${Date.now()}`,
      type,
      emailId: data.email_id ?? "",
      recipient,
      post,
      link: data.click?.link,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("resend webhook error:", err);
    return NextResponse.json(
      { error: "webhook_error", detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err) },
      { status: 500 }
    );
  }
}
