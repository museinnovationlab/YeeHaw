import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import type { Post, PostStatus, PostType } from "@/lib/types";
import { samplePosts } from "@/lib/posts";

const COLLECTION = "posts";

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "post"
  );
}

export interface PostInput {
  id?: string;
  title: string;
  slug?: string;
  subtitle?: string;
  dek?: string;
  postType: PostType;
  status: PostStatus;
  bodyHtml?: string;
  bodyMarkdown?: string;
  stamp?: string;
  seoTitle?: string;
  seoDescription?: string;
  emailSubject?: string;
  emailPreviewText?: string;
  tags?: string[];
  categories?: string[];
  /** ISO date — set for archive imports / manual date overrides */
  publishedAt?: string;
  importedFromArchive?: boolean;
  hasAffiliateLinks?: boolean;
}

/** Fetch any post by id (any status) for editing. */
export async function getPostById(id: string): Promise<Post | null> {
  if (!isFirebaseAdminConfigured) {
    return samplePosts.find((p) => p.id === id) ?? null;
  }
  const doc = await adminDb().collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return toPost(doc.id, doc.data() as Record<string, unknown>);
}

/** Create or update a post. Returns the document id. */
export async function savePost(input: PostInput): Promise<{ id: string; slug: string }> {
  const db = adminDb();
  const now = FieldValue.serverTimestamp();
  const slug = (input.slug?.trim() || slugify(input.title || "untitled")).toLowerCase();

  const data: Record<string, unknown> = {
    title: input.title ?? "",
    slug,
    subtitle: input.subtitle ?? "",
    dek: input.dek ?? "",
    postType: input.postType ?? "roundup",
    status: input.status ?? "draft",
    bodyHtml: input.bodyHtml ?? "",
    bodyMarkdown: input.bodyMarkdown ?? "",
    stamp: input.stamp ?? "",
    seoTitle: input.seoTitle ?? "",
    seoDescription: input.seoDescription ?? "",
    emailSubject: input.emailSubject ?? "",
    emailPreviewText: input.emailPreviewText ?? "",
    tags: input.tags ?? [],
    categories: input.categories ?? [],
    importedFromArchive: input.importedFromArchive ?? false,
    hasAffiliateLinks: input.hasAffiliateLinks ?? false,
    updatedAt: now,
  };
  if (input.publishedAt) data.publishedAt = new Date(input.publishedAt);

  if (input.id) {
    const ref = db.collection(COLLECTION).doc(input.id);
    // On first publish (no explicit date), stamp publishedAt = now.
    if (input.status === "published" && !input.publishedAt) {
      const existing = await ref.get();
      if (!existing.data()?.publishedAt) data.publishedAt = now;
    }
    await ref.set(data, { merge: true });
    return { id: input.id, slug };
  }

  data.createdAt = now;
  if (input.status === "published" && !data.publishedAt) data.publishedAt = now;
  const ref = await db.collection(COLLECTION).add(data);
  return { id: ref.id, slug };
}

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
