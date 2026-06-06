import { NextRequest, NextResponse } from "next/server";
import { adminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { SESSION_COOKIE, isAdminUid } from "@/lib/auth";

// 5 days
const MAX_AGE_MS = 60 * 60 * 24 * 5 * 1000;

/** POST { idToken } -> verify, check admin allowlist, set httpOnly session cookie. */
export async function POST(req: NextRequest) {
  if (!isFirebaseAdminConfigured) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }
  const { idToken } = await req.json().catch(() => ({ idToken: undefined }));
  if (!idToken) {
    return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
  }
  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    if (!isAdminUid(decoded.uid)) {
      return NextResponse.json({ error: "not_authorized" }, { status: 403 });
    }
    const sessionCookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: MAX_AGE_MS,
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_MS / 1000,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
}

/** DELETE -> clear the session cookie (sign out). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
