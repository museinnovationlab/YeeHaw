import "server-only";

// Section-break decorations, shared by the post page (web) and the email.
// "Mini logos" = the little retro objects (arcade, cassette, …) the user likes;
// stamps are the labeled badges. Mix is ~60% mini / 40% stamps, picked with a
// seeded PRNG so it looks random but is stable per post.

const PARTS = "/brand/parts";

const MINI = [
  "cassette", "vhs-tape", "crt-tv", "arcade", "boombox", "controller",
  "joystick", "gameboy", "lightning", "star", "floppy", "watch",
]
  .map((n) => `${PARTS}/${n}.png`)
  .concat([`${PARTS}/logos/logo-mixtape.png`]); // the mixtape wordmark, occasionally

const STAMPS = [
  "good-stuff", "weird-find", "now-playing", "bonus-track", "power-up",
  "rewind", "field-note", "new", "yeehaw",
].map((n) => `${PARTS}/stamps/stamp-${n}.png`);

const STAMP_SHARE = 0.4; // 40% stamps, 60% mini

export function makeRng(seed: string): () => number {
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

export interface Decor {
  /** relative path, e.g. /brand/parts/arcade.png */
  path: string;
  isLogo: boolean;
}

const toDecor = (path: string): Decor => ({ path, isLogo: path.includes("/logos/") });

/**
 * A well-distributed sequence of `count` decorations: ~40% stamps / 60% mini,
 * drawn from shuffled pools (so minimal repeats), shuffled order, and no two
 * identical back-to-back. Seeded → stable per post, but looks random.
 */
export function decorBag(seed: string, count: number): Decor[] {
  const r = makeRng(seed || "yeehaw");
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const nStamp = Math.round(count * STAMP_SHARE);
  const nMini = count - nStamp;
  const mini = shuffle(MINI);
  const stamps = shuffle(STAMPS);
  const bag: Decor[] = [];
  for (let i = 0; i < nMini; i++) bag.push(toDecor(mini[i % mini.length]));
  for (let i = 0; i < nStamp; i++) bag.push(toDecor(stamps[i % stamps.length]));

  const seq = shuffle(bag);
  // de-clump: nudge any back-to-back duplicate to swap with a later different one
  for (let i = 1; i < seq.length; i++) {
    if (seq[i].path === seq[i - 1].path) {
      for (let j = i + 1; j < seq.length; j++) {
        if (seq[j].path !== seq[i - 1].path) {
          [seq[i], seq[j]] = [seq[j], seq[i]];
          break;
        }
      }
    }
  }
  return seq;
}

/**
 * Web: replace each <hr> with one carrying inline CSS custom properties the
 * `.yh-prose hr` rule reads (image, side, size, rotation). Runs AFTER sanitize,
 * on trusted content. Alternates side for visual rhythm; art is the seeded bag.
 */
export function decorateHr(html: string, seed: string): string {
  const count = (html.match(/<hr\b[^>]*>/gi) || []).length;
  const bag = decorBag(seed, count);
  let i = 0;
  return html.replace(/<hr\b[^>]*>/gi, () => {
    const d = bag[i];
    const left = i % 2 === 0;
    i++;
    const w = d.isLogo ? 92 : 56;
    const rot = left ? -6 : 6;
    const side = left ? "--yh-left:-6px;--yh-right:auto;" : "--yh-left:auto;--yh-right:-6px;";
    return `<hr style="--yh-decor:url('${d.path}');${side}--yh-w:${w}px;--yh-rot:${rot}deg;" />`;
  });
}
