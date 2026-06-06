"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.replace("/admin/login");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="font-mono rounded-full border border-cream/40 px-3 py-1 text-xs uppercase tracking-wide text-cream/80 transition-colors hover:border-yellow hover:text-yellow"
    >
      Sign out
    </button>
  );
}
