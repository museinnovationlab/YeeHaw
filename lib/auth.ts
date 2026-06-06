import "server-only";
import { cookies } from "next/headers";
import { adminAuth, isFirebaseAdminConfigured } from "./firebase/admin";

export const SESSION_COOKIE = "yh_session";

export interface SessionUser {
  uid: string;
  email?: string;
}

function adminUids(): string[] {
  return (process.env.ADMIN_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminUid(uid: string): boolean {
  const allow = adminUids();
  // If no allowlist is configured, deny by default (fail closed).
  return allow.length > 0 && allow.includes(uid);
}

/** Read + verify the session cookie. Returns null if missing/invalid. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isFirebaseAdminConfigured) return null;
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

/** Session user that is also on the admin allowlist, else null. */
export async function getAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (user && isAdminUid(user.uid)) return user;
  return null;
}
