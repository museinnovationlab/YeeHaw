import "server-only";
import sanitizeHtml from "sanitize-html";

// Sanitize editor-authored HTML before rendering on public pages. The author is
// the trusted admin, but we clean anyway as defense-in-depth.
export function cleanHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h2",
      "h3",
      "u",
      "s",
      "iframe",
      "div",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title"],
      // Video embeds (Tiptap YouTube node renders div[data-youtube-video] > iframe)
      div: ["data-youtube-video"],
      iframe: [
        "src",
        "width",
        "height",
        "frameborder",
        "allow",
        "allowfullscreen",
        "referrerpolicy",
        "title",
        "loading",
        // Spotify player height (352 track-list / 152 compact) — lets the site
        // CSS opt these out of the 16:9 rule that video iframes get.
        "data-spotify",
      ],
    },
    // Only allow iframes pointing at known embed hosts.
    allowedIframeHostnames: [
      "www.youtube.com",
      "youtube.com",
      "www.youtube-nocookie.com",
      "player.vimeo.com",
      "open.spotify.com",
    ],
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
      }),
    },
  });
}
