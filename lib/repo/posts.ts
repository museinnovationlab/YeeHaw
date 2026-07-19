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
  featuredImageUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  emailSubject?: string;
  emailPreviewText?: string;
  tags?: string[];
  categories?: string[];
  /** ISO date — set for archive imports / manual date overrides */
  publishedAt?: string;
  /** ISO datetime — when status is "scheduled", auto-publish at/after this time */
  scheduledFor?: string;
  importedFromArchive?: boolean;
  hasAffiliateLinks?: boolean;
  /** author's intent to cross-post to Bluesky when this goes live */
  bskyEnabled?: boolean;
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
    featuredImageUrl: input.featuredImageUrl ?? "",
    seoTitle: input.seoTitle ?? "",
    seoDescription: input.seoDescription ?? "",
    emailSubject: input.emailSubject ?? "",
    emailPreviewText: input.emailPreviewText ?? "",
    tags: input.tags ?? [],
    categories: input.categories ?? [],
    importedFromArchive: input.importedFromArchive ?? false,
    hasAffiliateLinks: input.hasAffiliateLinks ?? false,
    // Default ON: the author cross-posts nearly every issue, so the toggle is
    // opt-OUT. Only an explicit false suppresses it.
    bskyEnabled: input.bskyEnabled !== false,
    updatedAt: now,
  };
  if (input.publishedAt) data.publishedAt = new Date(input.publishedAt);
  // Scheduling: store the target time only while status is "scheduled".
  if (input.status === "scheduled" && input.scheduledFor) {
    data.scheduledFor = new Date(input.scheduledFor);
  }

  if (input.id) {
    const ref = db.collection(COLLECTION).doc(input.id);
    // On first publish (no explicit date), stamp publishedAt = now.
    if (input.status === "published" && !input.publishedAt) {
      const existing = await ref.get();
      if (!existing.data()?.publishedAt) data.publishedAt = now;
    }
    // Leaving the scheduled state clears the pending time.
    if (input.status !== "scheduled") data.scheduledFor = FieldValue.delete();
    await ref.set(data, { merge: true });
    return { id: input.id, slug };
  }

  data.createdAt = now;
  if (input.status === "published" && !data.publishedAt) data.publishedAt = now;
  const ref = await db.collection(COLLECTION).add(data);
  return { id: ref.id, slug };
}

/** Permanently delete a post. */
export async function deletePost(id: string): Promise<void> {
  if (!isFirebaseAdminConfigured) return;
  await adminDb().collection(COLLECTION).doc(id).delete();
}

/**
 * Claim the right to broadcast a post, atomically. Sets emailSentAt only if it
 * is currently unset and returns whether THIS call won the claim — so a double
 * click, a retry, or two tabs can never mail the list twice. The claim is taken
 * before sending: re-sending to 87 people is far worse than a send that fails
 * after the flag is set (which is recoverable by hand).
 */
export async function claimEmailSend(id: string): Promise<boolean> {
  if (!isFirebaseAdminConfigured) return false;
  const ref = adminDb().collection(COLLECTION).doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Post not found.");
    if (snap.data()?.emailSentAt) return false; // already broadcast
    tx.update(ref, { emailSentAt: FieldValue.serverTimestamp() });
    return true;
  });
}

/** Release a claim taken by claimEmailSend when the send failed outright. */
export async function releaseEmailSend(id: string): Promise<void> {
  if (!isFirebaseAdminConfigured) return;
  await adminDb().collection(COLLECTION).doc(id).update({
    emailSentAt: FieldValue.delete(),
  });
}

/**
 * Publish any scheduled posts whose scheduledFor time has arrived. Called by the
 * cron endpoint. Idempotent: a post that's already published is never touched.
 * Returns the slugs that were just published (so the caller can fire emails).
 */
export async function publishDueScheduledPosts(): Promise<
  { id: string; slug: string; title: string }[]
> {
  if (!isFirebaseAdminConfigured) return [];
  const db = adminDb();
  const now = Date.now();
  // No composite index needed: filter the (small) scheduled set in memory.
  const snap = await db.collection(COLLECTION).where("status", "==", "scheduled").get();
  const published: { id: string; slug: string; title: string }[] = [];

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const when = (d.scheduledFor as { toDate?: () => Date })?.toDate?.();
    if (!when || when.getTime() > now) continue; // not due yet
    await doc.ref.set(
      {
        status: "published",
        publishedAt: when, // publish AT the scheduled time, not the cron tick
        scheduledFor: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    published.push({ id: doc.id, slug: (d.slug as string) ?? doc.id, title: (d.title as string) ?? "" });
  }
  return published;
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
    emailSentAt: iso(data.emailSentAt),
    emailRecipients:
      typeof data.emailRecipients === "number" ? data.emailRecipients : undefined,
    bskyPostedAt: iso(data.bskyPostedAt),
    bskyUrl: (data.bskyUrl as string) || undefined,
    bskyEnabled:
      typeof data.bskyEnabled === "boolean" ? data.bskyEnabled : undefined,
  };
}

/**
 * Claim the right to cross-post, atomically — same reasoning as
 * claimEmailSend. Republishing or a double click must never double-post.
 */
export async function claimBlueskyPost(id: string): Promise<boolean> {
  if (!isFirebaseAdminConfigured) return false;
  const ref = adminDb().collection(COLLECTION).doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Post not found.");
    if (snap.data()?.bskyPostedAt) return false;
    tx.update(ref, { bskyPostedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

/** Release a Bluesky claim when the post failed, so it can be retried. */
export async function releaseBlueskyPost(id: string): Promise<void> {
  if (!isFirebaseAdminConfigured) return;
  await adminDb().collection(COLLECTION).doc(id).update({
    bskyPostedAt: FieldValue.delete(),
  });
}

/** Store the permalink after a successful cross-post. */
export async function recordBlueskyUrl(id: string, url: string): Promise<void> {
  if (!isFirebaseAdminConfigured) return;
  await adminDb().collection(COLLECTION).doc(id).update({ bskyUrl: url });
}

/** Record how many messages Resend accepted, so Analytics has a denominator. */
export async function recordEmailRecipients(id: string, n: number): Promise<void> {
  if (!isFirebaseAdminConfigured) return;
  await adminDb().collection(COLLECTION).doc(id).update({ emailRecipients: n });
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
