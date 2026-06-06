"use client";

import { useState } from "react";

/**
 * Newsletter signup. UI is complete; the submit handler is a stub until the
 * subscribe API + Firestore land (Phase 4). Keeps the "Press Play" brand CTA.
 */
export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    // TODO(phase4): POST /api/subscribe -> Firestore + double-opt-in
    setDone(true);
  }

  if (done) {
    return (
      <p className="font-mono text-ink/90">
        🤠 You&apos;re on the list. Keep an eye on your inbox for the next mixtape.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-3 sm:flex-row"
    >
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
        className="font-heading yh-shadow-sm whitespace-nowrap rounded-full border-2 border-ink bg-pink px-6 py-3 text-cream transition-transform hover:-translate-y-0.5 active:translate-y-0"
      >
        Press Play ▶
      </button>
    </form>
  );
}
