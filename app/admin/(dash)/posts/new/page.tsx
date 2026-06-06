import PostEditor from "@/components/admin/PostEditor";

export const dynamic = "force-dynamic";

export default function NewPostPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <a href="/admin" className="font-mono text-xs uppercase tracking-wide text-ink/50 hover:text-purple">
          ← Control Room
        </a>
        <h1 className="font-heading text-2xl text-ink">New Post</h1>
      </div>
      <PostEditor post={null} />
    </div>
  );
}
