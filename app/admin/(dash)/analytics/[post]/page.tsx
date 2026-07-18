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
  const postDoc = await getPostBySlug(slug);
  const detail = await getIssueDetail(slug, postDoc?.emailRecipients);
  if (!detail) notFound();
  const title = postDoc?.title || slug;

  return (
    <div>
      <Link href="/admin/analytics" className="font-mono text-xs uppercase tracking-wide text-purple hover:text-pink">
        ← All analytics
      </Link>
      <h1 className="font-heading mt-3 text-2xl text-ink">{title}</h1>
      <p className="font-mono mb-6 text-sm text-ink/50">Sent {fmtDate(detail.sentAt)}</p>

      {/* Delivery accounting first — accepted vs delivered vs bounced vs still
          confirming, so a gap between "sent to N" and "delivered" is legible. */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {detail.accepted != null && <Stat label="accepted" value={detail.accepted} />}
        <Stat label="delivered" value={detail.delivered} />
        <Stat label="bounced" value={detail.bounced.length} sub="auto-suppressed" />
        {detail.accepted != null && (
          <Stat label="confirming" value={detail.pending} sub="usually clears in hours" />
        )}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="opened" value={detail.opened.length} sub={`${detail.openRate}%`} />
        <Stat label="not opened" value={detail.notOpened.length} />
        <Stat label="clicked" value={detail.clickers.length} sub={`${detail.clickRate}%`} />
        <Stat label="total clicks" value={detail.totalClicks} />
        <Stat label="clicks / recipient" value={detail.avgClicksPerRecipient} />
        <Stat
          label="unsubscribed"
          value={detail.unsubscribed.length}
          sub={detail.delivered ? `${Math.round((detail.unsubscribed.length / detail.delivered) * 100)}%` : undefined}
        />
      </div>

      {detail.unsubscribed.length > 0 && (
        <section className="mb-8">
          <h2 className="font-heading mb-3 text-lg text-ink">
            Unsubscribed{" "}
            <span className="font-mono text-sm text-ink/50">({detail.unsubscribed.length})</span>
          </h2>
          <p className="font-mono mb-2 text-[11px] text-ink/40">
            Opted out from this issue. A clean opt-out is far better for your sending
            reputation than a spam complaint.
          </p>
          <ul className="flex flex-col gap-1 rounded-2xl border-2 border-ink/30 bg-cream p-4 font-mono text-sm text-ink/60">
            {detail.unsubscribed.map((e) => (
              <li key={e} className="truncate">{e}</li>
            ))}
          </ul>
        </section>
      )}

      {detail.bounced.length > 0 && (
        <section className="mb-8">
          <h2 className="font-heading mb-3 text-lg text-ink">
            Bounced <span className="font-mono text-sm text-ink/50">({detail.bounced.length})</span>
          </h2>
          <p className="font-mono mb-2 text-[11px] text-ink/40">
            Dead addresses. Already flagged so future sends skip them.
          </p>
          <ul className="flex flex-col gap-1 rounded-2xl border-2 border-orange/50 bg-orange/5 p-4 font-mono text-sm text-ink/70">
            {detail.bounced.map((e) => (
              <li key={e} className="truncate">{e}</li>
            ))}
          </ul>
        </section>
      )}

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
