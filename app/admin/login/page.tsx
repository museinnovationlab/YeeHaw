"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase/client";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        password
      );
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error === "not_authorized"
            ? "That account isn't an admin."
            : "Sign-in failed."
        );
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="yh-shadow w-full max-w-sm rounded-2xl border-2 border-ink bg-cream p-8">
        <h1 className="font-heading text-2xl text-ink">Admin · Press Play</h1>
        <p className="font-mono mt-1 text-xs uppercase tracking-wide text-ink/50">
          YeeHaw control room
        </p>

        {!isFirebaseClientConfigured && (
          <p className="mt-4 rounded-lg border-2 border-orange bg-orange/10 p-3 text-sm text-ink">
            Firebase isn&apos;t configured yet. Add your{" "}
            <code className="font-mono">NEXT_PUBLIC_FIREBASE_*</code> keys to{" "}
            <code className="font-mono">.env.local</code>.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="font-mono rounded-full border-2 border-ink bg-cream px-4 py-2.5 text-ink outline-none focus:ring-4 focus:ring-purple/40"
          />
          <input
            type="password"
            required
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="font-mono rounded-full border-2 border-ink bg-cream px-4 py-2.5 text-ink outline-none focus:ring-4 focus:ring-purple/40"
          />
          {error && <p className="text-sm text-pink">{error}</p>}
          <button
            type="submit"
            disabled={busy || !isFirebaseClientConfigured}
            className="font-heading yh-shadow-sm mt-1 rounded-full border-2 border-ink bg-purple px-6 py-3 text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {busy ? "..." : "Press Play ▶"}
          </button>
        </form>
      </div>
    </main>
  );
}
