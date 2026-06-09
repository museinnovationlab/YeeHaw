import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import SignOutButton from "@/components/admin/SignOutButton";

// Admin is always per-request (auth via session cookie); never statically cached.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // If Firebase isn't set up yet, send to login (which explains what to add).
  if (!isFirebaseAdminConfigured) redirect("/admin/login");

  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="min-h-screen">
      <header className="border-b-4 border-ink bg-ink text-cream">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <a href="/admin" className="font-heading text-lg text-yellow">
            YeeHaw · Control Room
          </a>
          <div className="flex items-center gap-4">
            <a
              href="/admin/stash"
              className="font-mono text-xs uppercase tracking-wide text-cream/70 hover:text-yellow"
            >
              Stash
            </a>
            <a
              href="/"
              className="font-mono text-xs uppercase tracking-wide text-cream/70 hover:text-yellow"
            >
              View site ↗
            </a>
            <span className="font-mono hidden text-xs text-cream/50 sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
