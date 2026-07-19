import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SubscribeCta from "@/components/SubscribeCta";
import AffiliateDisclosure from "@/components/AffiliateDisclosure";
import Sticker from "@/components/Sticker";
import PostStamps from "@/components/PostStamps";
import JsonLd from "@/components/JsonLd";
import { stamps, type StampKey } from "@/lib/brand";
import { formatDateLong } from "@/lib/format";
import { getPostBySlug, getPublishedPosts } from "@/lib/repo/posts";
import { cleanHtml } from "@/lib/sanitize";
import { decorateHr } from "@/lib/decor";
import { SITE_URL, SITE_NAME, SITE_AUTHOR } from "@/lib/site";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: "Not found · YeeHaw" };
  return {
    title: `${post.seoTitle ?? post.title} · YeeHaw`,
    description: post.seoDescription ?? post.dek,
    openGraph: post.featuredImageUrl
      ? { images: [{ url: post.featuredImageUrl }] }
      : undefined,
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const stamp = stamps[(post.stamp as StampKey) ?? "nowPlaying"] ?? stamps.nowPlaying;

  const postUrl = `${SITE_URL}/posts/${post.slug}`;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.dek,
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt ?? post.publishedAt,
    ...(post.featuredImageUrl ? { image: post.featuredImageUrl } : {}),
    author: { "@type": "Person", name: SITE_AUTHOR },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": postUrl },
    url: postUrl,
  };

  return (
    <div className="overflow-x-clip">
      <JsonLd data={articleLd} />
      <SiteHeader />

      <div className="relative mx-auto max-w-6xl">
        <PostStamps seed={post.slug} />
        <article className="relative z-10 mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <div className="mb-6 flex items-center gap-3">
          <Sticker src={stamp} className="h-9 w-auto" />
          <span className="font-mono text-xs uppercase tracking-wide text-ink/50">
            {formatDateLong(post.publishedAt)}
          </span>
        </div>

        <h1 className="font-heading text-3xl leading-tight text-ink sm:text-5xl">
          {post.title}
        </h1>
        {post.subtitle && (
          <p className="mt-3 text-xl text-ink/70">{post.subtitle}</p>
        )}

        {post.featuredImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featuredImageUrl}
            alt=""
            className="yh-shadow-sm mt-8 w-full rounded-2xl border-2 border-ink object-cover"
          />
        )}

        <div className="yh-prose mt-8 text-lg leading-relaxed text-ink/90">
          {post.bodyHtml ? (
            <div
              dangerouslySetInnerHTML={{
                __html: decorateHr(cleanHtml(post.bodyHtml), post.slug),
              }}
            />
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {post.bodyMarkdown}
            </ReactMarkdown>
          )}
        </div>

        {post.hasAffiliateLinks && <AffiliateDisclosure />}

        <SubscribeCta />

        <div className="mt-12 border-t-2 border-ink/10 pt-6">
          <a
            href="/archive"
            className="font-mono text-sm uppercase tracking-wide text-purple hover:text-pink"
          >
            ← Back to the Tape Rack
          </a>
        </div>
        </article>
      </div>

      <SiteFooter />
    </div>
  );
}

// Pre-render published post pages where possible.
export async function generateStaticParams() {
  try {
    const posts = await getPublishedPosts();
    return posts.map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}
