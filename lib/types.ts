// Core data model for YeeHaw, mirroring the Firestore collections in the spec.
// Timestamps are stored as Firestore Timestamps but surfaced to the app as ISO
// strings (serializable across the server/client boundary).

export type PostType = "roundup" | "essay";

export type PostStatus =
  | "idea"
  | "draft"
  | "reviewed"
  | "scheduled"
  | "published"
  | "archived";

export type ItemType =
  | "movie"
  | "album"
  | "song"
  | "book"
  | "product"
  | "article"
  | "website"
  | "video"
  | "other";

export interface RecommendationItem {
  id: string;
  postId: string;
  type: ItemType;
  title: string;
  creator?: string;
  year?: string;
  url?: string;
  affiliateUrl?: string;
  userNote: string;
  /** optional mixtape section/stamp label, e.g. "weird-find" — drives the sticker */
  section?: string;
  priority?: number;
  tags: string[];
  imageUrl?: string;
  imageCredit?: string;
  imageAlt?: string;
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  subtitle?: string;
  dek?: string;
  postType: PostType;
  status: PostStatus;
  /** true = backfilled from the old Squarespace archive; never triggers email */
  importedFromArchive?: boolean;
  /** computed at publish: any item has an affiliateUrl -> show disclosure footer */
  hasAffiliateLinks?: boolean;
  bodyMarkdown: string;
  bodyHtml?: string;
  substackMarkdown?: string;
  emailSubject?: string;
  emailPreviewText?: string;
  seoTitle?: string;
  seoDescription?: string;
  featuredImageUrl?: string;
  /** stamp key for the homepage/card badge, e.g. "weird-find" */
  stamp?: string;
  tags: string[];
  categories: string[];
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  publishedAt?: string;
  scheduledFor?: string;
  /** set once the broadcast email goes out, so editing later never re-sends */
  emailSentAt?: string;
  /** how many messages Resend accepted for this issue — the denominator that
   *  makes "delivered" meaningful (delivery confirms over hours, not instantly) */
  emailRecipients?: number;
}

/** A future recommendation idea the user has stashed for an eventual post. */
export type StashStatus = "active" | "used" | "removed";

export interface StashItem {
  id: string;
  text: string; // freeform: a link + a quick note, the way you'd paste into the AI box
  status: StashStatus;
  createdAt: string;
  usedAt?: string;
  removedAt?: string;
}

export type SubscriberStatus =
  | "subscribed"
  | "unsubscribed"
  | "bounced"
  | "complained";

export interface Subscriber {
  id: string;
  email: string;
  name?: string;
  status: SubscriberStatus;
  source: "site" | "import" | "manual" | "substack" | "other";
  createdAt: string;
  updatedAt: string;
  unsubscribedAt?: string;
  /** set when a bounce/complaint webhook suppresses the address */
  suppressedAt?: string;
}
