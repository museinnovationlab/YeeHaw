import "server-only";
import type { Post } from "@/lib/types";
import { SITE_URL } from "@/lib/site";

// Brand colors (inlined — email clients don't load external CSS / our tokens).
const CREAM = "#FFF3D6";
const INK = "#17141F";
const PINK = "#FF4FA3";
const PURPLE = "#7B4DFF";

// A real US postal address is required by CAN-SPAM on broadcast email. Override
// via EMAIL_POSTAL_ADDRESS once you have one you're comfortable publishing.
const POSTAL_ADDRESS = process.env.EMAIL_POSTAL_ADDRESS || "YeeHaw · (mailing address TBD)";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Make sanitized web HTML email-safe: video iframes become "watch" links (no
// client renders iframes), and images get a max-width so they don't blow out.
function emailifyBody(html: string): string {
  let out = html.replace(
    /<div[^>]*data-youtube-video[^>]*>\s*<iframe[^>]*\ssrc="([^"]+)"[^>]*>\s*<\/iframe>\s*<\/div>/gi,
    (_m, src: string) => {
      const watch = src
        .replace("www.youtube-nocookie.com", "www.youtube.com")
        .replace("/embed/", "/watch?v=");
      return `<p><a href="${esc(watch)}" style="color:${PURPLE};font-weight:bold;">▶ Watch the video</a></p>`;
    }
  );
  out = out.replace(
    /<iframe[^>]*\ssrc="([^"]+)"[^>]*>\s*<\/iframe>/gi,
    (_m, src: string) => `<p><a href="${esc(src)}" style="color:${PURPLE};font-weight:bold;">▶ Watch the video</a></p>`
  );
  out = out.replace(/<img /gi, '<img style="max-width:100%;height:auto;border-radius:8px;" ');
  return out;
}

export function renderPostEmail(
  post: Post,
  opts?: { unsubscribeUrl?: string }
): { subject: string; html: string } {
  const subject = post.emailSubject || post.title || "YeeHaw";
  const preheader = post.emailPreviewText || post.dek || "";
  const unsub = opts?.unsubscribeUrl || `${SITE_URL}/unsubscribe`;
  const body = emailifyBody(post.bodyHtml || "");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  .yh-body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: ${INK}; line-height: 1.6; font-size: 16px; }
  .yh-body a { color: ${PURPLE}; }
  .yh-body h2 { font-size: 20px; margin: 1.4em 0 0.4em; }
  .yh-body h3 { font-size: 17px; margin: 1.2em 0 0.3em; }
  .yh-body img { max-width: 100%; height: auto; border-radius: 8px; }
  .yh-body ul, .yh-body ol { padding-left: 1.2em; }
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CREAM};border:2px solid ${INK};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:20px 28px;border-bottom:2px solid ${INK};">
          <div style="font-weight:800;font-size:26px;letter-spacing:1px;color:${PINK};">YEEHAW</div>
          <div style="font-family:monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${INK};opacity:0.6;">A Saturday Morning Mixtape</div>
        </td></tr>
        ${
          post.featuredImageUrl
            ? `<tr><td style="padding:0;"><img src="${esc(post.featuredImageUrl)}" alt="" width="600" style="display:block;width:100%;height:auto;" /></td></tr>`
            : ""
        }
        <tr><td style="padding:28px;">
          <h1 style="font-size:26px;line-height:1.2;margin:0 0 8px;color:${INK};">${esc(post.title || "")}</h1>
          ${post.dek ? `<p style="font-size:17px;color:${INK};opacity:0.75;margin:0 0 20px;">${esc(post.dek)}</p>` : ""}
          <div class="yh-body">${body}</div>
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:2px solid ${INK};font-family:monospace;font-size:12px;color:${INK};opacity:0.7;">
          <p style="margin:0 0 6px;">You're getting this because you subscribed to YeeHaw at <a href="${SITE_URL}" style="color:${PURPLE};">yeehaw.io</a>.</p>
          <p style="margin:0 0 6px;"><a href="${esc(unsub)}" style="color:${PURPLE};">Unsubscribe</a></p>
          <p style="margin:0;opacity:0.7;">${esc(POSTAL_ADDRESS)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
