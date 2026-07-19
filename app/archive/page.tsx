import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SubscribeCta from "@/components/SubscribeCta";
import Sticker from "@/components/Sticker";
import { stamps, type StampKey } from "@/lib/brand";
import { formatDateLong } from "@/lib/format";
import { getPublishedPosts } from "@/lib/repo/posts";

export const metadata: Metadata = {
  title: "The Tape Rack · YeeHaw",
  description: "The full archive of YeeHaw issues — every mixtape, all in one place.",
};

export const revalidate = 120;

export default async function ArchivePage() {
  const posts = await getPublishedPosts();

  return (
    <div className="overflow-x-clip">
      <SiteHeader />

      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="mb-10 text-center">
          <h1 className="font-heading text-4xl text-ink sm:text-5xl">The Tape Rack</h1>
          <p className="mt-3 text-ink/70">
            Every issue, rewound and ready. {posts.length} and counting.
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <a
                href={`/posts/${post.slug}`}
                className="yh-shadow-sm group flex items-start gap-4 rounded-2xl border-2 border-ink bg-cream p-5 transition-transform hover:-translate-y-1"
              >
                <Sticker
                  src={stamps[(post.stamp as StampKey) ?? "nowPlaying"] ?? stamps.nowPlaying}
                  className="hidden h-10 w-auto shrink-0 sm:block"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading text-lg leading-tight text-ink group-hover:text-purple">
                    {post.title}
                  </h2>
                  {post.dek && (
                    <p className="mt-1 text-sm text-ink/75">{post.dek}</p>
                  )}
                </div>
                <span className="font-mono shrink-0 whitespace-nowrap text-xs uppercase tracking-wide text-ink/50">
                  {formatDateLong(post.publishedAt)}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <SubscribeCta
          heading="Never miss one"
          blurb="A new mixtape lands in your inbox — weird finds, useful ideas, and good little detours. Free, and easy to leave anytime."
        />
      </section>

      <SiteFooter />
    </div>
  );
}
