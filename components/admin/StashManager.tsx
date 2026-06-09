"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStashAction,
  deleteStashAction,
  setStashStatusAction,
} from "@/app/admin/(dash)/stash/actions";
import type { StashItem, StashStatus } from "@/lib/types";

function Pill({
  onClick,
  children,
  tone = "plain",
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "plain" | "good" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "hover:bg-mint"
      : tone === "bad"
        ? "hover:bg-pink hover:text-cream"
        : "hover:bg-yellow";
  return (
    <button
      onClick={onClick}
      className={`font-mono shrink-0 rounded-full border-2 border-ink/60 bg-cream px-2 py-0.5 text-[10px] uppercase ${toneCls}`}
    >
      {children}
    </button>
  );
}

export default function StashManager({ items }: { items: StashItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [showUsed, setShowUsed] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  const active = items.filter((i) => i.status === "active");
  const used = items.filter((i) => i.status === "used");
  const removed = items.filter((i) => i.status === "removed");

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  function add() {
    if (!draft.trim()) return;
    run(async () => {
      await addStashAction(draft);
      setDraft("");
    });
  }
  const setStatus = (id: string, status: StashStatus) => run(() => setStashStatusAction(id, status));
  const remove = (id: string) => run(() => deleteStashAction(id));

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

      {/* lists */}
      <div>
        <h2 className="font-heading mb-3 text-lg text-ink">
          Active <span className="font-mono text-sm text-ink/50">({active.length})</span>
        </h2>

        {active.length === 0 && (
          <p className="font-mono rounded-xl border-2 border-dashed border-ink/20 p-6 text-center text-sm text-ink/40">
            Nothing active. Add ideas on the left, then import them into a post&apos;s AI box.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {active.map((i) => (
            <li
              key={i.id}
              className="yh-shadow-sm flex items-start gap-3 rounded-xl border-2 border-ink bg-cream p-3"
            >
              <p className="flex-1 break-words text-sm text-ink">{i.text}</p>
              <Pill onClick={() => setStatus(i.id, "used")} tone="good">✓ used</Pill>
              <Pill onClick={() => setStatus(i.id, "removed")} tone="bad">✕</Pill>
            </li>
          ))}
        </ul>

        {/* Used */}
        {used.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowUsed((v) => !v)}
              className="font-mono text-xs uppercase tracking-wide text-ink/50 hover:text-purple"
            >
              {showUsed ? "▾" : "▸"} Used ({used.length})
            </button>
            {showUsed && (
              <ul className="mt-2 flex flex-col gap-2 opacity-70">
                {used.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 rounded-xl border-2 border-ink/30 bg-cream p-3">
                    <p className="flex-1 break-words text-sm text-ink/60 line-through">{i.text}</p>
                    <Pill onClick={() => setStatus(i.id, "active")}>restore</Pill>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Removed */}
        {removed.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowRemoved((v) => !v)}
              className="font-mono text-xs uppercase tracking-wide text-ink/50 hover:text-pink"
            >
              {showRemoved ? "▾" : "▸"} Removed ({removed.length})
            </button>
            {showRemoved && (
              <ul className="mt-2 flex flex-col gap-2 opacity-70">
                {removed.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 rounded-xl border-2 border-dashed border-ink/30 bg-cream p-3">
                    <p className="flex-1 break-words text-sm text-ink/50 line-through">{i.text}</p>
                    <Pill onClick={() => setStatus(i.id, "active")} tone="good">restore</Pill>
                    <Pill onClick={() => remove(i.id)} tone="bad">delete forever</Pill>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
