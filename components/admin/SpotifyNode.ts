import { Node } from "@tiptap/core";

// Spotify embed node — renders the official open.spotify.com/embed player (the
// familiar widget: cover art, track list, play buttons). Hand-rolled like the
// Vimeo node because Tiptap's video extension is YouTube-only.
//
// Unlike video, the Spotify player is a FIXED height, not 16:9 — 352px shows
// the track list (playlists/albums), 152px is the compact single-row player
// (tracks/episodes). The height rides along as data-spotify so the site CSS
// can opt it out of the 16:9 rule that every other iframe gets.
export const Spotify = Node.create({
  name: "spotify",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      height: {
        default: 352,
        parseHTML: (el) =>
          Number(el.getAttribute("data-spotify") || el.getAttribute("height")) || 352,
      },
    };
  },

  parseHTML() {
    return [{ tag: "iframe[src*='open.spotify.com/embed']" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { height, ...rest } = HTMLAttributes;
    return [
      "iframe",
      {
        ...rest,
        "data-spotify": String(height),
        width: "100%",
        height: String(height),
        frameborder: "0",
        allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
        loading: "lazy",
        title: "Spotify player",
      },
    ];
  },
});

const TYPES = new Set(["playlist", "album", "track", "artist", "show", "episode"]);

/**
 * Turn any Spotify link into an embed src + the right player height.
 * Accepts share links (with ?si= junk), intl-xx paths, already-embed URLs,
 * and spotify:type:id URIs. Spotify ids are always 22 base62 chars, which
 * doubles as validation. Returns null for anything that isn't a Spotify link.
 */
export function spotifyEmbed(url: string): { src: string; height: number } | null {
  const m = url
    .trim()
    .match(
      /(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?(?:embed\/)?|spotify:)(playlist|album|track|artist|show|episode)[/:]([A-Za-z0-9]{22})/i
    );
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (!TYPES.has(type)) return null;
  const compact = type === "track" || type === "episode";
  return {
    src: `https://open.spotify.com/embed/${type}/${m[2]}`,
    height: compact ? 152 : 352,
  };
}
