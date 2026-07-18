import { NextRequest, NextResponse } from "next/server";
import { addSubscriber } from "@/lib/repo/subscribers";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { renderWelcomeEmail } from "@/lib/emailTemplate";
import { unsubscribeUrl, listUnsubscribeHeaders } from "@/lib/unsubscribe";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs"; // firebase-admin can't run on Edge

// A signup now sends a real welcome email, which makes this endpoint a way to
// mail a stranger by typing their address in. Per-address damage is capped at
// one message (a repeat returns "exists" and sends nothing), so the control
// that matters is limiting how many DIFFERENT addresses one source can enrol.
const MAX_PER_IP = 5;
const WINDOW_SECONDS = 3600; // 1 hour

// Public newsletter signup. No auth — anyone can subscribe themselves.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email : "";
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  // Honeypot: a field hidden from humans but happily filled by dumb bots.
  // Answer 200 so the bot believes it worked and doesn't adapt.
  if (typeof body?.website === "string" && body.website.trim()) {
    return NextResponse.json({ ok: true });
  }

  const ip = clientIp(req.headers);
  const limit = await rateLimit({
    key: `subscribe:${ip}`,
    limit: MAX_PER_IP,
    windowSeconds: WINDOW_SECONDS,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const result = await addSubscriber(email, { source: "site" });
  if (result === "invalid") {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Only NEW signups get a welcome email (never re-welcome an existing member,
  // and bulk imports never hit this route). A send failure must not fail the
  // subscribe — the person is on the list either way.
  if (result === "added" && isEmailConfigured) {
    try {
      const { subject, html } = renderWelcomeEmail({ unsubscribeUrl: unsubscribeUrl(email) });
      await sendEmail({
        to: email,
        subject,
        html,
        headers: listUnsubscribeHeaders(email),
        tags: [{ name: "type", value: "welcome" }],
      });
    } catch (err) {
      console.error("welcome email failed:", err);
    }
  }

  // Same response whether newly added or already on the list — don't leak
  // membership (email enumeration).
  return NextResponse.json({ ok: true });
}
