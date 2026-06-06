import Sticker from "./Sticker";
import { stamps } from "@/lib/brand";

const LINKS: [string, string][] = [
  ["The Tape Rack", "/archive"],
  ["About", "/about"],
  ["The Club", "/#club"],
  ["RSS", "/rss.xml"],
];

export default function SiteFooter() {
  return (
    <footer className="bg-ink py-12 text-cream">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 text-center">
        <Sticker src={stamps.rewind} className="w-28" />
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {LINKS.map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="font-mono text-sm uppercase tracking-wide text-cream/70 transition-colors hover:text-yellow"
            >
              {label}
            </a>
          ))}
        </nav>
        <p className="font-mono text-xs text-cream/40">
          End Credits · © {new Date().getFullYear()} YeeHaw · Thanks for reading 🤠
        </p>
      </div>
    </footer>
  );
}
