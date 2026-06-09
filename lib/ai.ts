import "server-only";
import { unfurl, extractUrls, type LinkMeta } from "./unfurl";
import { uploadFromUrl } from "./cloudinary";
import { getPublishedPosts } from "./repo/posts";

/** Pull a couple of real paragraphs from the user's own archived posts so the AI
 *  matches their actual voice (the strongest anti-"AI tell" signal). */
async function voiceSamples(): Promise<string> {
  try {
    const posts = (await getPublishedPosts()).filter((p) => p.importedFromArchive && p.bodyHtml);
    if (!posts.length) return "";
    const pick = posts.sort(() => Math.random() - 0.5).slice(0, 2);
    const paras: string[] = [];
    for (const p of pick) {
      for (const m of (p.bodyHtml || "").matchAll(/<p>([\s\S]*?)<\/p>/g)) {
        const t = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (t.length > 70 && t.length < 500) paras.push(t);
      }
    }
    return paras.slice(0, 3).join("\n\n").slice(0, 1600);
  } catch {
    return "";
  }
}

/** Deterministic safety net: strip the punctuation/filler tells the model leaks
 *  through despite the prompt. Only runs on AI-generated drafts. */
export function deAiify(s: string): string {
  if (!s) return s;
  let out = s
    .replace(/\s*[—–]\s*/g, ", ") // em/en dash -> comma
    .replace(/\bit'?s worth noting that\b/gi, "")
    .replace(/\bneedless to say,?\s*/gi, "")
    .replace(/\bwithout further ado,?\s*/gi, "");
  // tidy artifacts from the replacements
  out = out
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/\(\s*,\s*/g, "(")
    .replace(/  +/g, " ");
  return out;
}

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

export const isAiConfigured = Boolean(KEY);

const HOUSE_STYLE = `You are the writer for YeeHaw, a nostalgic internet recommendations newsletter ("a Saturday morning mixtape of weird finds, useful ideas, and good little detours").

Voice: warm, funny, personal, curious, a little goofy, like a smart friend sending you cool stuff. Recommendation-first. Not overly polished, not SEO spam, no corporate tone.

Humor: you like puns, quick jokes, and light self-deprecating asides — the kind of thing a funny friend tosses off mid-recommendation. Drop them in where they actually land, not in every item, and invent them fresh each time (never reuse a stock joke or catchphrase). Never force a joke where it doesn't fit. When something genuinely deserves a straight, earnest take, give it one.

Hard rules:
- Use ONLY the user's notes and the provided LINK DATA as the source of truth. Do NOT invent facts about products, movies, music, articles, or people. If a detail isn't given, stay general.
- Do NOT fabricate personal anecdotes; only use ones the user supplied.
- Turn the items into a skimmable post: a short warm intro paragraph, then each recommendation as its own block: an <h3> title (hyperlink the title to the item's URL with <a href="URL">) followed by a short paragraph (1-3 sentences). Group related items under an <h2> section header when it helps.
- IMAGES: For each item that has an image placeholder token in the LINK DATA (e.g. {{IMAGE_1}}), place that exact token on its own line right after that item's title/paragraph where the image should appear. Do NOT write <img> tags yourself and do NOT alter the token — just drop the token in. Only use a token if the item actually has one.
- Keep it tight and fun.

Avoid the obvious AI-writing tells:
- NEVER use em-dashes (—) or en-dashes (–). Use commas, periods, or parentheses instead.
- Do not use these words/phrases: delve, tapestry, boasts, leverage, robust, realm, testament, pivotal, vibrant, seamless, treasure trove, game-changer, elevate, foster, "it's worth noting", "in today's fast-paced world", "when it comes to", "look no further", "needless to say", "dive in", "buckle up", "let's get into it", "that's a wrap", "without further ado".
- Avoid the "not just X, but Y" construction and avoid neat rule-of-three lists.
- Vary your sentence length. Don't end with a tidy summarizing conclusion. A little uneven and human is good.
- Go easy on emoji.

Output format: return ONLY valid JSON (no markdown fences, no commentary) shaped exactly like:
{"title": "a short catchy post title", "dek": "a one-sentence summary for the card", "seoTitle": "an SEO title ~55 chars", "seoDescription": "a meta description ~150 chars", "emailSubject": "a catchy email subject line, <60 chars", "emailPreviewText": "a one-line inbox preview teaser", "bodyHtml": "the post body as clean semantic HTML possibly containing {{IMAGE_n}} tokens"}

In bodyHtml use ONLY these tags: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <a href>, <strong>, <em>. No <div>, no inline styles, no <img> (use the tokens instead), no <html>/<body> wrappers.

APPEND MODE: if the user says this is append mode, generate ONLY the new recommendation block(s) to add to an existing post — no intro, greeting, or sign-off, and no section header unless the new items clearly start a new section. Put just the item HTML (h3 + paragraph + image token) in bodyHtml, and return empty strings for title, dek, seoTitle, seoDescription, emailSubject, and emailPreviewText.`;

export interface DraftResult {
  title: string;
  dek: string;
  seoTitle: string;
  seoDescription: string;
  emailSubject: string;
  emailPreviewText: string;
  bodyHtml: string;
}

interface Enriched extends LinkMeta {
  index: number;
  hostedImage: string | null;
}

/** Fetch metadata + re-host images for all URLs found in the notes. */
async function enrichLinks(notes: string): Promise<Enriched[]> {
  const urls = extractUrls(notes);
  const metas = await Promise.all(urls.map((u) => unfurl(u)));
  const enriched: Enriched[] = [];
  let i = 0;
  for (const m of metas) {
    i += 1;
    const hostedImage = m.image ? await uploadFromUrl(m.image) : null;
    enriched.push({ ...m, index: i, hostedImage: hostedImage ?? null });
  }
  return enriched;
}

function buildLinkData(links: Enriched[]): string {
  if (!links.length) return "(no links found in the notes)";
  return links
    .map((l) => {
      const lines = [
        `[${l.index}] URL: ${l.url}`,
        l.title ? `    Title: ${l.title}` : "",
        l.description ? `    Description: ${l.description}` : "",
        `    Source (for credit): ${l.source}`,
        l.hostedImage ? `    Image token: {{IMAGE_${l.index}}}` : `    Image: none`,
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n");
}

/** Replace {{IMAGE_n}} tokens with the hosted image + a source-credit caption. */
function substituteImages(html: string, links: Enriched[]): string {
  let out = html;
  for (const l of links) {
    const token = `{{IMAGE_${l.index}}}`;
    if (!out.includes(token)) continue;
    if (l.hostedImage) {
      const alt = (l.title || l.source).replace(/"/g, "&quot;");
      const block =
        `<img src="${l.hostedImage}" alt="${alt}" />` +
        `<p><em>via <a href="${l.url}">${l.source}</a></em></p>`;
      out = out.split(token).join(block);
    } else {
      out = out.split(token).join("");
    }
  }
  // strip any stray/unknown tokens
  out = out.replace(/\{\{IMAGE_\d+\}\}/g, "");
  return out;
}

export async function generateDraft(input: {
  notes: string;
  theme?: string;
  postType?: string;
  mode?: "replace" | "append";
}): Promise<DraftResult> {
  if (!isAiConfigured) throw new Error("AI is not configured (ANTHROPIC_API_KEY missing).");

  const [links, samples] = await Promise.all([enrichLinks(input.notes), voiceSamples()]);
  const append = input.mode === "append";

  const userMsg = [
    samples
      ? `VOICE SAMPLES — this is how I actually write. Match this tone, rhythm, and word choice (do NOT reuse the content, just the voice):\n${samples}\n`
      : "",
    append
      ? "APPEND MODE: generate ONLY the new item block(s) below to append to my existing post (no intro/sign-off). Return empty strings for title/dek/seo/email."
      : input.theme
        ? `Theme / title idea: ${input.theme}`
        : "",
    input.postType === "essay"
      ? "This is an essay-style post (more prose, fewer discrete items) — adapt accordingly."
      : "",
    "MY RAW NOTES:",
    input.notes.trim(),
    "",
    "LINK DATA (verified metadata for the URLs in my notes — use these for accuracy, hyperlinks, and image placement):",
    buildLinkData(links),
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: HOUSE_STYLE,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  let text: string = data.content?.[0]?.text ?? "";
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();

  let result: DraftResult;
  try {
    const parsed = JSON.parse(text) as Partial<DraftResult>;
    result = {
      title: parsed.title ?? "",
      dek: parsed.dek ?? "",
      seoTitle: parsed.seoTitle ?? "",
      seoDescription: parsed.seoDescription ?? "",
      emailSubject: parsed.emailSubject ?? "",
      emailPreviewText: parsed.emailPreviewText ?? "",
      bodyHtml: parsed.bodyHtml ?? "",
    };
  } catch {
    result = { title: "", dek: "", seoTitle: "", seoDescription: "", emailSubject: "", emailPreviewText: "", bodyHtml: text };
  }
  // de-AI-ify the prose, then place images
  result.title = deAiify(result.title);
  result.dek = deAiify(result.dek);
  result.seoTitle = deAiify(result.seoTitle);
  result.seoDescription = deAiify(result.seoDescription);
  result.emailSubject = deAiify(result.emailSubject);
  result.emailPreviewText = deAiify(result.emailPreviewText);
  result.bodyHtml = substituteImages(deAiify(result.bodyHtml), links);
  return result;
}
