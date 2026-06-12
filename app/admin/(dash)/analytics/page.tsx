import { getEmailStatsByPost } from "@/lib/repo/emailEvents";

export const dynamic = "force-dynamic";

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export default async function AnalyticsPage() {
  const stats = await getEmailStatsByPost();

  return (
    <div>
      <h1 className="font-heading mb-1 text-2xl text-ink">Email analytics</h1>
      <p className="font-mono mb-6 text-sm text-ink/50">
        Per issue, from Resend webhooks. Click rate is the trustworthy signal — open rate is
        inflated by Apple Mail Privacy.
      </p>

      {stats.length === 0 ? (
        <p className="font-mono rounded-xl border-2 border-dashed border-ink/20 p-6 text-center text-sm text-ink/40">
          No email events yet. Once the Resend webhook is connected and you send an issue, opens and
          clicks show up here.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {stats.map((s) => (
            <div key={s.post} className="rounded-2xl border-2 border-ink bg-cream p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-heading text-lg text-ink">{s.post}</h2>
                <div className="font-mono flex gap-4 text-xs text-ink/60">
                  <span>{s.delivered} delivered</span>
                  <span>
                    {s.opens} opens <span className="text-ink/40">({pct(s.opens, s.delivered)})</span>
                  </span>
                  <span className="text-purple">
                    {s.clicks} clicked <span className="text-ink/40">({pct(s.clicks, s.delivered)})</span>
                  </span>
                </div>
              </div>

              {s.topLinks.length > 0 && (
                <div className="mt-3 border-t border-ink/10 pt-3">
                  <p className="font-mono mb-2 text-[10px] uppercase tracking-wide text-ink/50">
                    Top-clicked links
                  </p>
                  <ul className="flex flex-col gap-1">
                    {s.topLinks.map((l) => (
                      <li key={l.link} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-ink/80">{l.link}</span>
                        <span className="font-mono shrink-0 text-purple">{l.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
