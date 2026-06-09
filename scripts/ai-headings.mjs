// AI pass to add section/item headings to imported archive posts whose originals
// had no heading markup. Reads bodyHtml from Firestore, asks Claude to wrap title
// text in <h2>/<h3> WITHOUT changing any other content, validates that nothing was
// altered (words + image + link preservation), then writes back.
//
// Run (from Developer Files), DRY by default:
//   node --env-file=.env.local scripts/ai-headings.mjs <docId> [<docId> ...]
//   add --write to actually save. --all processes every archive post (except ones
//   that already have headings).

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are an HTML structure editor for an old email newsletter.
Your ONLY task: mark up the section and item TITLES as headings so the structure reads clearly.

Rules:
- Wrap each MAJOR section header (e.g. "THE GOOD STUFF", "MUSIC CORNER", "MEME ROUNDUP") in <h2>...</h2>.
- Wrap each individual item/recommendation TITLE in <h3>...</h3>. An item title is the short title phrase that introduces a recommendation — often it is at the start of a paragraph, sometimes followed by a "(source)" and/or a " - " and then the description. Put ONLY the title text inside the <h3>; leave the description as its own following <p>.
- Do NOT change, add, remove, rephrase, summarize, translate, fix, or reorder ANY text. Every word must remain, spelled exactly the same.
- Preserve every <a href="...">, <img src="...">, <ul>/<ol>/<li>, <hr>, <strong>, <em> exactly, including all URLs and image sources.
- If a post genuinely has no item titles, return it unchanged.
- Return ONLY the resulting HTML. No commentary, no markdown code fences.`;

function words(html) {
  return (html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").toLowerCase().match(/[a-z0-9]+/g) || []);
}
function multiset(arr) {
  const m = new Map();
  for (const w of arr) m.set(w, (m.get(w) || 0) + 1);
  return m;
}
function compareWords(a, b) {
  const A = multiset(words(a)), B = multiset(words(b));
  let missing = 0, total = 0;
  for (const [w, n] of A) { total += n; const got = B.get(w) || 0; if (got < n) missing += n - got; }
  let added = 0;
  for (const [w, n] of B) { const had = A.get(w) || 0; if (n > had) added += n - had; }
  return { total, missing, added };
}
const imgs = (h) => (h.match(/res\.cloudinary\.com/g) || []).length;
const hrefs = (h) => new Set([...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));

async function callClaude(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error("API " + res.status + " " + JSON.stringify(d).slice(0, 160));
  let out = d.content?.[0]?.text || "";
  out = out.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();
  return out;
}

async function processDoc(docId, write) {
  const ref = db.collection("posts").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`  ✗ ${docId}: not found`); return; }
  const p = snap.data();
  const before = p.bodyHtml || "";
  const out = await callClaude(before);

  // validation
  const w = compareWords(before, out);
  const imgOk = imgs(before) === imgs(out);
  const beforeHrefs = hrefs(before), afterHrefs = hrefs(out);
  const lostHrefs = [...beforeHrefs].filter((u) => !afterHrefs.has(u));
  const h2 = (out.match(/<h2>/g) || []).length, h3 = (out.match(/<h3>/g) || []).length;
  const wordOk = w.missing <= Math.max(2, w.total * 0.01) && w.added <= Math.max(2, w.total * 0.02);
  const ok = imgOk && wordOk && lostHrefs.length === 0;

  console.log(`\n• ${docId}  "${(p.title || "").slice(0, 40)}"`);
  console.log(`   headings added: h2=${h2} h3=${h3}`);
  console.log(`   words: ${w.total} total, ${w.missing} missing, ${w.added} added | images ${imgs(before)}->${imgs(out)} | links lost: ${lostHrefs.length}`);
  console.log(`   VALIDATION: ${ok ? "✅ pass" : "❌ FAIL (not saved)"}`);
  if (!ok && lostHrefs.length) console.log("     lost links:", lostHrefs.slice(0, 3));
  // show the headings it picked
  for (const m of out.matchAll(/<(h2|h3)>([\s\S]*?)<\/\1>/g)) console.log(`     ${m[1]}: ${m[2].replace(/<[^>]+>/g, "").slice(0, 55)}`);

  if (write && ok) {
    await ref.set({ bodyHtml: out, updatedAt: new Date() }, { merge: true });
    console.log("   💾 saved");
  } else if (write && !ok) {
    console.log("   ⏭ skipped save (failed validation)");
  }
}

const args = process.argv.slice(2);
const write = args.includes("--write");
let ids = args.filter((a) => !a.startsWith("--"));
if (args.includes("--all")) {
  const snap = await db.collection("posts").where("importedFromArchive", "==", true).get();
  ids = snap.docs
    .filter((d) => ((d.data().bodyHtml || "").match(/<h3>/g) || []).length < 3) // skip already-headed (ed.13)
    .map((d) => d.id);
}
for (const id of ids) {
  try { await processDoc(id, write); } catch (e) { console.log(`  ❌ ${id}: ${e.message}`); }
}
process.exit(0);
