"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStashAction,
  deleteStashAction,
  toggleStashUsedAction,
} from "@/app/admin/(dash)/stash/actions";
import type { StashItem } from "@/lib/types";

export default function StashManager({ items }: { items: StashItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [showUsed, setShowUsed] = useState(false);

  const unused = items.filter((i) => !i.used);
  const used = items.filter((i) => i.used);

  function add() {
    if (!draft.trim()) return;
    startTransition(async () => {
      await addStashAction(draft);
      setDraft("");
      router.refresh();
    });
  }
  function toggle(id: string, nextUsed: boolean) {
    startTransition(async () => {
      await toggleStashUsedAction(id, nextUsed);
      router.refresh();
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      await deleteStashAction(id);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* add box */}
      <div className="h-fit rounded-2xl border-2 border-ink bg-cream p-4">
        <h2 className="font-heading text-lg text-ink">Add to stash</h2>
        <p className="font-mono mt-1 text-[11px] text-ink/50">
          One idea per line — a link plus a quick note. Paste as many as you want.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          placeholder={"Repo Man (1984) https://imdb.com/...  weird punk classic\nThat olive oil https://...  splurge, worth it\n..."}
          className="font-mono mt-3 w-full rounded-lg border-2 border-ink bg-cream px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-purple/40"
        />
        <button
          onClick={add}
          disabled={pending || !draft.trim()}
          className="font-heading yh-shadow-sm mt-3 w-full rounded-full border-2 border-ink bg-purple px-4 py-2.5 text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {pending ? "…" : "Add to stash"}
        </button>
      </div>

      {/* list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg text-ink">
            Stash <span className="font-mono text-sm text-ink/50">({unused.length} unused)</span>
          </h2>
          {used.length > 0 && (
            <button
              onClick={() => setShowUsed((v) => !v)}
              className="font-mono text-xs uppercase tracking-wide text-ink/50 hover:text-purple"
            >
              {showUsed ? "hide" : "show"} used ({used.length})
            </button>
          )}
        </div>

        {unused.length === 0 && (
          <p className="font-mono rounded-xl border-2 border-dashed border-ink/20 p-6 text-center text-sm text-ink/40">
            Nothing stashed yet. Add ideas on the left, then import them into a post&apos;s AI box.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {unused.map((i) => (
            <li
              key={i.id}
              className="yh-shadow-sm flex items-start gap-3 rounded-xl border-2 border-ink bg-cream p-3"
            >
              <p className="flex-1 break-words text-sm text-ink">{i.text}</p>
              <button
                onClick={() => toggle(i.id, true)}
                title="Mark used"
                className="font-mono shrink-0 rounded-full border-2 border-ink bg-cream px-2 py-0.5 text-[10px] uppercase hover:bg-mint"
              >
                ✓ used
              </button>
              <button
                onClick={() => remove(i.id)}
                title="Delete"
                className="font-mono shrink-0 rounded-full border-2 border-ink bg-cream px-2 py-0.5 text-[10px] uppercase hover:bg-pink hover:text-cream"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        {showUsed && used.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2 opacity-60">
            {used.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-3 rounded-xl border-2 border-ink/30 bg-cream p-3"
              >
                <p className="flex-1 break-words text-sm text-ink/60 line-through">{i.text}</p>
                <button
                  onClick={() => toggle(i.id, false)}
                  className="font-mono shrink-0 rounded-full border-2 border-ink/40 px-2 py-0.5 text-[10px] uppercase hover:bg-yellow"
                >
                  restore
                </button>
                <button
                  onClick={() => remove(i.id)}
                  className="font-mono shrink-0 rounded-full border-2 border-ink/40 px-2 py-0.5 text-[10px] uppercase hover:bg-pink hover:text-cream"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
