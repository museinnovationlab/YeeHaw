"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePostAction } from "@/app/admin/(dash)/posts/actions";

export default function DeletePostButton({
  id,
  slug,
  title,
  redirectTo,
  className,
  label = "Delete",
}: {
  id: string;
  slug?: string;
  title?: string;
  /** where to go after deleting; if omitted, just refreshes the current view */
  redirectTo?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!window.confirm(`Delete "${title || "untitled"}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deletePostAction(id, slug);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      className={
        className ??
        "font-mono rounded-full border-2 border-ink/60 bg-cream px-2 py-0.5 text-[10px] uppercase hover:bg-pink hover:text-cream disabled:opacity-50"
      }
    >
      {pending ? "…" : label}
    </button>
  );
}
