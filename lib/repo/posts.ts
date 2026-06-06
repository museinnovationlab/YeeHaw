import "server-only";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import type { Post } from "@/lib/types";
import { samplePosts } from "@/lib/posts";

const COLLECTION = "posts";

// Convert a Firestore doc (with Timestamp fields) into a plain, serializable Post.
function toPost(id: string, data: Record<string, unknown>): Post {
  const iso = (v: unknown): string | undefined => {
    if (!v) return undefined;
    // Firestore Timestamp has toDate(); also handle ISO strings.
    const ts = v as { toDate?: () => Date };
    if (typeof ts.toDate === "function") return ts.toDate().toISOString();
    if (typeof v === "string") return v;
    return undefined;
  };
  return {
    ...(data as unknown as Post),
    id,
    createdAt: iso(data.createdAt) ?? "",
    updatedAt: iso(data.updatedAt) ?? "",
    reviewedAt: iso(data.reviewedAt),
    publishedAt: iso(data.publishedAt),
    scheduledFor: iso(data.scheduledFor),
  };
}

/** Published posts, newest first. Falls back to sample posts when Firestore is
 *  unconfigured or empty so the public site is never blank during development. */
export async function getPublishedPosts(): Promise<Post[]> {
  if (!isFirebaseAdminConfigured) return samplePosts;
  try {
    // Single equality filter (no orderBy) avoids needing a composite index;
    // sort in memory — fine for a personal-scale blog.
    const snap = await adminDb()
      .collection(COLLECTION)
      .where("status", "==", "published")
      .get();
    if (snap.empty) return samplePosts;
    return snap.docs
      .map((d) => toPost(d.id, d.data()))
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  } catch (err) {
    console.error("getPublishedPosts failed, using samples:", err);
    return samplePosts;
  }
}

/** All posts regardless of status, newest-updated first. Admin use only. */
export async function getAllPosts(): Promise<Post[]> {
  if (!isFirebaseAdminConfigured) return samplePosts;
  try {
    const snap = await adminDb().collection(COLLECTION).get();
    return snap.docs
      .map((d) => toPost(d.id, d.data()))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  } catch (err) {
    console.error("getAllPosts failed:", err);
    return [];
  }
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  if (!isFirebaseAdminConfigured) {
    return samplePosts.find((p) => p.slug === slug) ?? null;
  }
  try {
    const snap = await adminDb()
      .collection(COLLECTION)
      .where("slug", "==", slug)
      .where("status", "==", "published")
      .limit(1)
      .get();
    if (snap.empty) {
      return samplePosts.find((p) => p.slug === slug) ?? null;
    }
    const d = snap.docs[0];
    return toPost(d.id, d.data());
  } catch (err) {
    console.error("getPostBySlug failed:", err);
    return samplePosts.find((p) => p.slug === slug) ?? null;
  }
}
