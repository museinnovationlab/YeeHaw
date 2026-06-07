// Imports old YeeHaw newsletter posts from the live Squarespace site into
// Firestore, preserving original dates and re-hosting images on Cloudinary.
//
// Run (from Developer Files):
//   node --env-file=.env.local scripts/import-archive.mjs <postUrl> [<postUrl> ...]
// Needs network (run with sandbox disabled). Idempotent: re-running a URL
// updates the same doc (id = archive-<url-slug>).

import sanitizeHtml from "sanitize-html";
import { v2 as cloudinary } from "cloudinary";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

const UA = "Mozilla/5.0 (YeeHaw archive importer)";

function slugify(s) {
  return (
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post"
  );
}

// Promote Squarespace "title" styling into real headings before sanitizing
// (sanitize strips the classes that carried the styling).
function promoteHeadings(html) {
  // image-block titles ("image-title") -> H3 (per-item recommendation titles)
  html = html.replace(
    /<div[^>]*class="image-title[^"]*"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/div>/g,
    (_m, inner) => `<h3>${inner.trim()}</h3>`
  );
  // standalone [BRACKETED] section markers -> H2 (strip the brackets)
  html = html.replace(
    /<p[^>]*>\s*\[\s*([^\]<]+?)\s*\]\s*<\/p>/g,
    (_m, inner) => `<h2>${inner.trim()}</h2>`
  );
  return html;
}

// Clean Squarespace body HTML down to semantic tags.
function cleanBody(html) {
  html = promoteHeadings(html);
  const clean = sanitizeHtml(html, {
    allowedTags: ["p", "h2", "h3", "ul", "ol", "li", "a", "img", "strong", "em", "b", "i", "blockquote", "hr", "br", "figure", "figcaption"],
    allowedAttributes: { a: ["href"], img: ["src", "alt"] },
    transformTags: {
      // Squarespace lazy-loads: the real URL is in data-src.
      img: (tag, attribs) => ({
        tagName: "img",
        attribs: { src: attribs["data-src"] || attribs.src || "", alt: attribs.alt || "" },
      }),
      h1: () => ({ tagName: "h2", attribs: {} }),
    },
  });
  // strip truly-empty paragraphs (Squarespace spacing cruft) — safe, never touches media
  return clean.replace(/<p>(?:\s|&nbsp;)*<\/p>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`fetch ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function uploadBuffer(buf) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: "yeehaw/archive" }, (e, r) => (e ? reject(e) : resolve(r.secure_url)))
      .end(buf);
  });
}

// Find image srcs, re-host each on Cloudinary, return body with rewritten srcs.
async function rehostImages(body) {
  const urls = [...new Set([...body.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]))].filter(
    (u) => u.startsWith("http")
  );
  let out = body;
  for (const u of urls) {
    try {
      // request a reasonable full-size from the Squarespace CDN
      const fetchUrl = u.includes("format=") ? u : u + (u.includes("?") ? "&" : "?") + "format=1500w";
      const buf = await fetchBuffer(fetchUrl);
      const newUrl = await uploadBuffer(buf);
      out = out.split(u).join(newUrl);
      console.log(`   image rehosted: ${u.slice(0, 60)}… -> ${newUrl.split("/").pop()}`);
    } catch (e) {
      console.log(`   ⚠ image failed (${u.slice(0, 60)}…): ${e.message} — keeping original`);
    }
  }
  return out;
}

async function importPost(postUrl) {
  const u = new URL(postUrl.startsWith("http") ? postUrl : `https://www.yeehaw.io${postUrl}`);
  u.hostname = "www.yeehaw.io";
  const jsonUrl = `${u.origin}${u.pathname}?format=json`;
  console.log(`\n• ${u.pathname}`);
  const res = await fetch(jsonUrl, { headers: { "User-Agent": UA } });
  const data = await res.json();
  const item = data.item || (data.items || [])[0];
  if (!item) throw new Error("no item in JSON");

  const title = item.title || "Untitled";
  const urlSlug = u.pathname.split("/").filter(Boolean).pop();
  const docId = `archive-${urlSlug}`;
  const publishedAt = item.publishOn ? Timestamp.fromMillis(item.publishOn) : Timestamp.now();

  console.log(`   title: ${title}`);
  console.log(`   date : ${new Date(item.publishOn).toISOString().slice(0, 10)}`);

  let body = cleanBody(item.body || "");
  body = await rehostImages(body);

  const doc = {
    title,
    slug: slugify(title),
    postType: "essay",
    status: "published",
    importedFromArchive: true,
    hasAffiliateLinks: false,
    bodyHtml: body,
    bodyMarkdown: "",
    dek: item.excerpt ? sanitizeHtml(item.excerpt, { allowedTags: [] }).slice(0, 200) : "",
    stamp: "rewind",
    tags: [],
    categories: [],
    sourceUrl: postUrl,
    createdAt: publishedAt,
    updatedAt: Timestamp.now(),
    publishedAt,
  };
  await db.collection("posts").doc(docId).set(doc, { merge: true });
  console.log(`   ✅ saved as posts/${docId} (status: published, slug: ${doc.slug})`);
}

const urls = process.argv.slice(2);
if (!urls.length) {
  console.log("usage: node --env-file=.env.local scripts/import-archive.mjs <postUrl> ...");
  process.exit(1);
}
for (const url of urls) {
  try {
    await importPost(url);
  } catch (e) {
    console.log(`   ❌ failed: ${e.message}`);
  }
}
process.exit(0);
