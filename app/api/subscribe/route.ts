import { NextRequest, NextResponse } from "next/server";
import { addSubscriber } from "@/lib/repo/subscribers";

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
  // Same response whether newly added or already on the list — don't leak
  // membership (email enumeration).
  return NextResponse.json({ ok: true });
}
