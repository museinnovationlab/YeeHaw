import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { generateField, isAiConfigured, type FieldKey } from "@/lib/ai";

export const maxDuration = 60;

const FIELDS: FieldKey[] = [
  "title",
  "dek",
  "seoTitle",
  "seoDescription",
  "emailSubject",
  "emailPreviewText",
];

// Regenerate one metadata field from the post that already exists, so the
// editor can offer a per-field "give me another" button.
export async function POST(req: NextRequest) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAiConfigured) {
    return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const field = body?.field as FieldKey | undefined;
  if (!field || !FIELDS.includes(field)) {
    return NextResponse.json({ error: "bad_field" }, { status: 400 });
  }

  try {
    const value = await generateField({
      field,
      title: body?.title?.toString(),
      dek: body?.dek?.toString(),
      bodyHtml: body?.bodyHtml?.toString(),
      current: body?.current?.toString(),
    });
    return NextResponse.json({ value });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "generation_failed";
    // "Nothing to work from yet" is a user-fixable state, not a server fault.
    if (msg.startsWith("Nothing to work from")) {
      return NextResponse.json({ error: "no_content" }, { status: 400 });
    }
    console.error("field generation failed:", e);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
