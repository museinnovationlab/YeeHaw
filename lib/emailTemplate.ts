import "server-only";
import type { Post } from "@/lib/types";
import { SITE_URL } from "@/lib/site";
import { decorBag } from "@/lib/decor";

// Brand palette (inlined — email clients don't load our CSS tokens).
const CREAM = "#FFF3D6";
const INK = "#17141F";
const PINK = "#FF4FA3";
const CYAN = "#20C7E8";
const YELLOW = "#FFD23F";
const PURPLE = "#7B4DFF";

// Brand fonts, matching the website (Bungee headings / Atkinson body / Space
// Mono accents). Email support is uneven and that's fine — this is progressive
// enhancement. Apple Mail & iOS Mail (~2/3 of opens) render the real fonts;
// Gmail ignores @font-face entirely and falls through to the SAME system stack
// the email used before, so nothing regresses for those readers.
//
// Two deliberate choices, both to dodge known client bugs:
//  1. @font-face with gstatic URLs, NOT <link>/@import — Outlook's Word engine
//     renders Times New Roman for those, ignoring the fallback stack entirely.
//  2. mso-font-alt pins Outlook to Arial as a second line of defense.
const FONT_FALLBACK = `-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const FONT_HEADING = `'Bungee', ${FONT_FALLBACK}`;
const FONT_BODY = `'Atkinson Hyperlegible', ${FONT_FALLBACK}`;
const FONT_MONO = `'Space Mono', ui-monospace, 'Courier New', monospace`;

const BUNGEE_SRC =
  "https://fonts.gstatic.com/s/bungee/v17/N0bU2SZBIuF2PU_0DXR1C9zfmQ.woff2";

// Bungee ships a single weight. Mapping that one file to 400/700/800 stops
// clients from synthesizing a fake bold, which turns an already-heavy display
// face into mush — while a Gmail fallback still gets its genuine bold Arial.
const FONT_FACES = `
${[400, 700, 800]
  .map(
    (w) => `@font-face{font-family:'Bungee';font-style:normal;font-weight:${w};mso-font-alt:'Arial';src:url(${BUNGEE_SRC}) format('woff2');}`
  )
  .join("\n")}
@font-face{font-family:'Atkinson Hyperlegible';font-style:normal;font-weight:400;mso-font-alt:'Arial';src:url(https://fonts.gstatic.com/s/atkinsonhyperlegible/v12/9Bt23C1KxNDXMspQ1lPyU89-1h6ONRlW45G04pIoWQeCbA.woff2) format('woff2');}
@font-face{font-family:'Atkinson Hyperlegible';font-style:normal;font-weight:700;mso-font-alt:'Arial';src:url(https://fonts.gstatic.com/s/atkinsonhyperlegible/v12/9Bt73C1KxNDXMspQ1lPyU89-1h6ONRlW45G8Wbc9dCWPRl-uFQ.woff2) format('woff2');}
@font-face{font-family:'Space Mono';font-style:normal;font-weight:400;mso-font-alt:'Courier New';src:url(https://fonts.gstatic.com/s/spacemono/v17/i7dPIFZifjKcF5UAWdDRYEF8RXi4EwQ.woff2) format('woff2');}
@font-face{font-family:'Space Mono';font-style:normal;font-weight:700;mso-font-alt:'Courier New';src:url(https://fonts.gstatic.com/s/spacemono/v17/i7dMIFZifjKcF5UAWdDRaPpZUFWaHi6WZ3Q.woff2) format('woff2');}`;

// Gmail can't load Bungee, so its headings fall back to a plain bold sans and
// lose the squared, signage-like quality that reads as YeeHaw. Uppercase gets
// that back, and it can be applied unconditionally: Bungee is a caps-only face
// whose lowercase codepoints map to the same capital glyphs, so this is a
// measured no-op wherever the real font loads ("pop stars" and "POP STARS"
// render at identical width and height). Clients with Bungee are untouched;
// clients without it get the caps.
const HEADING_CAPS = `  .yh-title,
  .yh-body h2,
  .yh-body h3 { text-transform: uppercase; }`;

// Brand art, served absolutely from the live site (email needs full URLs).
const LOGO = `${SITE_URL}/brand/parts/logos/logo-primary.png`;
const CASSETTE = `${SITE_URL}/brand/parts/cassette.png`;
const ARCADE = `${SITE_URL}/brand/parts/arcade.png`;

// Section-break line colors (the decoration art itself comes from lib/decor.ts,
// a seeded 60/40 mix of mini-objects vs stamps).
const HR_COLORS = [PINK, CYAN, YELLOW, PURPLE];

// CAN-SPAM requires a real US postal address on broadcast email.
const POSTAL_ADDRESS =
  process.env.EMAIL_POSTAL_ADDRESS || "YeeHaw · 522 W Riverside Ave, Spokane, WA 99210";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Make sanitized web HTML email-safe: video iframes -> "watch" links, and
// images get a max-width so they don't blow out the column.
function emailifyBody(html: string, seed: string): string {
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
  out = out.replace(/<img /gi, '<img style="max-width:100%;height:auto;border-radius:10px;border:2px solid #17141F;" ');

  // Section breaks: a decoration hangs on each <hr>, alternating side; art is
  // a seeded 60/40 mix of mini-objects vs stamps (shared with the web).
  const count = (out.match(/<hr\b[^>]*>/gi) || []).length;
  const bag = decorBag(seed, count);
  let i = 0;
  out = out.replace(/<hr\b[^>]*>/gi, () => {
    const d = bag[i];
    const w = d.isLogo ? 96 : 58;
    const color = HR_COLORS[i % HR_COLORS.length];
    const left = i % 2 === 0;
    i++;
    const url = `${SITE_URL}${d.path}`;
    const stampCell = `<td width="${w + 8}" valign="middle" align="${left ? "left" : "right"}" style="width:${w + 8}px;"><img src="${url}" alt="" width="${w}" style="display:block;width:${w}px;height:auto;border:none;border-radius:0;" /></td>`;
    const lineCell = `<td valign="middle"><div style="height:3px;line-height:3px;font-size:0;background:${color};">&nbsp;</div></td>`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>${left ? stampCell + lineCell : lineCell + stampCell}</tr></table>`;
  });

  return out;
}

export function renderPostEmail(
  post: Post,
  opts?: { unsubscribeUrl?: string }
): { subject: string; html: string } {
  const subject = post.emailSubject || post.title || "YeeHaw";
  const preheader = post.emailPreviewText || post.dek || "";
  const unsub = opts?.unsubscribeUrl || `${SITE_URL}/unsubscribe`;
  // A post's public page only exists once it's published, so an unpublished
  // post (i.e. a test send) would 404. Fall back to the archive, which always
  // lists the newest published issues.
  const isLive = post.status === "published" && Boolean(post.slug);
  const postUrl = isLive ? `${SITE_URL}/posts/${post.slug}` : `${SITE_URL}/archive`;
  const body = emailifyBody(post.bodyHtml || "", post.slug || post.title || "yeehaw");

  // funky striped divider that echoes the logo's layered shadow
  const stripe = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td height="8" style="height:8px;background:${PINK};font-size:0;line-height:0;">&nbsp;</td>
    <td height="8" style="height:8px;background:${YELLOW};font-size:0;line-height:0;">&nbsp;</td>
    <td height="8" style="height:8px;background:${CYAN};font-size:0;line-height:0;">&nbsp;</td>
    <td height="8" style="height:8px;background:${PURPLE};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
${FONT_FACES}
  .yh-body { font-family: ${FONT_BODY}; color: ${INK}; line-height: 1.6; font-size: 16px; }
  .yh-body a { color: ${PURPLE}; }
  .yh-body h2 { font-family: ${FONT_HEADING}; font-size: 21px; line-height: 1.2; margin: 1.4em 0 0.4em; color: ${INK}; }
  .yh-body h3 { font-family: ${FONT_HEADING}; font-size: 17px; line-height: 1.25; margin: 1.2em 0 0.3em; color: ${PURPLE}; }
  .yh-body img { max-width: 100%; height: auto; border-radius: 10px; border: 2px solid ${INK}; }
  .yh-body ul, .yh-body ol { padding-left: 1.2em; }
  .yh-body hr { border: none; border-top: 3px solid ${PINK}; margin: 1.8em 0; }
${HEADING_CAPS}
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CREAM};border:3px solid ${INK};border-radius:18px;overflow:hidden;">

        <!-- header: logo -->
        <tr><td align="center" style="padding:28px 28px 18px;background:${CREAM};">
          <img src="${LOGO}" alt="YeeHaw" width="280" style="display:block;width:280px;max-width:80%;height:auto;" />
        </td></tr>

        <!-- striped divider -->
        <tr><td>${stripe}</td></tr>

        ${
          post.featuredImageUrl
            ? `<tr><td style="padding:0;"><img src="${esc(post.featuredImageUrl)}" alt="" width="600" style="display:block;width:100%;height:auto;" /></td></tr>`
            : ""
        }

        <!-- content -->
        <tr><td style="padding:28px;background:${CREAM};">
          <img src="${ARCADE}" alt="" width="74" style="display:block;width:74px;height:auto;margin:0 0 12px;" />
          <h1 class="yh-title" style="font-family:${FONT_HEADING};font-size:28px;line-height:1.15;margin:0 0 8px;color:${INK};font-weight:800;">${esc(post.title || "")}</h1>
          ${post.dek ? `<p style="font-family:${FONT_BODY};font-size:17px;color:${INK};opacity:0.75;margin:0 0 10px;">${esc(post.dek)}</p>` : ""}
          <p style="font-family:${FONT_BODY};margin:0 0 22px;"><a href="${postUrl}" style="color:${PURPLE};font-weight:bold;text-decoration:none;">${isLive ? "Read this on yeehaw.io →" : "Read the latest on yeehaw.io →"}</a></p>
          <div class="yh-body">${body}</div>
        </td></tr>

        <!-- forward-to-subscribe CTA -->
        <tr><td style="padding:0 28px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E2F7FB;border:2px solid ${INK};border-radius:16px;">
            <tr><td align="center" style="padding:24px 20px;">
              <img src="${CASSETTE}" alt="" width="72" style="display:block;width:72px;height:auto;margin:0 auto 10px;" />
              <div style="font-family:${FONT_HEADING};font-weight:800;font-size:18px;color:${INK};margin-bottom:4px;">Was this forwarded to you?</div>
              <div style="font-family:${FONT_BODY};font-size:15px;color:${INK};opacity:0.8;margin-bottom:16px;">Get your own YeeHaw — a Saturday morning mixtape of the good stuff.</div>
              <a href="${SITE_URL}" style="display:inline-block;font-family:${FONT_HEADING};background:${PINK};color:${CREAM};font-weight:800;text-decoration:none;padding:12px 26px;border:2px solid ${INK};border-radius:999px;font-size:15px;">Join the Club ▶</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- footer -->
        <tr><td style="padding:22px 28px;background:${INK};color:${CREAM};font-family:${FONT_MONO};font-size:12px;line-height:1.6;">
          <p style="margin:0 0 6px;color:${CREAM};opacity:0.85;">You're getting this because you subscribed to YeeHaw at <a href="${SITE_URL}" style="color:${YELLOW};">yeehaw.io</a>.</p>
          <p style="margin:0 0 6px;"><a href="${esc(unsub)}" style="color:${YELLOW};">Unsubscribe</a></p>
          <p style="margin:0;color:${CREAM};opacity:0.6;">${esc(POSTAL_ADDRESS)}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// Reusable striped divider (matches renderPostEmail's).
function stripeRow(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td height="8" style="height:8px;background:${PINK};font-size:0;line-height:0;">&nbsp;</td>
    <td height="8" style="height:8px;background:${YELLOW};font-size:0;line-height:0;">&nbsp;</td>
    <td height="8" style="height:8px;background:${CYAN};font-size:0;line-height:0;">&nbsp;</td>
    <td height="8" style="height:8px;background:${PURPLE};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`;
}

/** Branded "you're in" email sent the moment someone signs up on the site. */
export function renderWelcomeEmail(
  opts?: { unsubscribeUrl?: string }
): { subject: string; html: string } {
  const subject = "You're in — welcome to YeeHaw 🎉";
  const preheader = "A Saturday morning mixtape of the good stuff is headed your way.";
  const unsub = opts?.unsubscribeUrl || `${SITE_URL}/unsubscribe`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${FONT_FACES}</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CREAM};border:3px solid ${INK};border-radius:18px;overflow:hidden;font-family:${FONT_BODY};color:${INK};">

        <!-- header: logo -->
        <tr><td align="center" style="padding:28px 28px 18px;background:${CREAM};">
          <img src="${LOGO}" alt="YeeHaw" width="280" style="display:block;width:280px;max-width:80%;height:auto;" />
        </td></tr>

        <!-- striped divider -->
        <tr><td>${stripeRow()}</td></tr>

        <!-- content -->
        <tr><td align="center" style="padding:32px 28px 8px;background:${CREAM};">
          <img src="${CASSETTE}" alt="" width="96" style="display:block;width:96px;height:auto;margin:0 auto 16px;" />
          <h1 style="font-family:${FONT_HEADING};font-size:30px;line-height:1.15;margin:0 0 10px;color:${INK};font-weight:800;">You're on the list!</h1>
          <p style="font-size:17px;line-height:1.6;color:${INK};opacity:0.8;margin:0 0 8px;">
            Welcome to <strong>YeeHaw</strong> — a hand-picked mixtape of movies, music, books, and weird little
            corners of the internet worth your time. No noise, no filler, just the good stuff.
          </p>
          <p style="font-size:17px;line-height:1.6;color:${INK};opacity:0.8;margin:0 0 24px;">
            Keep an eye on your inbox — the next issue lands soon.
          </p>
          <a href="${SITE_URL}" style="display:inline-block;font-family:${FONT_HEADING};background:${PINK};color:${CREAM};font-weight:800;text-decoration:none;padding:13px 30px;border:2px solid ${INK};border-radius:999px;font-size:16px;">Browse the archive ▶</a>
        </td></tr>

        <tr><td style="padding:24px 28px 4px;"></td></tr>

        <!-- footer -->
        <tr><td style="padding:22px 28px;background:${INK};color:${CREAM};font-family:${FONT_MONO};font-size:12px;line-height:1.6;">
          <p style="margin:0 0 6px;color:${CREAM};opacity:0.85;">You're getting this because you just subscribed to YeeHaw at <a href="${SITE_URL}" style="color:${YELLOW};">yeehaw.io</a>.</p>
          <p style="margin:0 0 6px;"><a href="${esc(unsub)}" style="color:${YELLOW};">Unsubscribe</a></p>
          <p style="margin:0;color:${CREAM};opacity:0.6;">${esc(POSTAL_ADDRESS)}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
