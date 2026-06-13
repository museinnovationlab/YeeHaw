import Link from "next/link";
import { notFound } from "next/navigation";
import { getIssueDetail } from "@/lib/repo/emailEvents";
import { getPostBySlug } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Tidy a long URL for display: drop protocol/www, cap length.
function prettyLink(url: string): string {
  const stripped = url.replace(/^https?:\/\/(www\.)?/, "");
  return stripped.length > 60 ? stripped.slice(0, 57) + "…" : stripped;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border-2 border-ink bg-cream px-4 py-3 text-center">
      <div className="font-heading text-2xl text-ink">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-ink/50">{label}</div>
      {sub && <div className="font-mono text-[10px] text-ink/40">{sub}</div>}
    </div>
  );
}

export default async function IssueAnalyticsPage({
  params,
}: {
  params: Promise<{ post: string }>;
}) {
  const { post } = await params;
  const slug = decodeURIComponent(post);
  const detail = await getIssueDetail(slug);
  if (!detail) notFound();
  const postDoc = await getPostBySlug(slug);
  const title = postDoc?.title || slug;

  return (
    <div>
      <Link href="/admin/analytics" className="font-mono text-xs uppercase tracking-wide text-purple hover:text-pink">
        ← All analytics
      </Link>
      <h1 className="font-heading mt-3 text-2xl text-ink">{title}</h1>
      <p className="font-mono mb-6 text-sm text-ink/50">Sent {fmtDate(detail.sentAt)}</p>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="sent to" value={detail.delivered} />
        <Stat label="opened" value={detail.opened.length} sub={`${detail.openRate}%`} />
        <Stat label="not opened" value={detail.notOpened.length} />
        <Stat label="clicked" value={detail.clickers.length} sub={`${detail.clickRate}%`} />
        <Stat label="total clicks" value={detail.totalClicks} />
        <Stat label="clicks / recipient" value={detail.avgClicksPerRecipient} />
      </div>

      {/* top links */}
      {detail.topLinks.length > 0 && (
        <section className="mb-8">
          <h2 className="font-heading mb-3 text-lg text-ink">Top-clicked links</h2>
          <ul className="flex flex-col gap-1 rounded-2xl border-2 border-ink bg-cream p-4">
            {detail.topLinks.map((l) => (
              <li key={l.link} className="flex items-center justify-between gap-3 text-sm">
                <a href={l.link} target="_blank" rel="noreferrer" className="truncate text-ink/80 hover:text-purple">
                  {prettyLink(l.link)}
                </a>
                <span className="font-mono shrink-0 text-purple">{l.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* who clicked what */}
      {detail.clickers.length > 0 && (
        <section className="mb-8">
          <h2 className="font-heading mb-3 text-lg text-ink">Who clicked what</h2>
          <div className="flex flex-col gap-3">
            {detail.clickers.map((c) => (
              <div key={c.recipient} className="rounded-xl border-2 border-ink bg-cream p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{c.recipient}</span>
                  <span className="font-mono text-[10px] uppercase text-ink/50">
                    {c.opened ? "opened · " : ""}
                    {c.clicks} click{c.clicks === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1 border-t border-ink/10 pt-2">
                  {c.links.map((l) => (
                    <li key={l.link} className="flex items-center justify-between gap-3 text-sm">
                      <a href={l.link} target="_blank" rel="noreferrer" className="truncate text-ink/70 hover:text-purple">
                        {prettyLink(l.link)}
                      </a>
                      {l.count > 1 && <span className="font-mono shrink-0 text-ink/40">×{l.count}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* recipient lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="font-heading mb-3 text-lg text-ink">
            Opened <span className="font-mono text-sm text-ink/50">({detail.opened.length})</span>
          </h2>
          {detail.opened.length === 0 ? (
            <p className="font-mono text-sm text-ink/40">No opens recorded.</p>
          ) : (
            <ul className="flex flex-col gap-1 rounded-2xl border-2 border-ink bg-cream p-4 font-mono text-sm text-ink/80">
              {detail.opened.map((e) => (
                <li key={e} className="truncate">{e}</li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="font-heading mb-3 text-lg text-ink">
            Not opened <span className="font-mono text-sm text-ink/50">({detail.notOpened.length})</span>
          </h2>
          {detail.notOpened.length === 0 ? (
            <p className="font-mono text-sm text-ink/40">Everyone opened it.</p>
          ) : (
            <ul className="flex flex-col gap-1 rounded-2xl border-2 border-dashed border-ink/30 bg-cream p-4 font-mono text-sm text-ink/60">
              {detail.notOpened.map((e) => (
                <li key={e} className="truncate">{e}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
