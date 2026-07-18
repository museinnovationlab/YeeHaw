import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Sticker from "@/components/Sticker";
import { objects } from "@/lib/brand";

/**
 * Shared branded dead-end screen. Old email links are permanent — once an
 * issue goes out, its link lives in inboxes forever — so an unpublished or
 * deleted post has to land somewhere friendly with a route back to the rack,
 * not on a bare browser 404.
 */
export default function NotFoundScreen({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="overflow-x-clip">
      <SiteHeader />

      <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center sm:py-24">
        <Sticker src={objects.vhsTape} className="h-28 w-auto" rotate={-8} bob="slow" />

        <h1 className="font-heading mt-8 text-4xl text-ink sm:text-5xl">{title}</h1>
        <p className="mt-4 text-lg text-ink/70">{message}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="/archive"
            className="font-heading yh-shadow-sm rounded-full border-2 border-ink bg-pink px-6 py-3 text-cream transition-transform hover:-translate-y-0.5"
          >
            Browse the Tape Rack ▶
          </a>
          <a
            href="/"
            className="font-heading rounded-full border-2 border-ink bg-cream px-6 py-3 text-ink transition-transform hover:-translate-y-0.5 hover:bg-yellow"
          >
            Back to the front page
          </a>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
