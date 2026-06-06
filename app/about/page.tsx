import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Sticker from "@/components/Sticker";
import { objects } from "@/lib/brand";

export const metadata: Metadata = {
  title: "About · YeeHaw",
  description: "What YeeHaw is and why it exists.",
};

export default function AboutPage() {
  return (
    <div className="overflow-x-clip">
      <SiteHeader />

      <section className="relative mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <Sticker
          src={objects.boombox}
          className="absolute -right-2 top-6 hidden w-28 lg:block"
          rotate={6}
          bob="slow"
        />
        <h1 className="font-heading text-4xl text-ink sm:text-5xl">About YeeHaw</h1>
        <div className="yh-prose mt-8 text-lg leading-relaxed text-ink/90">
          <p>
            YeeHaw is a Saturday-morning mixtape for the internet: weird finds,
            useful ideas, and good little detours, rounded up and sent to your
            inbox. Think of it as a friend with great taste forwarding you the
            good stuff — minus the doomscrolling.
          </p>
          <p>
            Every issue is a small collection of things worth your time:
            products, movies, music, articles, and the occasional rabbit hole.
            No hot takes, no outrage — just genuinely good stuff.
          </p>
          <p>
            <a href="/#club">Join the Club</a> to get it in your inbox, or browse{" "}
            <a href="/archive">the Tape Rack</a> to see what you&apos;ve missed.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
