"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  importSubscribersAction,
  setSubscriberStatusAction,
  deleteSubscriberAction,
} from "@/app/admin/(dash)/subscribers/actions";
import type { Subscriber } from "@/lib/types";

function csvEscape(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function SubscribersManager({
  subscribers,
  counts,
}: {
  subscribers: Subscriber[];
  counts: { subscribed: number; unsubscribed: number; total: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [paste, setPaste] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [showUnsub, setShowUnsub] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  function doImport() {
    if (!paste.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await importSubscribersAction(paste);
      setResult(
        `Imported ${r.added} new · ${r.skipped} already on the list · ${r.invalid} invalid (of ${r.parsed} parsed).`
      );
      setPaste("");
      router.refresh();
    });
  }

  function exportCsv() {
    const rows = [
      ["email", "name", "status", "source", "createdAt"],
      ...subscribers.map((s) => [s.email, s.name ?? "", s.status, s.source, s.createdAt]),
    ];
    const csv = rows.map((r) => r.map((c) => csvEscape(String(c))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "yeehaw-subscribers.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const active = subscribers.filter((s) => s.status === "subscribed");
  const unsub = subscribers.filter((s) => s.status !== "subscribed");

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* import box */}
      <div className="h-fit rounded-2xl border-2 border-ink bg-cream p-4">
        <h2 className="font-heading text-lg text-ink">Import subscribers</h2>
        <p className="font-mono mt-1 text-[11px] text-ink/50">
          Paste emails (one per line) or CSV — &quot;email, name&quot; or a full export.
          Already-subscribed addresses are skipped automatically.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={8}
          placeholder={"jane@example.com\njohn@example.com, John Doe\n..."}
          className="font-mono mt-3 w-full rounded-lg border-2 border-ink bg-cream px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-purple/40"
        />
        <button
          onClick={doImport}
          disabled={pending || !paste.trim()}
          className="font-heading yh-shadow-sm mt-3 w-full rounded-full border-2 border-ink bg-purple px-4 py-2.5 text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {pending ? "…" : "Import"}
        </button>
        {result && <p className="font-mono mt-2 text-xs text-ink/70">{result}</p>}
      </div>

      {/* list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg text-ink">
            Subscribed{" "}
            <span className="font-mono text-sm text-ink/50">({counts.subscribed})</span>
          </h2>
          {subscribers.length > 0 && (
            <button
              onClick={exportCsv}
              className="font-mono rounded-full border-2 border-ink/60 bg-cream px-3 py-1 text-[11px] uppercase hover:bg-yellow"
            >
              Export CSV
            </button>
          )}
        </div>

        {active.length === 0 && (
          <p className="font-mono rounded-xl border-2 border-dashed border-ink/20 p-6 text-center text-sm text-ink/40">
            No subscribers yet. Import your list on the left, or wait for signups.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {active.map((s) => (
            <li
              key={s.id}
              className="yh-shadow-sm flex items-center gap-3 rounded-xl border-2 border-ink bg-cream p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{s.email}</p>
                {s.name && <p className="font-mono truncate text-[11px] text-ink/50">{s.name}</p>}
              </div>
              <span className="font-mono shrink-0 text-[10px] uppercase text-ink/40">{s.source}</span>
              <button
                onClick={() => run(() => setSubscriberStatusAction(s.email, "unsubscribed"))}
                className="font-mono shrink-0 rounded-full border-2 border-ink/60 bg-cream px-2 py-0.5 text-[10px] uppercase hover:bg-pink hover:text-cream"
              >
                unsub
              </button>
            </li>
          ))}
        </ul>

        {unsub.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowUnsub((v) => !v)}
              className="font-mono text-xs uppercase tracking-wide text-ink/50 hover:text-pink"
            >
              {showUnsub ? "▾" : "▸"} Unsubscribed ({unsub.length})
            </button>
            {showUnsub && (
              <ul className="mt-2 flex flex-col gap-2 opacity-70">
                {unsub.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-xl border-2 border-ink/30 bg-cream p-3"
                  >
                    <p className="min-w-0 flex-1 truncate text-sm text-ink/60 line-through">
                      {s.email}
                    </p>
                    <button
                      onClick={() => run(() => setSubscriberStatusAction(s.email, "subscribed"))}
                      className="font-mono shrink-0 rounded-full border-2 border-ink/60 bg-cream px-2 py-0.5 text-[10px] uppercase hover:bg-mint"
                    >
                      resubscribe
                    </button>
                    <button
                      onClick={() => run(() => deleteSubscriberAction(s.email))}
                      className="font-mono shrink-0 rounded-full border-2 border-ink/60 bg-cream px-2 py-0.5 text-[10px] uppercase hover:bg-pink hover:text-cream"
                    >
                      delete
                    </button>
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
