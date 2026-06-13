import { NextRequest, NextResponse } from "next/server";
import { addSubscriber } from "@/lib/repo/subscribers";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { renderWelcomeEmail } from "@/lib/emailTemplate";
import { unsubscribeUrl, listUnsubscribeHeaders } from "@/lib/unsubscribe";

// Public newsletter signup. No auth — anyone can subscribe themselves.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email : "";
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
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
