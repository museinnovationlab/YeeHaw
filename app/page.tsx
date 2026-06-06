import Sticker from "@/components/Sticker";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SubscribeForm from "@/components/SubscribeForm";
import { objects, logos, stamps, type StampKey } from "@/lib/brand";
import { getPublishedPosts } from "@/lib/repo/posts";
import { formatDateShort } from "@/lib/format";

export const revalidate = 120;

export default async function Home() {
  const posts = (await getPublishedPosts()).slice(0, 4);
  return (
    <div className="overflow-x-clip">
      {/* ---- Header --------------------------------------------------- */}
      <SiteHeader />

      {/* ---- Hero ----------------------------------------------------- */}
      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:pt-20">
        {/* decorative stickers around the content, not in it */}
        <Sticker
          src={objects.arcade}
          className="absolute right-2 top-2 hidden w-28 lg:block"
          bob="slow"
          rotate={6}
        />
        <Sticker
          src={objects.cassette}
          className="absolute -left-6 top-28 hidden w-32 lg:block"
          bob
          rotate={-8}
        />
        <Sticker
          src={stamps.new}
          className="absolute right-10 bottom-2 hidden w-24 md:block"
          rotate={10}
        />

        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 flex items-center justify-center gap-3">
            <Sticker src={stamps.goodStuff} className="w-20 yh-bob" />
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-purple">
              Est. in a rec room
            </span>
          </div>

          <h1 className="font-heading text-4xl leading-[1.05] text-ink sm:text-6xl">
            A Saturday Morning Mixtape of{" "}
            <span className="bg-pink px-2 text-cream">weird finds</span>,{" "}
            <span className="bg-cyan px-2 text-ink">useful ideas</span>, and{" "}
            <span className="bg-yellow px-2 text-ink">good little detours</span>.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-ink/80">
            YeeHaw is a curated newsletter of products, movies, music, articles,
            and internet oddities — the good stuff, rounded up and sent to your
            inbox. No doomscrolling required.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#club"
              className="font-heading yh-shadow rounded-full border-2 border-ink bg-purple px-7 py-3 text-cream transition-transform hover:-translate-y-1"
            >
              Press Play ▶
            </a>
            <a
              href="#now-playing"
              className="font-heading rounded-full border-2 border-ink bg-cream px-7 py-3 text-ink transition-transform hover:-translate-y-1"
            >
              Read Latest
            </a>
          </div>
        </div>
      </section>

      {/* ---- Now Playing --------------------------------------------- */}
      <section
        id="now-playing"
        className="border-y-4 border-ink bg-purple/10 py-14"
      >
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 flex items-center gap-3">
            <Sticker src={stamps.nowPlaying} className="w-36" />
            <span className="font-mono text-sm uppercase tracking-wide text-ink/60">
              latest issues
            </span>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {posts.map((post) => (
              <a
                key={post.slug}
                href={`/posts/${post.slug}`}
                className="yh-shadow-sm group flex flex-col rounded-2xl border-2 border-ink bg-cream p-5 transition-transform hover:-translate-y-1"
              >
                <Sticker
                  src={stamps[(post.stamp as StampKey) ?? "nowPlaying"] ?? stamps.nowPlaying}
                  className="mb-4 h-10 w-auto self-start"
                />
                <h3 className="font-heading text-lg leading-tight text-ink group-hover:text-purple">
                  {post.title}
                </h3>
                <p className="mt-2 flex-1 text-sm text-ink/75">{post.dek}</p>
                <span className="font-mono mt-4 text-xs uppercase tracking-wide text-ink/50">
                  {formatDateShort(post.publishedAt)}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ---- The Club (subscribe) ------------------------------------ */}
      <section id="club" className="relative overflow-hidden bg-mint py-16">
        <Sticker
          src={objects.boombox}
          className="absolute -right-4 bottom-2 hidden w-44 sm:block"
          rotate={-6}
        />
        <Sticker
          src={objects.lightning}
          className="absolute left-6 top-8 hidden w-16 md:block yh-bob"
          rotate={-12}
        />
        <div className="mx-auto max-w-2xl px-4 text-center">
          <Sticker src={logos.club} className="mx-auto mb-6 w-28 yh-bob-slow" />
          <h2 className="font-heading text-3xl text-ink sm:text-4xl">
            Join the YeeHaw Club
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-ink/80">
            Get the weekly mixtape: weird finds, useful ideas, nostalgic detours,
            and things worth sharing. Free, and easy to leave anytime.
          </p>
          <div className="mt-8 flex justify-center">
            <SubscribeForm />
          </div>
        </div>
      </section>

      {/* ---- End Credits (footer) ------------------------------------ */}
      <SiteFooter />
    </div>
  );
}
