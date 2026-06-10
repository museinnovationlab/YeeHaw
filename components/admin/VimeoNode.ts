import { Node } from "@tiptap/core";

// Minimal Vimeo embed node — the official Tiptap video extension is YouTube-only,
// so this renders a player.vimeo.com iframe (which our sanitizer already allows).
export const Vimeo = Node.create({
  name: "vimeo",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { src: { default: null } };
  },

  parseHTML() {
    return [{ tag: "iframe[src*='player.vimeo.com']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "iframe",
      {
        ...HTMLAttributes,
        frameborder: "0",
        allow: "autoplay; fullscreen; picture-in-picture",
        allowfullscreen: "true",
      },
    ];
  },
});

/** Pull the numeric id out of a Vimeo URL (handles /video/ID and bare /ID). */
export function vimeoEmbedSrc(url: string): string | null {
  const id = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
  return id ? `https://player.vimeo.com/video/${id}` : null;
}
