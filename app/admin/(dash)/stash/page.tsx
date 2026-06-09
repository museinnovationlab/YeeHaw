import StashManager from "@/components/admin/StashManager";
import { getAllStash } from "@/lib/repo/stash";

export const dynamic = "force-dynamic";

export default async function StashPage() {
  const items = await getAllStash();
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <a href="/admin" className="font-mono text-xs uppercase tracking-wide text-ink/50 hover:text-purple">
          ← Control Room
        </a>
        <h1 className="font-heading text-2xl text-ink">The Stash</h1>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-ink/70">
        Your running list of things to recommend someday. Dump links and notes here,
        then pull them into a post from the editor&apos;s <strong>Generate with AI</strong> box —
        importing crosses them off automatically.
      </p>
      <StashManager items={items} />
    </div>
  );
}
