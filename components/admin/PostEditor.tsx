"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import RichTextEditor from "./RichTextEditor";
import { savePostAction } from "@/app/admin/(dash)/posts/actions";
import type { Post, PostStatus, PostType } from "@/lib/types";

const STAMPS = [
  "weirdFind",
  "fieldNote",
  "bonusTrack",
  "powerUp",
  "goodStuff",
  "nowPlaying",
  "secretArea",
  "yeehaw",
  "new",
  "rewind",
];

const STATUSES: PostStatus[] = ["idea", "draft", "reviewed", "scheduled", "published", "archived"];

function field(label: string, el: React.ReactNode, hint?: string) {
  return (
    <label className="block">
      <span className="font-mono text-xs uppercase tracking-wide text-ink/60">{label}</span>
      {el}
      {hint && <span className="font-mono mt-1 block text-[11px] text-ink/40">{hint}</span>}
    </label>
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
  const [bodyHtml, setBodyHtml] = useState(post?.bodyHtml ?? "");
  const [publishDate, setPublishDate] = useState(
    post?.publishedAt ? post.publishedAt.slice(0, 10) : ""
  );
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(post?.seoDescription ?? "");
  const [emailSubject, setEmailSubject] = useState(post?.emailSubject ?? "");
  const [emailPreviewText, setEmailPreviewText] = useState(post?.emailPreviewText ?? "");

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
          seoTitle,
          seoDescription,
          emailSubject,
          emailPreviewText,
        });
        setSavedId(res.id);
        setSlug(res.slug);
        setStatus(effectiveStatus);
        setSavedAt(new Date().toLocaleTimeString());
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
        {field(
          "Dek (one-line summary, shown on cards)",
          <textarea
            value={dek}
            onChange={(e) => setDek(e.target.value)}
            rows={2}
            className={inputClass}
          />
        )}
        {/* NOTE: the editor must NOT be wrapped in a <label> — label clicks get
            redirected to the first toolbar button. Use a plain div. */}
        <div>
          <span className="font-mono text-xs uppercase tracking-wide text-ink/60">Body</span>
          <div className="mt-1">
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
          </div>
        </div>

        <details className="rounded-xl border-2 border-ink/20 bg-cream/60 p-4">
          <summary className="font-mono cursor-pointer text-xs uppercase tracking-wide text-ink/60">
            SEO &amp; email fields
          </summary>
          <div className="mt-4 flex flex-col gap-3">
            {field("SEO title", <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={inputClass} />)}
            {field("SEO description", <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} className={inputClass} />)}
            {field("Email subject", <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className={inputClass} />)}
            {field("Email preview text", <input value={emailPreviewText} onChange={(e) => setEmailPreviewText(e.target.value)} className={inputClass} />)}
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
              onClick={() => save("published")}
              disabled={pending || !title}
              className="font-heading yh-shadow-sm rounded-full border-2 border-ink bg-pink px-4 py-2.5 text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              Publish
            </button>
          )}
        </div>
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
              className="mt-1 aspect-video w-full rounded-lg border-2 border-ink object-cover"
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
      </aside>
    </div>
  );
}
