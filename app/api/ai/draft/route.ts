import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { generateDraft, isAiConfigured } from "@/lib/ai";

export const maxDuration = 60; // allow time for generation

export async function POST(req: NextRequest) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAiConfigured) {
    return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const notes = (body?.notes ?? "").toString().trim();
  if (!notes) return NextResponse.json({ error: "no_notes" }, { status: 400 });

  try {
    const draft = await generateDraft({
      notes,
      theme: body?.theme?.toString(),
      postType: body?.postType?.toString(),
      mode: body?.mode === "append" ? "append" : "replace",
    });
    return NextResponse.json(draft);
  } catch (e) {
    console.error("draft generation failed:", e);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
