import SubscribeForm from "@/components/SubscribeForm";
import Sticker from "@/components/Sticker";
import { objects } from "@/lib/brand";

/**
 * End-of-post signup prompt.
 *
 * The form used to live only on the homepage, but post pages are where
 * traffic actually lands — social links, search results, and forwarded
 * links all point at a post, not the front page. Without this, a reader who
 * enjoyed an issue had no way to subscribe without navigating away.
 */
export default function SubscribeCta({
  heading = "Liked this one?",
  blurb = "Get the next mixtape in your inbox. Weird finds, useful ideas, and good little detours — free, and easy to leave anytime.",
}: {
  heading?: string;
  blurb?: string;
}) {
  return (
    <section className="yh-shadow-sm mt-14 rounded-2xl border-2 border-ink bg-cream p-6 sm:p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Sticker src={objects.cassette} className="h-14 w-auto" rotate={-6} bob="slow" />
        <h2 className="font-heading text-2xl text-ink sm:text-3xl">{heading}</h2>
        <p className="max-w-md text-ink/70">{blurb}</p>
        <div className="mt-2 flex w-full justify-center">
          <SubscribeForm />
        </div>
      </div>
    </section>
  );
}
