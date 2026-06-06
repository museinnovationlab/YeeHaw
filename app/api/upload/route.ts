import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { uploadImage, isCloudinaryConfigured } from "@/lib/cloudinary";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

/** Admin-only image upload → Cloudinary. Returns { url }. */
export async function POST(req: NextRequest) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isCloudinaryConfigured) {
    return NextResponse.json({ error: "cloudinary_not_configured" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, width, height } = await uploadImage(buffer, file.name);
    return NextResponse.json({ url, width, height });
  } catch (err) {
    console.error("upload failed:", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
