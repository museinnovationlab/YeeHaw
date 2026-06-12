import type { CSSProperties } from "react";
import { stamps, objects } from "@/lib/brand";

// Decorative stickers scattered around the post. Auto-applied (no per-post
// config), deterministic per post (seeded by slug so it's stable across reloads
// but differs by post).
//
// Two treatments, same seed:
//  - Desktop (lg+): 5–6 stamps tucked into the side gutters, behind the text
//    column (z-0) — there's room out there, so they never touch the words.
//  - Mobile (<lg): there's no gutter, so a few small ones bleed off the screen
//    edges with just a corner peeking in over the margin, sitting on top of the
//    content like real stickers. pointer-events-none so they never block taps.

const POOL = [
  stamps.yeehaw,
  stamps.new,
  stamps.bonusTrack,
  stamps.goodStuff,
  stamps.powerUp,
  stamps.weirdFind,
  stamps.rewind,
  stamps.nowPlaying,
  stamps.fieldNote,
  objects.star,
  objects.lightning,
  objects.cassette,
  objects.gameboy,
  objects.blob,
];

function makeRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function PostStamps({ seed }: { seed: string }) {
  const r = makeRng(seed || "yeehaw");
  const pool = [...POOL].sort(() => r() - 0.5);

  // Desktop: 5–6 in the gutters. (On mobile, stamps hang off the section
  // breaks instead — see `.yh-prose hr` in globals.css — so there's no
  // mobile layer here.)
  const deskCount = 5 + Math.floor(r() * 2);
  const desk = pool.slice(0, deskCount);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 hidden select-none lg:block"
      aria-hidden="true"
    >
      {desk.map((src, i) => {
          const side = i % 2 === 0 ? "left" : "right";
          const top = 6 + ((i + 0.5) / deskCount) * 82 + (r() * 8 - 4); // ~6–88%
          const rot = Math.round(r() * 24 - 12);
          const w = 72 + Math.round(r() * 44); // 72–116px
          const bob = r() > 0.5;
          const style: CSSProperties = {
            top: `${top}%`,
            width: `${w}px`,
            transform: `rotate(${rot}deg)`,
            ["--yh-rot" as string]: `${rot}deg`,
          };
          if (side === "left") style.left = "0.5rem";
          else style.right = "0.5rem";
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`d${i}`}
              src={src}
              alt=""
              loading="lazy"
              draggable={false}
              className={`absolute ${bob ? "yh-bob-slow" : ""}`}
              style={style}
            />
          );
        })}
    </div>
  );
}
