# YeeHaw Code Review — 2026-06-10

> **STATUS (2026-06-10):** The high-value, low-risk batch is DONE and deployed —
> **1.1, 1.2, 1.3, 2.2, 2.3, 2.4, 2.6, 3.3**. Everything else is intentionally
> **deferred** (low urgency / higher regression risk): 1.5, 1.6, 2.1 (not an
> actual bug — server renders dates in UTC), 2.5, 2.7, 2.8, 2.9, and all of P3
> except 3.3. Rate limiting (1.4) was moved into the email work (it matters once
> welcome emails exist). Do NOT re-do the completed items.

Full-codebase review (security, correctness/performance, maintainability).
Each item has a concrete fix spec. Work top-to-bottom; run `npx tsc --noEmit`
after each section. Do NOT implement anything in the "REJECTED" section at the
bottom — those were considered and ruled out.

---

## P1 — Security hardening (do first)

### 1.1 Remove `?key=` query-param auth from the cron endpoint
**File:** `app/api/cron/publish/route.ts`
Secrets in query strings end up in access logs and proxies. The cron-job.org
job already authenticates via the `Authorization` header, so the query-param
path is unused.
- Delete the `keyParam` lookup and the `keyParam === secret` branch.
- Auth condition becomes: header only.

### 1.2 Timing-safe secret comparison in the cron endpoint
**File:** `app/api/cron/publish/route.ts`
Replace the `!==` comparison with `crypto.timingSafeEqual`:
```ts
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
// usage: if (!auth || !safeEqual(auth, `Bearer ${secret}`)) return 401
```

### 1.3 Stop leaking subscriber existence from /api/subscribe
**File:** `app/api/subscribe/route.ts`
The JSON response includes `status: "added" | "exists"`, which lets anyone
test whether an email is on the list. Return `{ ok: true }` for both cases
(keep the 400s for missing/invalid email). Check
`components/SubscribeForm.tsx` — it only checks `res.ok`, so no client change
needed.

### 1.4 Light rate limiting on /api/subscribe
**File:** `app/api/subscribe/route.ts`
No new dependencies — a simple in-module sliding window is fine at this scale
(fluid compute reuses instances; a cold start resetting the window is
acceptable):
```ts
const hits = new Map<string, number[]>(); // ip -> timestamps
function rateLimited(ip: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > limit;
}
// in POST: const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
// if (rateLimited(ip)) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
```

### 1.5 Validate URL scheme in the editor's "Image by URL" prompt
**File:** `components/admin/RichTextEditor.tsx` (`addImageByUrl`)
Defense-in-depth (the server sanitizer already strips non-http schemes on
render). Parse with `new URL(url)` in a try/catch; only accept `http:`/`https:`;
alert + return otherwise.

### 1.6 SSRF guard in unfurl + uploadFromUrl
**Files:** `lib/unfurl.ts`, `lib/cloudinary.ts`
Admin-only trigger, so low severity — but cheap to add. Create
`lib/url-guard.ts`:
```ts
export function isFetchableUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const h = u.hostname;
    if (
      h === "localhost" || h === "0.0.0.0" ||
      /^127\./.test(h) || /^10\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^192\.168\./.test(h) ||
      /^169\.254\./.test(h) || h === "[::1]" || /^\[fc/i.test(h) ||
      h.endsWith(".internal")
    ) return false;
    return true;
  } catch { return false; }
}
```
Call it at the top of `unfurl()` (return the existing graceful-fallback object
if false) and in `uploadFromUrl()` (throw).

---

## P2 — Correctness fixes

### 2.1 Back-date "Publish date" displays one day off
**File:** `components/admin/PostEditor.tsx` (in `save()`)
`new Date("2019-07-21")` parses as **UTC midnight**; rendered with
`toLocaleDateString` in US timezones it shows July 20. Parse at noon UTC so
the calendar date is stable in every timezone:
```ts
publishedAt: publishDate ? new Date(`${publishDate}T12:00:00Z`).toISOString() : undefined,
```
(Do NOT change the `scheduleAt` handling — `datetime-local` parsing in the
browser's local timezone is the intended behavior there.)

### 2.2 Timeout on the Anthropic API call
**File:** `lib/ai.ts` (the fetch to `api.anthropic.com/v1/messages`)
Add `signal: AbortSignal.timeout(120_000)` to the fetch options and wrap the
call so an `AbortError`/`TimeoutError` becomes a thrown
`new Error("AI request timed out")`. (Generations with link enrichment can
legitimately take a while — do not set this lower than ~120s.)

### 2.3 Timeout on Cloudinary uploads
**File:** `lib/cloudinary.ts`
Pass `timeout: 60000` in the `upload_stream` / upload options object
(Cloudinary SDK supports a `timeout` option), or wrap with `Promise.race`
against a 60s rejection. Apply to both `uploadImage` and `uploadFromUrl`.

### 2.4 Race-resistant addSubscriber via create()
**File:** `lib/repo/subscribers.ts`
The get-then-set has a small TOCTOU window (impact is only a wrong
"added"-vs-"exists" return — doc id = email so no duplicates are possible).
Cleanest fix — replace get/set with an atomic create:
```ts
try {
  await ref.create({ ...fields });
  return "added";
} catch (e) {
  if ((e as { code?: number }).code === 6 /* ALREADY_EXISTS */) return "exists";
  throw e;
}
```
(`ref.create()` is firebase-admin's atomic "fail if exists" write.)

### 2.5 Re-check status inside publishDueScheduledPosts loop
**File:** `lib/repo/posts.ts`
Cheap safety against a concurrent editor save: inside the loop, re-fetch
`doc.ref.get()` and skip unless the live doc still has
`status === "scheduled"` and a due `scheduledFor`. Volume is tiny; the extra
read per due post is fine.

### 2.6 RSS enclosure MIME type
**File:** `app/rss.xml/route.ts`
`type="image/jpeg"` is hardcoded. Derive from the URL extension
(png/webp/gif/avif/jpg→jpeg map, default `image/jpeg`), and truncate
`description` to 500 chars while you're in the file.

### 2.7 Don't silently swallow stash errors in the editor
**File:** `components/admin/PostEditor.tsx`
The stash load / mark-used calls have empty `.catch(() => ...)` handlers.
Add `console.error("stash:", e)` inside them (keep the UX non-blocking).

### 2.8 Subscribers page fetches the collection twice
**Files:** `app/admin/(dash)/subscribers/page.tsx`, `lib/repo/subscribers.ts`
`getSubscriberCounts()` internally calls `getAllSubscribers()`, and the page
calls both. Fix in the page only: call `getAllSubscribers()` once and compute
counts inline from the array; delete `getSubscriberCounts()` from the repo.

### 2.9 Basic length validation on post save
**File:** `lib/repo/posts.ts` (`savePost`) — throw if `title` > 300 chars or
`slug` > 120 chars. Keep it minimal; no new validation framework.

---

## P3 — Maintainability refactors

### 3.1 Shared `ensureAdminUser()` helper
**Files:** `lib/auth.ts` + `app/admin/(dash)/stash/actions.ts` +
`app/admin/(dash)/subscribers/actions.ts` + `app/admin/(dash)/posts/actions.ts`
Add to `lib/auth.ts`:
```ts
export async function ensureAdminUser() {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
```
Replace each file's local `requireAdmin()` / inline check with it.

### 3.2 Shared Firestore timestamp→ISO converter
**New file:** `lib/firebase/convert.ts` with `tsToIso(v: unknown): string | undefined`
(the toDate()/string logic copy-pasted in `lib/repo/posts.ts`,
`lib/repo/stash.ts`, `lib/repo/subscribers.ts`). Import it in all three repos
and delete the local copies.

### 3.3 Single source of truth for stamp keys + statuses in the editor
**File:** `components/admin/PostEditor.tsx`
- Replace the hardcoded `STAMPS` array with `Object.keys(stamps)` imported
  from `@/lib/brand` (this exact duplication already bit us once when removing
  the secret-area stamp).
- Add `export const POST_STATUSES = [...] as const;` to `lib/types.ts`, derive
  `PostStatus` from it (`typeof POST_STATUSES[number]`), and use it for the
  editor's status dropdown.

### 3.4 Explicit field mapping in toPost()
**File:** `lib/repo/posts.ts`
Replace `...(data as unknown as Post)` with explicit per-field mapping (like
`toSub` in the subscribers repo does). Tedious but removes the unsafe spread.

### 3.5 Extract PostEditor sub-components (~540 LOC → ~300)
**Files:** new `components/admin/AiDraftPanel.tsx`,
`components/admin/SchedulePanel.tsx`, `components/admin/FeaturedImagePicker.tsx`
Move the AI panel (notes box, stash picker, mode toggle, generate button),
the schedule popover, and the featured-image block into their own client
components with props for state/callbacks. Pure mechanical extraction — no
behavior changes. KEEP the rule that the rich-text editor is never wrapped in
a `<label>` (see the comment in the file).

### 3.6 Shared script init helper
**New file:** `scripts/lib/init.mjs` exporting an `initAdmin()` that does the
firebase-admin `initializeApp(cert(...))` + `getFirestore()` boilerplate
currently duplicated in all three `scripts/*.mjs`. Update the scripts to use it.

### 3.7 Unit tests for the pure helpers (first tests in the repo)
Add `vitest` as a devDependency, a minimal `vitest.config.ts`, and one test
file `lib/__tests__/pure.test.ts` covering:
- `slugify()` (lib/repo/posts.ts — export it if not already)
- `deAiify()` (lib/ai.ts)
- `vimeoEmbedSrc()` (components/admin/VimeoNode.ts)
- `normalizeSiteUrl()` (lib/site.ts — export the inner function)
- `parsePaste()` (move it from subscribers actions into `lib/parsers.ts` so it
  can be imported without the "use server" module)
~8–12 assertions total. Add `"test": "vitest run"` to package.json scripts.

---

## REJECTED — do NOT implement (considered and ruled out)

1. **"bodyMarkdown isn't saved"** — false; `savePost` already persists it.
2. **Make PostStamps a client component** — no. It's intentionally a server
   component; the seeded PRNG is deterministic per slug, so SSR output is
   stable. Adding "use client" would only add bundle weight.
3. **The suggested addSubscriber fix comparing `createdAt` to a
   serverTimestamp sentinel** — broken (the sentinel isn't a Date). Use the
   `ref.create()` approach in 2.4 instead.
4. **Change scheduled-time handling to UTC** — no. `datetime-local` parsed in
   the browser's local timezone is the intended single-author behavior.
5. **Remove `RecommendationItem` / `substackMarkdown` / `reviewedAt` types as
   dead code** — keep them. `substackMarkdown` feeds the planned
   "Copy for Substack" feature; `RecommendationItem` is the planned structured
   roundup entry; both are on the roadmap.
6. **Remove `samplePosts` fallback** — keep; it's the dev/no-Firestore
   fallback by design.
7. **`file-type` magic-byte validation on /api/upload** — skip; the endpoint
   is admin-only and Cloudinary re-processes images anyway.
8. **Upstash/Redis rate limiting** — overkill; use the in-memory limiter (1.4).
9. **Suppress error logging in API routes** — keep `console.error`; Vercel
   logs are private and the debuggability is worth it.
10. **AbortSignal on the unfurl fetch** — already present (12s timeout).

## Verification after all changes
1. `npx tsc --noEmit` — clean.
2. `npm run dev` + spot-check: homepage, a post page (stamps render), archive,
   /rss.xml, /sitemap.xml.
3. POST /api/subscribe with a new + repeat email → both return `{ ok: true }`,
   429 after >5/min from one IP.
4. /api/cron/publish: no header → 401; correct `Authorization: Bearer` → 200.
   **Update the cron-job.org job if it currently uses `?key=` (it uses the
   header, so it should be unaffected).**
5. In /admin: save draft, schedule a post, publish now, generate AI draft,
   upload an image, import a stash item.
6. `npm test` — new unit tests pass.
