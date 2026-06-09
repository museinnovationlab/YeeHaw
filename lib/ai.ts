import "server-only";
import { unfurl, extractUrls, type LinkMeta } from "./unfurl";
import { uploadFromUrl } from "./cloudinary";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

export const isAiConfigured = Boolean(KEY);

const HOUSE_STYLE = `You are the writer for YeeHaw, a nostalgic internet recommendations newsletter ("a Saturday morning mixtape of weird finds, useful ideas, and good little detours").

Voice: warm, funny, personal, curious, a little goofy — like a smart friend sending you cool stuff. Recommendation-first. Not overly polished, not SEO spam, no corporate tone.

Hard rules:
- Use ONLY the user's notes and the provided LINK DATA as the source of truth. Do NOT invent facts about products, movies, music, articles, or people. If a detail isn't given, stay general.
- Do NOT fabricate personal anecdotes; only use ones the user supplied.
- Turn the items into a skimmable post: a short warm intro paragraph, then each recommendation as its own block: an <h3> title (hyperlink the title to the item's URL with <a href="URL">) followed by a short paragraph (1-3 sentences). Group related items under an <h2> section header when it helps.
- IMAGES: For each item that has an image placeholder token in the LINK DATA (e.g. {{IMAGE_1}}), place that exact token on its own line right after that item's title/paragraph where the image should appear. Do NOT write <img> tags yourself and do NOT alter the token — just drop the token in. Only use a token if the item actually has one.
- Keep it tight and fun.

Output format: return ONLY valid JSON (no markdown fences, no commentary) shaped exactly like:
{"title": "a short catchy post title", "dek": "a one-sentence summary for the card", "bodyHtml": "the post body as clean semantic HTML possibly containing {{IMAGE_n}} tokens"}

In bodyHtml use ONLY these tags: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <a href>, <strong>, <em>. No <div>, no inline styles, no <img> (use the tokens instead), no <html>/<body> wrappers.`;

export interface DraftResult {
  title: string;
  dek: string;
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
}): Promise<DraftResult> {
  if (!isAiConfigured) throw new Error("AI is not configured (ANTHROPIC_API_KEY missing).");

  const links = await enrichLinks(input.notes);

  const userMsg = [
    input.theme ? `Theme / title idea: ${input.theme}` : "",
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
    const parsed = JSON.parse(text) as DraftResult;
    result = { title: parsed.title ?? "", dek: parsed.dek ?? "", bodyHtml: parsed.bodyHtml ?? "" };
  } catch {
    result = { title: "", dek: "", bodyHtml: text };
  }
  result.bodyHtml = substituteImages(result.bodyHtml, links);
  return result;
}
