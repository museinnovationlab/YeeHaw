// One-off importer: load an aggregated subscriber CSV into Firestore.
// Doc id = lowercased email, so re-running is idempotent (existing rows skipped).
//
// Run (from Developer Files), sandbox disabled (needs network):
//   node --env-file=.env.local scripts/import-subscribers.mjs <path-to-csv>
//
// CSV is expected to have a header with at least an "email" column; "name" and
// "source" columns are used when present.

import fs from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const path = process.argv[2];
if (!path) {
  console.error("usage: node --env-file=.env.local scripts/import-subscribers.mjs <csv>");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

// minimal CSV parse (handles quoted cells)
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c === "\r") { /* skip */ }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const rows = parseCsv(fs.readFileSync(path, "utf8")).filter((r) => r.some((c) => c.trim()));
const hdr = rows[0].map((h) => h.trim().toLowerCase());
const iEmail = hdr.findIndex((h) => h.includes("email"));
const iName = hdr.findIndex((h) => h === "name");
const iSource = hdr.findIndex((h) => h === "source");

let added = 0, skipped = 0, invalid = 0;
const existing = new Set((await db.collection("subscribers").get()).docs.map((d) => d.id));
let batch = db.batch(), n = 0;

for (const r of rows.slice(1)) {
  const email = (r[iEmail] || "").trim().toLowerCase();
  if (!EMAIL.test(email)) { invalid++; continue; }
  if (existing.has(email)) { skipped++; continue; }
  existing.add(email);
  const name = iName >= 0 ? (r[iName] || "").trim() : "";
  const source = iSource >= 0 ? (r[iSource] || "").trim() || "import" : "import";
  batch.set(db.collection("subscribers").doc(email), {
    email,
    status: "subscribed",
    source,
    ...(name ? { name } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  added++; n++;
  if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
}
if (n) await batch.commit();

console.log(`done: ${added} added, ${skipped} already present, ${invalid} invalid`);
process.exit(0);
