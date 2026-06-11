import { getAllPosts } from "@/lib/repo/posts";
import { formatDateLong } from "@/lib/format";
import type { PostStatus } from "@/lib/types";
import DeletePostButton from "@/components/admin/DeletePostButton";

const STATUS_STYLES: Record<PostStatus, string> = {
  idea: "bg-ink/10 text-ink",
  draft: "bg-yellow text-ink",
  reviewed: "bg-cyan text-ink",
  scheduled: "bg-purple text-cream",
  published: "bg-mint text-ink",
  archived: "bg-ink/20 text-ink/60",
};

export default async function Dashboard() {
  const posts = await getAllPosts();
  const counts = posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl text-ink">Control Room</h1>
        <a
          href="/admin/posts/new"
          className="font-heading yh-shadow-sm rounded-full border-2 border-ink bg-pink px-5 py-2.5 text-cream transition-transform hover:-translate-y-0.5"
        >
          + New Post
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(["idea", "draft", "reviewed", "scheduled", "published", "archived"] as PostStatus[]).map(
          (s) => (
            <div
              key={s}
              className="rounded-xl border-2 border-ink bg-cream p-4 text-center"
            >
              <div className="font-heading text-2xl text-ink">{counts[s] ?? 0}</div>
              <div className="font-mono text-[10px] uppercase tracking-wide text-ink/50">
                {s}
              </div>
            </div>
          )
        )}
      </div>

      <h2 className="font-heading mt-10 text-xl text-ink">Recent posts</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border-2 border-ink">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink text-cream">
            <tr>
              <th className="px-4 py-2 font-mono text-xs uppercase">Title</th>
              <th className="px-4 py-2 font-mono text-xs uppercase">Type</th>
              <th className="px-4 py-2 font-mono text-xs uppercase">Status</th>
              <th className="px-4 py-2 font-mono text-xs uppercase">Updated</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink/50">
                  No posts yet. Hit “New Post” to start your first mixtape.
                </td>
              </tr>
            )}
            {posts.map((p) => (
              <tr key={p.id} className="border-t border-ink/10 bg-cream">
                <td className="px-4 py-3">
                  <a
                    href={`/admin/posts/${p.id}`}
                    className="font-medium text-ink hover:text-purple"
                  >
                    {p.title || "(untitled)"}
                  </a>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink/60">
                  {p.postType}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`font-mono rounded-full px-2 py-0.5 text-[10px] uppercase ${STATUS_STYLES[p.status]}`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink/50">
                  {formatDateLong(p.updatedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeletePostButton id={p.id} slug={p.slug} title={p.title} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono mt-6 text-xs text-ink/40">
        The post editor, AI drafting, and publishing flow land next. This shell
        is live and reads straight from Firestore.
      </p>
    </div>
  );
}
