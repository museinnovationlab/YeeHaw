"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import RichTextEditor from "./RichTextEditor";
import DeletePostButton from "./DeletePostButton";
import {
  savePostAction,
  generateWhatToWatchAction,
  sendTestEmailAction,
  getBroadcastPreviewAction,
  broadcastPostAction,
  postToBlueskyAction,
  generateShareKitAction,
  type BroadcastPreview,
  type ShareKit,
} from "@/app/admin/(dash)/posts/actions";
import {
  getUnusedStashAction,
  markStashUsedAction,
} from "@/app/admin/(dash)/stash/actions";
import type { Post, PostStatus, PostType, StashItem } from "@/lib/types";
import { stamps } from "@/lib/brand";

// Derive from the brand stamp set so the picker can never drift from what
// actually exists (removing a stamp from brand.ts used to leave a dead option).
const STAMPS = Object.keys(stamps);

const STATUSES: PostStatus[] = ["idea", "draft", "reviewed", "scheduled", "published", "archived"];

// ISO -> value for <input type="datetime-local"> (local time, "YYYY-MM-DDTHH:mm")
function toLocalDatetime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function field(label: string, el: React.ReactNode, hint?: string) {
  return (
    <label className="block">
      <span className="font-mono text-xs uppercase tracking-wide text-ink/60">{label}</span>
      {el}
      {hint && <span className="font-mono mt-1 block text-[11px] text-ink/40">{hint}</span>}
    </label>
  );
}

type AiFieldKey =
  | "title"
  | "dek"
  | "seoTitle"
  | "seoDescription"
  | "emailSubject"
  | "emailPreviewText";

/**
 * Same as field(), plus a small button that regenerates just this one value
 * from the post body. Not a <label> — a label click would be forwarded to the
 * button instead of the input.
 */
function aiField(
  label: string,
  el: React.ReactNode,
  onGenerate: () => void,
  busy: boolean,
  disabled: boolean
) {
  return (
    <div className="block">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-wide text-ink/60">{label}</span>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy || disabled}
          title={
            disabled
              ? "Write some body copy first — the suggestion is based on the post"
              : `Generate a new ${label.toLowerCase()}`
          }
          className="font-mono shrink-0 rounded-full border-2 border-ink bg-cream px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink transition-colors hover:bg-yellow disabled:opacity-30"
        >
          {busy ? "…" : "✨ Generate"}
        </button>
      </div>
      {el}
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border-2 border-ink bg-cream px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-purple/40";

export default function PostEditor({ post }: { post: Post | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedId, setSavedId] = useState<string | null>(post?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [postType, setPostType] = useState<PostType>(post?.postType ?? "roundup");
  const [dek, setDek] = useState(post?.dek ?? "");
  const [stamp, setStamp] = useState(post?.stamp ?? "weirdFind");
  const [featuredImageUrl, setFeaturedImageUrl] = useState(post?.featuredImageUrl ?? "");
  const [uploadingFeatured, setUploadingFeatured] = useState(false);
  const featuredRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<PostStatus>(post?.status ?? "draft");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(
    post?.scheduledFor ? toLocalDatetime(post.scheduledFor) : ""
  );
  const [bodyHtml, setBodyHtml] = useState(post?.bodyHtml ?? "");
  const [publishDate, setPublishDate] = useState(
    post?.publishedAt ? post.publishedAt.slice(0, 10) : ""
  );
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(post?.seoDescription ?? "");
  const [emailSubject, setEmailSubject] = useState(post?.emailSubject ?? "");
  const [emailPreviewText, setEmailPreviewText] = useState(post?.emailPreviewText ?? "");

  // AI draft
  const [showAi, setShowAi] = useState(false);
  const [aiNotes, setAiNotes] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Default to the non-destructive mode so an accidental generate can't wipe a
  // draft in progress; "replace" stays one click away for a from-scratch draft.
  const [aiMode, setAiMode] = useState<"replace" | "append">("append");
  // Which single metadata field is currently regenerating (null = none).
  const [aiFieldBusy, setAiFieldBusy] = useState<AiFieldKey | null>(null);
  const [editorKey, setEditorKey] = useState(0); // bump to reload editor content
  const [w2wBusy, setW2wBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  // Broadcast to the list: preview holds the confirm-step data (null = closed).
  const [castPreview, setCastPreview] = useState<BroadcastPreview | null>(null);
  const [castBusy, setCastBusy] = useState(false);
  const [castMsg, setCastMsg] = useState<string | null>(null);
  const [castConfirmText, setCastConfirmText] = useState("");
  // Cross-posting. Default ON — nearly every issue goes to Bluesky, so the
  // toggle is opt-OUT and lives right next to the publish button.
  const [bskyEnabled, setBskyEnabled] = useState(post?.bskyEnabled !== false);
  const [bskyMsg, setBskyMsg] = useState<string | null>(null);
  const [bskyBusy, setBskyBusy] = useState(false);
  const [kit, setKit] = useState<ShareKit | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function crossPost(id: string) {
    setBskyBusy(true);
    setBskyMsg(null);
    try {
      const r = await postToBlueskyAction(id);
      if (r.url) setBskyMsg(`✓ Posted to Bluesky`);
      else if (r.skipped) setBskyMsg(r.skipped);
      else setBskyMsg(r.error || "Bluesky post failed.");
    } catch (e) {
      setBskyMsg(e instanceof Error ? e.message : "Bluesky post failed.");
    } finally {
      setBskyBusy(false);
    }
  }

  function buildKit() {
    if (!savedId || kitBusy) return;
    setKitBusy(true);
    startTransition(async () => {
      try {
        setKit(await generateShareKitAction(savedId));
      } finally {
        setKitBusy(false);
      }
    });
  }

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  // stash picker
  const [stashItems, setStashItems] = useState<StashItem[]>([]);
  const [showStash, setShowStash] = useState(false);
  const [stashSel, setStashSel] = useState<Set<string>>(new Set());
  const [stashLoading, setStashLoading] = useState(false);

  async function openStash() {
    setShowStash(true);
    setStashLoading(true);
    try {
      setStashItems(await getUnusedStashAction());
    } catch {
      setStashItems([]);
    } finally {
      setStashLoading(false);
    }
  }
  function toggleStashSel(id: string) {
    setStashSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function importStash() {
    const ids = [...stashSel];
    if (!ids.length) return;
    const text = stashItems.filter((i) => stashSel.has(i.id)).map((i) => i.text).join("\n");
    setAiNotes((prev) => (prev.trim() ? `${prev}\n${text}` : text));
    try {
      await markStashUsedAction(ids); // crosses them off the master list
    } catch {
      /* non-fatal */
    }
    setStashItems((prev) => prev.filter((i) => !stashSel.has(i.id)));
    setStashSel(new Set());
    setShowStash(false);
  }

  async function generateDraft() {
    if (!aiNotes.trim()) return;
    setAiBusy(true);
    setAiError(null);
    // On an empty post there's nothing to append to and nothing to destroy, so
    // run a full draft regardless of the toggle — that's the only mode that
    // also fills in title/dek/SEO/email metadata.
    const isEmpty = !bodyHtml.replace(/<[^>]+>/g, "").trim();
    const mode = isEmpty ? "replace" : aiMode;
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: aiNotes, theme: title, postType, mode }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(
          b.error === "ai_not_configured"
            ? "AI isn't configured (add ANTHROPIC_API_KEY)."
            : "Draft generation failed."
        );
      }
      const draft = await res.json();
      if (draft.bodyHtml) {
        // append mode adds to the existing body; replace mode swaps it out
        setBodyHtml((prev) =>
          mode === "append" && prev ? `${prev}\n${draft.bodyHtml}` : draft.bodyHtml
        );
        setEditorKey((k) => k + 1); // reload the editor with the new content
      }
      // only fill metadata on a full draft (append returns empty metadata)
      if (mode === "replace") {
        if (draft.title && !title) setTitle(draft.title);
        if (draft.dek && !dek) setDek(draft.dek);
        if (draft.seoTitle && !seoTitle) setSeoTitle(draft.seoTitle);
        if (draft.seoDescription && !seoDescription) setSeoDescription(draft.seoDescription);
        if (draft.emailSubject && !emailSubject) setEmailSubject(draft.emailSubject);
        if (draft.emailPreviewText && !emailPreviewText) setEmailPreviewText(draft.emailPreviewText);
      }
      setAiNotes("");
      setShowAi(false);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Draft generation failed.");
    } finally {
      setAiBusy(false);
    }
  }

  const FIELD_SETTERS: Record<AiFieldKey, (v: string) => void> = {
    title: setTitle,
    dek: setDek,
    seoTitle: setSeoTitle,
    seoDescription: setSeoDescription,
    emailSubject: setEmailSubject,
    emailPreviewText: setEmailPreviewText,
  };
  const FIELD_VALUES: Record<AiFieldKey, string> = {
    title,
    dek,
    seoTitle,
    seoDescription,
    emailSubject,
    emailPreviewText,
  };

  /** Regenerate one metadata field from the current post body. */
  async function regenerateField(key: AiFieldKey) {
    if (aiFieldBusy) return;
    setAiFieldBusy(key);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: key,
          title,
          dek,
          bodyHtml,
          // Sending the current value asks for a different option, so clicking
          // again gives a fresh take rather than the same line back.
          current: FIELD_VALUES[key],
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(
          b.error === "ai_not_configured"
            ? "AI isn't configured (add ANTHROPIC_API_KEY)."
            : b.error === "no_content"
              ? "Add a title or some body copy first — suggestions are based on the post."
              : "Couldn't generate that field."
        );
      }
      const { value } = await res.json();
      if (value) FIELD_SETTERS[key](value);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Couldn't generate that field.");
    } finally {
      setAiFieldBusy(null);
    }
  }

  // Suggestions are derived from the post, so there must be something to read.
  const canSuggest = Boolean(bodyHtml.replace(/<[^>]+>/g, "").trim() || title.trim());

  async function onPickFeatured(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingFeatured(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) throw new Error("upload failed");
      const { url } = await res.json();
      setFeaturedImageUrl(url);
    } catch {
      setError("Featured image upload failed");
    } finally {
      setUploadingFeatured(false);
    }
  }

  function save(nextStatus?: PostStatus) {
    setError(null);
    const effectiveStatus = nextStatus ?? status;
    startTransition(async () => {
      try {
        const res = await savePostAction({
          id: savedId ?? undefined,
          title,
          slug: slug || undefined,
          postType,
          dek,
          stamp,
          status: effectiveStatus,
          bodyHtml,
          featuredImageUrl,
          publishedAt: publishDate ? new Date(publishDate).toISOString() : undefined,
          scheduledFor:
            effectiveStatus === "scheduled" && scheduleAt
              ? new Date(scheduleAt).toISOString()
              : undefined,
          seoTitle,
          seoDescription,
          emailSubject,
          emailPreviewText,
          bskyEnabled,
        });
        setSavedId(res.id);
        setSlug(res.slug);
        setStatus(effectiveStatus);
        setSavedAt(new Date().toLocaleTimeString());
        // Cross-post ONLY on the transition into published — not on every save
        // of an already-live post, or editing a typo would fire a social post.
        // For an already-published issue, the explicit "Post to Bluesky now"
        // button is the path. (postToBlueskyAction is claim-guarded regardless.)
        const justPublished =
          effectiveStatus === "published" && post?.status !== "published";
        if (justPublished && bskyEnabled && !post?.bskyPostedAt) {
          await crossPost(res.id);
        }
        if (!post && res.id) {
          // first save of a new post → move to its edit URL
          router.replace(`/admin/posts/${res.id}`);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  async function sendTest() {
    if (!savedId || testBusy) return;
    setTestBusy(true);
    setTestMsg(null);
    try {
      const r = await sendTestEmailAction(savedId, testTo);
      setTestMsg(
        r.failed.length
          ? `Sent ${r.sent}. Failed: ${r.failed.map((f) => `${f.to} (${f.error})`).join(", ")}`
          : `✓ Test sent to ${r.sent} ${r.sent === 1 ? "address" : "addresses"}.`
      );
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : "Test send failed.");
    } finally {
      setTestBusy(false);
    }
  }

  /** Step 1 of the broadcast: fetch the real recipient count to confirm against. */
  async function openBroadcast() {
    if (!savedId || castBusy) return;
    setCastBusy(true);
    setCastMsg(null);
    try {
      setCastPreview(await getBroadcastPreviewAction(savedId));
    } catch (e) {
      setCastMsg(e instanceof Error ? e.message : "Couldn't load subscriber count.");
    } finally {
      setCastBusy(false);
    }
  }

  /** Step 2: the actual send. Guarded server-side too — this is just the UI. */
  async function confirmBroadcast() {
    if (!savedId || castBusy || !castPreview) return;
    setCastBusy(true);
    setCastMsg(null);
    try {
      const r = await broadcastPostAction(savedId);
      // "Accepted", not "delivered" — Resend takes the whole batch immediately,
      // but inboxes confirm over minutes to hours (Gmail defers a cold domain's
      // first bulk send). Analytics is the source of truth for delivery.
      setCastMsg(
        r.failedBatches
          ? `Handed ${r.sent} of ${r.recipients} to Resend. ${r.failedBatches} batch(es) failed — check Resend.`
          : `✓ All ${r.sent} accepted by Resend. Delivery confirms over the next few hours — watch Analytics for the real count.`
      );
      setCastPreview(null);
      router.refresh();
    } catch (e) {
      setCastMsg(e instanceof Error ? e.message : "Send failed.");
      setCastPreview(null);
    } finally {
      setCastBusy(false);
    }
  }

  async function insertWhatToWatch() {
    if (w2wBusy) return;
    setW2wBusy(true);
    setError(null);
    try {
      const { html } = await generateWhatToWatchAction();
      setBodyHtml((prev) => (prev ? `${prev}\n${html}` : html));
      setEditorKey((k) => k + 1); // reload editor with the inserted section
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't fetch this weekend's picks.");
    } finally {
      setW2wBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      {/* main column */}
      <div className="flex flex-col gap-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          className="font-heading w-full rounded-lg border-2 border-ink bg-cream px-4 py-3 text-2xl text-ink outline-none focus:ring-2 focus:ring-purple/40"
        />
        {aiField(
          "Dek (one-line summary, shown on cards)",
          <textarea
            value={dek}
            onChange={(e) => setDek(e.target.value)}
            rows={2}
            className={inputClass}
          />,
          () => regenerateField("dek"),
          aiFieldBusy === "dek",
          !canSuggest
        )}
        {/* NOTE: the editor must NOT be wrapped in a <label> — label clicks get
            redirected to the first toolbar button. Use a plain div. */}
        <div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wide text-ink/60">Body</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={insertWhatToWatch}
                disabled={w2wBusy}
                title="Insert this weekend's TV/streaming releases + marquee sports"
                className="font-heading yh-shadow-sm rounded-full border-2 border-ink bg-cyan px-3 py-1 text-xs text-ink transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {w2wBusy ? "…" : "📺 What to Watch"}
              </button>
              <button
                type="button"
                onClick={() => setShowAi((v) => !v)}
                className="font-heading yh-shadow-sm rounded-full border-2 border-ink bg-yellow px-3 py-1 text-xs text-ink transition-transform hover:-translate-y-0.5"
              >
                ✨ Generate with AI
              </button>
            </div>
          </div>

          {showAi && (
            <div className="mt-2 rounded-xl border-2 border-purple bg-purple/5 p-4">
              <p className="font-mono mb-2 text-xs uppercase tracking-wide text-purple">
                Paste your links + notes — YeeHaw fetches each link, pulls the image, hyperlinks it, credits the source, and drafts it in your voice
              </p>
              <textarea
                value={aiNotes}
                onChange={(e) => setAiNotes(e.target.value)}
                rows={6}
                placeholder={
                  "e.g.\nRepo Man (1984) — https://imdb.com/...  weird punk cult classic, recommend near top\nThat olive oil I love — https://...  splurge but worth it\n..."
                }
                className="font-mono w-full rounded-lg border-2 border-ink bg-cream px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-purple/40"
              />

              <div className="mt-2">
                <button
                  type="button"
                  onClick={openStash}
                  className="font-mono rounded-full border-2 border-ink bg-cream px-3 py-1 text-xs uppercase hover:bg-yellow"
                >
                  + Import from stash
                </button>
              </div>
              {showStash && (
                <div className="mt-2 rounded-lg border-2 border-ink bg-cream p-3">
                  {stashLoading ? (
                    <p className="font-mono text-xs text-ink/50">loading…</p>
                  ) : stashItems.length === 0 ? (
                    <p className="font-mono text-xs text-ink/50">
                      Stash is empty.{" "}
                      <a href="/admin/stash" className="text-purple underline">
                        Add items
                      </a>
                      .
                    </p>
                  ) : (
                    <>
                      <div className="max-h-48 overflow-y-auto">
                        {stashItems.map((i) => (
                          <label
                            key={i.id}
                            className="flex cursor-pointer items-start gap-2 py-1 text-sm text-ink"
                          >
                            <input
                              type="checkbox"
                              checked={stashSel.has(i.id)}
                              onChange={() => toggleStashSel(i.id)}
                              className="mt-1"
                            />
                            <span className="break-words">{i.text}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={importStash}
                          disabled={!stashSel.size}
                          className="font-heading rounded-full border-2 border-ink bg-mint px-4 py-1.5 text-sm text-ink disabled:opacity-50"
                        >
                          Add {stashSel.size || ""} to notes
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowStash(false)}
                          className="font-mono text-xs uppercase text-ink/50 hover:text-pink"
                        >
                          cancel
                        </button>
                        <span className="font-mono text-[11px] text-ink/40">
                          importing crosses items off your stash
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {aiError && <p className="mt-2 text-sm text-pink">{aiError}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex overflow-hidden rounded-full border-2 border-ink">
                  {(["replace", "append"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAiMode(m)}
                      className={`font-mono px-3 py-1.5 text-xs uppercase ${
                        aiMode === m ? "bg-ink text-cream" : "bg-cream text-ink hover:bg-yellow"
                      }`}
                    >
                      {m === "replace" ? "Replace body" : "Add to body"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={generateDraft}
                  disabled={aiBusy || !aiNotes.trim()}
                  className="font-heading yh-shadow-sm rounded-full border-2 border-ink bg-purple px-5 py-2 text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {aiBusy ? "Drafting…" : "Generate Draft ▶"}
                </button>
                {bodyHtml && (
                  <span className="font-mono text-[11px] text-ink/40">
                    {aiMode === "append"
                      ? "adds to the bottom of the current body"
                      : "replaces the current body"}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mt-2">
            <RichTextEditor key={editorKey} value={bodyHtml} onChange={setBodyHtml} />
          </div>
        </div>

        <details className="rounded-xl border-2 border-ink/20 bg-cream/60 p-4">
          <summary className="font-mono cursor-pointer text-xs uppercase tracking-wide text-ink/60">
            SEO &amp; email fields
          </summary>
          <div className="mt-4 flex flex-col gap-3">
            {aiField(
              "SEO title",
              <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={inputClass} />,
              () => regenerateField("seoTitle"),
              aiFieldBusy === "seoTitle",
              !canSuggest
            )}
            {aiField(
              "SEO description",
              <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} className={inputClass} />,
              () => regenerateField("seoDescription"),
              aiFieldBusy === "seoDescription",
              !canSuggest
            )}
            {aiField(
              "Email subject",
              <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className={inputClass} />,
              () => regenerateField("emailSubject"),
              aiFieldBusy === "emailSubject",
              !canSuggest
            )}
            {aiField(
              "Email preview text",
              <input value={emailPreviewText} onChange={(e) => setEmailPreviewText(e.target.value)} className={inputClass} />,
              () => regenerateField("emailPreviewText"),
              aiFieldBusy === "emailPreviewText",
              !canSuggest
            )}
          </div>
        </details>
      </div>

      {/* sidebar */}
      <aside className="flex h-fit flex-col gap-4 rounded-2xl border-2 border-ink bg-cream p-4 lg:sticky lg:top-20">
        <div className="flex items-center gap-2">
          <button
            onClick={() => save()}
            disabled={pending || !title}
            className="font-heading yh-shadow-sm flex-1 rounded-full border-2 border-ink bg-purple px-4 py-2.5 text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {status !== "published" && (
            <button
              onClick={() => setShowSchedule((v) => !v)}
              disabled={pending || !title}
              className="font-heading yh-shadow-sm rounded-full border-2 border-ink bg-pink px-4 py-2.5 text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              Publish ▾
            </button>
          )}
        </div>

        {showSchedule && status !== "published" && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-ink/40 bg-cream p-3">
            {/* Opt-OUT cross-post toggle, deliberately in the publish flow so
                the choice is visible at the moment it takes effect. */}
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border-2 border-cyan/60 bg-cyan/10 p-2">
              <input
                type="checkbox"
                checked={bskyEnabled}
                onChange={(e) => setBskyEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-purple"
              />
              <span className="font-mono text-[11px] leading-snug text-ink">
                Also post to Bluesky
                <span className="block text-[10px] text-ink/50">
                  {bskyEnabled
                    ? "Posts a link card when this goes live."
                    : "Off — nothing will be cross-posted."}
                </span>
              </span>
            </label>
            <button
              onClick={() => {
                setShowSchedule(false);
                save("published");
              }}
              disabled={pending || !title}
              className="font-heading yh-shadow-sm rounded-full border-2 border-ink bg-pink px-4 py-2 text-sm text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              Publish now ▶
            </button>
            <div className="font-mono text-center text-[10px] uppercase tracking-wide text-ink/40">
              — or schedule for later —
            </div>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className={inputClass}
            />
            <button
              onClick={() => {
                setShowSchedule(false);
                save("scheduled");
              }}
              disabled={pending || !title || !scheduleAt}
              className="font-heading yh-shadow-sm rounded-full border-2 border-ink bg-cyan px-4 py-2 text-sm text-ink transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              Schedule ⏳
            </button>
          </div>
        )}

        {status === "scheduled" && scheduleAt && (
          <p className="font-mono rounded-lg border-2 border-cyan bg-cyan/10 px-3 py-2 text-xs text-ink">
            ⏳ Scheduled for {new Date(scheduleAt).toLocaleString()} — editable until then.
          </p>
        )}
        {/* Publishing and broadcasting are separate on purpose — a send has no
            undo, so it's always an explicit click. Say so, so nobody waits on an
            email that was never triggered. */}
        <p className="font-mono rounded-lg border-2 border-orange bg-orange/10 px-3 py-2 text-xs text-ink">
          📭 Publishing does <strong>not</strong> email your subscribers. Use{" "}
          <strong>Send to subscribers</strong> in the sidebar when you&apos;re ready.
        </p>
        {error && <p className="text-sm text-pink">{error}</p>}
        {savedAt && !error && (
          <p className="font-mono text-[11px] text-ink/50">Saved at {savedAt}</p>
        )}

        {field(
          "Status",
          <select value={status} onChange={(e) => setStatus(e.target.value as PostStatus)} className={inputClass}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        {field(
          "Type",
          <select value={postType} onChange={(e) => setPostType(e.target.value as PostType)} className={inputClass}>
            <option value="roundup">roundup (AI-assisted)</option>
            <option value="essay">essay (hand-written)</option>
          </select>
        )}
        {field(
          "Card stamp",
          <select value={stamp} onChange={(e) => setStamp(e.target.value)} className={inputClass}>
            {STAMPS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <div>
          <span className="font-mono text-xs uppercase tracking-wide text-ink/60">
            Featured image
          </span>
          {featuredImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={featuredImageUrl}
              alt=""
              className="mt-1 max-h-56 w-full rounded-lg border-2 border-ink bg-ink/5 object-contain"
            />
          ) : (
            <div className="mt-1 flex aspect-video w-full items-center justify-center rounded-lg border-2 border-dashed border-ink/30 text-xs text-ink/40">
              none
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => featuredRef.current?.click()}
              disabled={uploadingFeatured}
              className="font-mono flex-1 rounded-full border-2 border-ink bg-cream px-3 py-1.5 text-xs uppercase hover:bg-yellow disabled:opacity-50"
            >
              {uploadingFeatured ? "…" : featuredImageUrl ? "Replace" : "Upload"}
            </button>
            {featuredImageUrl && (
              <button
                type="button"
                onClick={() => setFeaturedImageUrl("")}
                className="font-mono rounded-full border-2 border-ink bg-cream px-3 py-1.5 text-xs uppercase hover:bg-pink hover:text-cream"
              >
                Clear
              </button>
            )}
          </div>
          <input ref={featuredRef} type="file" accept="image/*" hidden onChange={onPickFeatured} />
        </div>

        {field(
          "Publish date",
          <input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} className={inputClass} />,
          "Leave blank to use now on publish; set to back-date archive posts."
        )}
        {field(
          "Slug",
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from title" className={`${inputClass} font-mono text-sm`} />
        )}
        {savedId && status === "published" && (
          <a href={`/posts/${slug}`} target="_blank" className="font-mono text-center text-xs uppercase tracking-wide text-purple hover:text-pink">
            View live ↗
          </a>
        )}
        {savedId && (
          <div className="rounded-xl border-2 border-cyan bg-cyan/5 p-3">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink/60">
              Send test email
            </p>
            <p className="font-mono mt-1 text-[10px] text-ink/40">
              Goes only to these addresses (sends the saved version) — never the list.
            </p>
            <input
              type="text"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@email.com, friend@email.com"
              className={`${inputClass} mt-2 font-mono text-sm`}
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={testBusy || !testTo.trim()}
              className="font-heading yh-shadow-sm mt-2 w-full rounded-full border-2 border-ink bg-cyan px-4 py-2 text-sm text-ink transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {testBusy ? "Sending…" : "Send test ✉"}
            </button>
            {testMsg && <p className="font-mono mt-2 text-[11px] text-ink/70">{testMsg}</p>}
          </div>
        )}

        {/* Broadcast to the whole list. Deliberately a separate, explicit action
            rather than something publishing triggers — a send has no undo. */}
        {savedId && (
          <div className="rounded-xl border-2 border-pink bg-pink/5 p-3">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink/60">
              Send to subscribers
            </p>

            {post?.emailSentAt ? (
              <p className="font-mono mt-1 text-[10px] text-ink/50">
                ✓ Already sent {new Date(post.emailSentAt).toLocaleString()}. An issue can
                only be broadcast once.
              </p>
            ) : post?.importedFromArchive ? (
              <p className="font-mono mt-1 text-[10px] text-ink/50">
                Backfilled archive issue — broadcasting is disabled so an old issue
                can&apos;t go out to the list.
              </p>
            ) : status !== "published" ? (
              <p className="font-mono mt-1 text-[10px] text-ink/40">
                Publish the post first, then you can send it to the list.
              </p>
            ) : !castPreview ? (
              <>
                <p className="font-mono mt-1 text-[10px] text-ink/40">
                  Sends the saved version to every active subscriber. There is no undo.
                </p>
                <button
                  type="button"
                  onClick={openBroadcast}
                  disabled={castBusy}
                  className="font-heading yh-shadow-sm mt-2 w-full rounded-full border-2 border-ink bg-pink px-4 py-2 text-sm text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {castBusy ? "Checking…" : "Send to subscribers ▶"}
                </button>
              </>
            ) : (
              <div className="mt-2 rounded-lg border-2 border-ink bg-cream p-2">
                <p className="font-mono text-[11px] text-ink">
                  Send <strong>{castPreview.subject}</strong> to{" "}
                  <strong>{castPreview.recipients}</strong> subscriber
                  {castPreview.recipients === 1 ? "" : "s"}?
                </p>
                <p className="font-mono mt-1 text-[10px] text-ink/50">
                  Unsubscribed and bounced addresses are already excluded. Type SEND to
                  confirm.
                </p>
                <input
                  type="text"
                  value={castConfirmText}
                  onChange={(e) => setCastConfirmText(e.target.value)}
                  placeholder="SEND"
                  className={`${inputClass} mt-2 font-mono text-sm`}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={confirmBroadcast}
                    disabled={castBusy || castConfirmText.trim().toUpperCase() !== "SEND"}
                    className="font-heading yh-shadow-sm flex-1 rounded-full border-2 border-ink bg-pink px-3 py-2 text-sm text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                  >
                    {castBusy ? "Sending…" : `Send to ${castPreview.recipients} ▶`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCastPreview(null);
                      setCastConfirmText("");
                    }}
                    disabled={castBusy}
                    className="font-mono rounded-full border-2 border-ink bg-cream px-3 py-2 text-xs uppercase hover:bg-yellow disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {castMsg && <p className="font-mono mt-2 text-[11px] text-ink/70">{castMsg}</p>}
          </div>
        )}
        {/* Bluesky status + the copy-paste share kit for platforms with no
            usable API (Substack has none, X charges, Meta needs review). */}
        {savedId && (
          <div className="rounded-xl border-2 border-ink/20 bg-cream p-3">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink/60">
              Share kit
            </p>

            {post?.bskyPostedAt ? (
              <p className="font-mono mt-1 text-[10px] text-ink/50">
                ✓ On Bluesky{" "}
                {post.bskyUrl && (
                  <a
                    href={post.bskyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple underline hover:text-pink"
                  >
                    view post ↗
                  </a>
                )}
              </p>
            ) : status === "published" ? (
              <button
                type="button"
                onClick={() => savedId && crossPost(savedId)}
                disabled={bskyBusy || pending}
                className="font-mono mt-2 w-full rounded-full border-2 border-ink bg-cream px-3 py-1.5 text-[10px] uppercase tracking-wide hover:bg-cyan disabled:opacity-40"
              >
                {bskyBusy ? "Posting…" : "Post to Bluesky now"}
              </button>
            ) : (
              <p className="font-mono mt-1 text-[10px] text-ink/40">
                Bluesky posts when you publish (toggle is in Publish ▾).
              </p>
            )}
            {bskyMsg && <p className="font-mono mt-1 text-[10px] text-ink/70">{bskyMsg}</p>}

            <button
              type="button"
              onClick={buildKit}
              disabled={kitBusy || pending || !title}
              className="font-mono mt-2 w-full rounded-full border-2 border-ink bg-cream px-3 py-1.5 text-[10px] uppercase tracking-wide hover:bg-yellow disabled:opacity-40"
            >
              {kitBusy ? "Writing…" : kit ? "Regenerate blurbs" : "✨ Draft share posts"}
            </button>

            {kit && (
              <div className="mt-2 flex flex-col gap-2">
                {([
                  ["threads", "Threads"],
                  ["twitter", "X / Twitter"],
                  ["instagram", "Instagram"],
                  ["substack", "Substack (markdown)"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="rounded-lg border-2 border-ink/30 bg-cream p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                        {label}
                      </span>
                      <button
                        type="button"
                        onClick={() => copy(key, kit[key])}
                        className="font-mono shrink-0 rounded-full border-2 border-ink/60 bg-cream px-2 py-0.5 text-[9px] uppercase hover:bg-yellow"
                      >
                        {copied === key ? "copied ✓" : "copy"}
                      </button>
                    </div>
                    <p className="font-mono mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug text-ink/70">
                      {kit[key] || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {savedId && (
          <div className="mt-2 border-t-2 border-ink/10 pt-3">
            <DeletePostButton
              id={savedId}
              slug={slug}
              title={title}
              redirectTo="/admin"
              label="Delete post"
              className="font-heading w-full rounded-full border-2 border-pink bg-cream px-4 py-2 text-sm text-pink transition-colors hover:bg-pink hover:text-cream disabled:opacity-50"
            />
          </div>
        )}
      </aside>
    </div>
  );
}
