"use client";

import { useState } from "react";

/**
 * Newsletter signup. Posts to /api/subscribe, which lands the email in
 * Firestore (idempotent — re-subscribing the same address is a no-op).
 */
export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(
          b.error === "invalid_email"
            ? "That email doesn't look right."
            : "Something went wrong — try again?"
        );
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again?");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="font-mono text-ink/90">
        🤠 You&apos;re on the list. Keep an eye on your inbox for the next mixtape.
      </p>
    );
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="font-mono w-full rounded-full border-2 border-ink bg-cream px-5 py-3 text-ink outline-none placeholder:text-ink/40 focus:ring-4 focus:ring-purple/40"
        />
        <button
          type="submit"
          disabled={busy}
          className="font-heading yh-shadow-sm whitespace-nowrap rounded-full border-2 border-ink bg-pink px-6 py-3 text-cream transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
        >
          {busy ? "…" : "Press Play ▶"}
        </button>
      </form>
      {error && <p className="font-mono mt-2 text-sm text-pink">{error}</p>}
    </div>
  );
}
