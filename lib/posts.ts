import type { Post } from "./types";

// Fallback content shown when Firestore has no published posts yet (or isn't
// configured). Lets the public site look alive during development. Once you
// publish real posts, these disappear automatically.

function sample(
  partial: Pick<Post, "slug" | "title" | "dek" | "stamp" | "publishedAt"> &
    Partial<Post>
): Post {
  return {
    id: partial.slug,
    postType: "roundup",
    status: "published",
    bodyMarkdown: partial.bodyMarkdown ?? "",
    tags: [],
    categories: [],
    createdAt: partial.publishedAt ?? "",
    updatedAt: partial.publishedAt ?? "",
    ...partial,
  };
}

export const samplePosts: Post[] = [
  sample({
    slug: "the-best-90s-websites-still-online",
    title: "The Best '90s Websites Still Online",
    dek: "Geocities is gone but the spirit lives. A little tour of the web that refused to grow up.",
    stamp: "weirdFind",
    publishedAt: "2026-05-12",
    bodyMarkdown:
      "Geocities is gone but the spirit lives on in a handful of pages that never got the memo.\n\nThis is placeholder content — your real issues will appear here once you publish them from the admin.",
  }),
  sample({
    slug: "notes-from-a-random-tuesday",
    title: "Notes From a Random Tuesday",
    dek: "A grab bag of small thoughts, a great pen, and the case for buying the nicer olive oil.",
    stamp: "fieldNote",
    postType: "essay",
    publishedAt: "2026-05-07",
    bodyMarkdown:
      "Some Tuesdays just have a texture to them.\n\nThis is placeholder content for an *essay*-type post.",
  }),
  sample({
    slug: "five-things-im-digging",
    title: "5 Things I'm Digging Right Now",
    dek: "A film, an album, a snack, a browser tab I can't close, and one genuinely useful gadget.",
    stamp: "bonusTrack",
    publishedAt: "2026-05-05",
    bodyMarkdown: "Placeholder roundup content.",
  }),
  sample({
    slug: "a-useful-tool-i-found-this-week",
    title: "A Useful Tool I Found This Week",
    dek: "It does one small thing, does it perfectly, and costs nothing. The good kind of software.",
    stamp: "powerUp",
    publishedAt: "2026-05-03",
    bodyMarkdown: "Placeholder roundup content.",
  }),
];

export const isSamplePost = (id: string) =>
  samplePosts.some((p) => p.id === id);
