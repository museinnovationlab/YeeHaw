"use client";

import { useState, useTransition } from "react";
import { unsubscribeAction, resubscribeAction } from "@/app/unsubscribe/actions";

export default function UnsubscribeConfirm({
  email,
  token,
  post,
}: {
  email: string;
  token: string;
  /** which issue this link came from — attribution only */
  post?: string;
}) {
  const [state, setState] = useState<"idle" | "unsubscribed" | "resubscribed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>, next: "unsubscribed" | "resubscribed") =>
    start(async () => {
      setError(null);
      try {
        await fn();
        setState(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });

  if (state === "unsubscribed") {
    return (
      <div>
        <p className="text-ink">
          You&apos;ve been unsubscribed. <span className="font-mono text-sm text-ink/60">{email}</span> won&apos;t
          get any more YeeHaw.
        </p>
        <p className="mt-4 font-mono text-sm text-ink/60">Changed your mind?</p>
        <button
          onClick={() => run(() => resubscribeAction(email, token), "resubscribed")}
          disabled={pending}
          className="font-heading yh-shadow-sm mt-2 rounded-full border-2 border-ink bg-mint px-5 py-2.5 text-ink transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {pending ? "…" : "Resubscribe"}
        </button>
        {error && <p className="mt-3 text-sm text-pink">{error}</p>}
      </div>
    );
  }

  if (state === "resubscribed") {
    return <p className="text-ink">🎉 You&apos;re back on the list. See you Saturday.</p>;
  }

  return (
    <div>
      <p className="text-ink">
        Unsubscribe <span className="font-mono text-sm text-ink/70">{email}</span> from YeeHaw?
      </p>
      <button
        onClick={() => run(() => unsubscribeAction(email, token, post), "unsubscribed")}
        disabled={pending}
        className="font-heading yh-shadow-sm mt-4 rounded-full border-2 border-ink bg-pink px-6 py-3 text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
      >
        {pending ? "…" : "Unsubscribe"}
      </button>
      {error && <p className="mt-3 text-sm text-pink">{error}</p>}
    </div>
  );
}
