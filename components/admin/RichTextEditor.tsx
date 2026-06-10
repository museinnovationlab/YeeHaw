"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { Vimeo, vimeoEmbedSrc } from "./VimeoNode";
import { useCallback, useRef, useState } from "react";

/** Upload a file to the admin image endpoint, return its URL. */
async function uploadFile(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? "upload failed");
  }
  const { url } = await res.json();
  return url as string;
}

function Btn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`min-w-8 rounded-md border-2 border-ink px-2 py-1 text-sm font-bold transition-colors disabled:opacity-30 ${
        active ? "bg-ink text-cream" : "bg-cream text-ink hover:bg-yellow"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-picking the same file
      if (!file) return;
      setUploading(true);
      try {
        const url = await uploadFile(file);
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      } catch (err) {
        window.alert(
          "Image upload failed: " +
            (err instanceof Error ? err.message : "unknown error")
        );
      } finally {
        setUploading(false);
      }
    },
    [editor]
  );

  const addImageByUrl = useCallback(() => {
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const addVideo = useCallback(() => {
    const url = window.prompt("YouTube video URL");
    if (url) editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
  }, [editor]);

  const addVimeo = useCallback(() => {
    const url = window.prompt("Vimeo video URL");
    if (!url) return;
    const src = vimeoEmbedSrc(url.trim());
    if (!src) {
      window.alert("Couldn't find a Vimeo video ID in that URL.");
      return;
    }
    editor.chain().focus().insertContent({ type: "vimeo", attrs: { src } }).run();
  }, [editor]);

  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-1 border-b-2 border-ink bg-cream p-2">
      <Btn title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
        B
      </Btn>
      <Btn title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
        <span className="italic">I</span>
      </Btn>
      <Btn title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
        <span className="underline">U</span>
      </Btn>
      <Btn title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
        <span className="line-through">S</span>
      </Btn>
      <span className="mx-1 h-6 w-px bg-ink/20" />
      <Btn title="Normal text" onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive("paragraph")}>
        ¶
      </Btn>
      <Btn title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>
        H2
      </Btn>
      <Btn title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}>
        H3
      </Btn>
      <span className="mx-1 h-6 w-px bg-ink/20" />
      <Btn title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
        • ☰
      </Btn>
      <Btn title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
        1.
      </Btn>
      <Btn
        title="Indent (in list)"
        onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
        disabled={!editor.can().sinkListItem("listItem")}
      >
        →|
      </Btn>
      <Btn
        title="Outdent (in list)"
        onClick={() => editor.chain().focus().liftListItem("listItem").run()}
        disabled={!editor.can().liftListItem("listItem")}
      >
        |←
      </Btn>
      <span className="mx-1 h-6 w-px bg-ink/20" />
      <Btn title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
        ❝
      </Btn>
      <Btn title="Link" onClick={setLink} active={editor.isActive("link")}>
        🔗
      </Btn>
      <Btn title="Upload image" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? "…" : "🖼"}
      </Btn>
      <Btn title="Image by URL" onClick={addImageByUrl}>
        🌐
      </Btn>
      <Btn title="YouTube video" onClick={addVideo}>
        📺
      </Btn>
      <Btn title="Vimeo video" onClick={addVimeo}>
        🎬
      </Btn>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPickFile}
      />
      <span className="mx-1 h-6 w-px bg-ink/20" />
      <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        ↶
      </Btn>
      <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        ↷
      </Btn>
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing, or generate a draft…",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      Youtube.configure({ nocookie: true, controls: true, modestBranding: true, width: 640, height: 360 }),
      Vimeo,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "yh-prose min-h-[320px] px-4 py-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) {
    return (
      <div className="rounded-xl border-2 border-ink bg-cream p-4 text-ink/50">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border-2 border-ink bg-cream">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
