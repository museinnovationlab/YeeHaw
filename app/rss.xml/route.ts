import { getPublishedPosts } from "@/lib/repo/posts";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";

export const revalidate = 3600;

function imageMime(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return (ext && map[ext]) || "image/jpeg";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await getPublishedPosts();

  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/posts/${p.slug}`;
      const date = p.publishedAt ? new Date(p.publishedAt).toUTCString() : "";
      const desc = (p.seoDescription ?? p.dek ?? "").slice(0, 500);
      return [
        "    <item>",
        `      <title>${esc(p.seoTitle ?? p.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        date ? `      <pubDate>${date}</pubDate>` : "",
        `      <description>${esc(desc)}</description>`,
        p.featuredImageUrl
          ? `      <enclosure url="${esc(p.featuredImageUrl)}" type="${imageMime(p.featuredImageUrl)}" />`
          : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(`${SITE_NAME} — ${SITE_TAGLINE}`)}</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${esc(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
