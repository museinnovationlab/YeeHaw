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
  // Honeypot — hidden from people, filled in by naive bots. See /api/subscribe.
  const [website, setWebsite] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(
          b.error === "invalid_email"
            ? "That email doesn't look right."
            : b.error === "rate_limited"
              ? "That's a lot of signups from one place. Try again in a bit."
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
        🤠 You&apos;re on the list! Check your inbox — we just sent a welcome note.
        (Peek in spam/Promotions if it&apos;s not there in a minute.)
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
        {/* Honeypot. aria-hidden + tabIndex -1 keeps it away from screen readers
            and keyboard users; only a bot filling every field will touch it. */}
        <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Leave this field empty</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
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
