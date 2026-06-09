import "server-only";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

export const isAiConfigured = Boolean(KEY);

const HOUSE_STYLE = `You are the writer for YeeHaw, a nostalgic internet recommendations newsletter ("a Saturday morning mixtape of weird finds, useful ideas, and good little detours").

Voice: warm, funny, personal, curious, a little goofy — like a smart friend sending you cool stuff. Recommendation-first. Not overly polished, not SEO spam, no corporate tone.

Hard rules:
- Use ONLY the user's notes/links as the source of truth. Do NOT invent facts about products, movies, music, articles, or people. If a detail isn't given, stay general rather than guessing.
- Do NOT fabricate personal anecdotes; only use ones the user supplied.
- Turn the user's raw items into a skimmable post: a short warm intro paragraph, then each recommendation as its own block with an <h3> title and a short paragraph (1-3 sentences). Group related items under an <h2> section header when it helps.
- Where the user gave a URL for an item, link the item title or a relevant phrase with <a href="URL">.
- Keep it tight and fun.

Output format: return ONLY valid JSON (no markdown fences, no commentary) shaped exactly like:
{"title": "a short catchy post title", "dek": "a one-sentence summary for the card", "bodyHtml": "the post body as clean semantic HTML"}

In bodyHtml use ONLY these tags: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <a href>, <strong>, <em>. No <div>, no inline styles, no <html>/<body> wrappers.`;

export interface DraftResult {
  title: string;
  dek: string;
  bodyHtml: string;
}

/** Generate a post draft from the user's freeform notes/links. */
export async function generateDraft(input: {
  notes: string;
  theme?: string;
  postType?: string;
}): Promise<DraftResult> {
  if (!isAiConfigured) throw new Error("AI is not configured (ANTHROPIC_API_KEY missing).");

  const userMsg = [
    input.theme ? `Theme / title idea: ${input.theme}` : "",
    input.postType === "essay"
      ? "This is an essay-style post (more prose, fewer discrete items) — adapt accordingly."
      : "",
    "Here are my raw notes and links to turn into a YeeHaw post:",
    "",
    input.notes.trim(),
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

  try {
    const parsed = JSON.parse(text) as DraftResult;
    return {
      title: parsed.title ?? "",
      dek: parsed.dek ?? "",
      bodyHtml: parsed.bodyHtml ?? "",
    };
  } catch {
    // Fallback: if the model didn't return clean JSON, treat the whole thing as body.
    return { title: "", dek: "", bodyHtml: text };
  }
}
