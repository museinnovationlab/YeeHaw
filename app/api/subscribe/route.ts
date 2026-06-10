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
  // "added" and "exists" both look like success to the visitor.
  return NextResponse.json({ ok: true, status: result });
}
