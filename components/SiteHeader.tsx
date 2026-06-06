import Sticker from "./Sticker";
import { logos } from "@/lib/brand";

const NAV = [
  { label: "Now Playing", href: "/#now-playing" },
  { label: "The Tape Rack", href: "/archive" },
  { label: "About", href: "/about" },
  { label: "The Club", href: "/#club" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b-4 border-ink bg-ink">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <a href="/" className="flex items-center" aria-label="YeeHaw home">
          <Sticker src={logos.primary} alt="YeeHaw" className="h-9 w-auto sm:h-11" />
        </a>
        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <a
              key={n.label}
              href={n.href}
              className="font-mono text-sm uppercase tracking-wide text-cream/80 transition-colors hover:text-yellow"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <a
          href="/#club"
          className="font-heading yh-shadow-sm rounded-full border-2 border-cream bg-pink px-4 py-2 text-sm text-cream transition-transform hover:-translate-y-0.5"
        >
          Press Play ▶
        </a>
      </div>
    </header>
  );
}
