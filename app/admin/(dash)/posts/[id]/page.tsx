import { notFound } from "next/navigation";
import PostEditor from "@/components/admin/PostEditor";
import { getPostById } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <a href="/admin" className="font-mono text-xs uppercase tracking-wide text-ink/50 hover:text-purple">
          ← Control Room
        </a>
        <h1 className="font-heading text-2xl text-ink">Edit Post</h1>
      </div>
      <PostEditor post={post} />
    </div>
  );
}
