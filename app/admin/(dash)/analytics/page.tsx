import Link from "next/link";
import { getEmailReport } from "@/lib/repo/emailEvents";
import { getAllPosts } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border-2 border-ink bg-cream px-4 py-3 text-center">
      <div className="font-heading text-2xl text-ink">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-ink/50">{label}</div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const [report, posts] = await Promise.all([getEmailReport(), getAllPosts()]);
  const titleBySlug = new Map(posts.map((p) => [p.slug, p.title]));
  const o = report.overall;

  return (
    <div>
      <h1 className="font-heading mb-1 text-2xl text-ink">Email analytics</h1>
      <p className="font-mono mb-6 text-sm text-ink/50">
        Across all sends. Click rate is the trustworthy signal — open rate is inflated by Apple Mail
        Privacy.
      </p>

      {report.issues.length === 0 ? (
        <p className="font-mono rounded-xl border-2 border-dashed border-ink/20 p-6 text-center text-sm text-ink/40">
          No email events yet. Send an issue and opens/clicks will show up here.
        </p>
      ) : (
        <>
          {/* all-time roll-up */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="issues" value={o.issues} />
            <Stat label="recipients" value={o.recipients} />
            <Stat label="open rate" value={`${o.openRate}%`} />
            <Stat label="click rate" value={`${o.clickRate}%`} />
            <Stat label="clicks / issue" value={o.avgClicksPerIssue} />
            <Stat label="unsubscribes" value={`${o.unsubscribed} (${o.unsubRate}%)`} />
          </div>

          {/* one row per send */}
          <h2 className="font-heading mb-3 text-lg text-ink">Sends</h2>
          <div className="overflow-hidden rounded-2xl border-2 border-ink">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink text-cream">
                <tr>
                  <th className="px-4 py-2 font-mono text-xs uppercase">Issue</th>
                  <th className="px-4 py-2 font-mono text-xs uppercase">Sent</th>
                  <th className="px-4 py-2 text-right font-mono text-xs uppercase">Sent to</th>
                  <th className="px-4 py-2 text-right font-mono text-xs uppercase">Opens</th>
                  <th className="px-4 py-2 text-right font-mono text-xs uppercase">Clicks</th>
                  <th className="px-4 py-2 text-right font-mono text-xs uppercase">Unsubs</th>
                </tr>
              </thead>
              <tbody>
                {report.issues.map((s) => (
                  <tr key={s.post} className="border-t border-ink/10 bg-cream hover:bg-yellow/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/analytics/${encodeURIComponent(s.post)}`}
                        className="font-medium text-ink hover:text-purple"
                      >
                        {titleBySlug.get(s.post) || s.post}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink/50">{fmtDate(s.sentAt)}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink/70">{s.delivered}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink/70">
                      {s.opened}{" "}
                      <span className="text-ink/40">({s.delivered ? Math.round((s.opened / s.delivered) * 100) : 0}%)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-purple">
                      {s.clicked}{" "}
                      <span className="text-ink/40">({s.delivered ? Math.round((s.clicked / s.delivered) * 100) : 0}%)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink/60">
                      {s.unsubscribed}{" "}
                      <span className="text-ink/40">({s.delivered ? Math.round((s.unsubscribed / s.delivered) * 100) : 0}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
