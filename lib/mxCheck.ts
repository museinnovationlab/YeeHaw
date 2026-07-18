import "server-only";

/**
 * Domain deliverability check via DNS-over-HTTPS.
 *
 * Uses DoH rather than node:dns because it behaves identically everywhere
 * (local, serverless, sandbox) and needs no UDP. Google is primary with
 * Cloudflare as a fallback, so one resolver being unreachable doesn't produce a
 * false "dead domain" verdict — the difference between "definitely broken" and
 * "couldn't tell" matters a lot when the output is a suppression suggestion.
 */

export type DomainVerdict =
  | "ok" // has MX records
  | "a_fallback" // no MX but has an A record — RFC 5321 implicit MX, usually junk
  | "dead" // domain doesn't resolve at all
  | "unknown"; // lookup failed; treat as inconclusive, never as dead

export interface DomainCheck {
  domain: string;
  verdict: DomainVerdict;
  mx: string[];
  detail: string;
}

const GOOGLE = "https://dns.google/resolve";
const CLOUDFLARE = "https://1.1.1.1/dns-query";

async function query(
  domain: string,
  type: "MX" | "A"
): Promise<{ status: number; answers: string[] } | null> {
  for (const base of [GOOGLE, CLOUDFLARE]) {
    try {
      const res = await fetch(`${base}?name=${encodeURIComponent(domain)}&type=${type}`, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        Status?: number;
        Answer?: { data?: string; type?: number }[];
      };
      return {
        status: data.Status ?? 0,
        answers: (data.Answer ?? []).map((a) => String(a.data ?? "")).filter(Boolean),
      };
    } catch {
      // try the next resolver
    }
  }
  return null;
}

/** Check one domain. Never throws — an unreachable resolver yields "unknown". */
export async function checkDomain(domain: string): Promise<DomainCheck> {
  const d = domain.trim().toLowerCase();
  const mx = await query(d, "MX");
  if (!mx) return { domain: d, verdict: "unknown", mx: [], detail: "DNS lookup failed" };

  // NXDOMAIN (3) means the domain itself doesn't exist.
  if (mx.status === 3) {
    return { domain: d, verdict: "dead", mx: [], detail: "domain does not exist" };
  }
  if (mx.answers.length) {
    return {
      domain: d,
      verdict: "ok",
      mx: mx.answers.slice(0, 3),
      detail: `${mx.answers.length} MX record${mx.answers.length === 1 ? "" : "s"}`,
    };
  }

  // No MX. Senders fall back to the A record as an implicit mail host, which is
  // how these end up in deferral loops instead of bouncing cleanly.
  const a = await query(d, "A");
  if (!a) return { domain: d, verdict: "unknown", mx: [], detail: "DNS lookup failed" };
  if (a.answers.length) {
    return {
      domain: d,
      verdict: "a_fallback",
      mx: [],
      detail: "no MX; mail would fall back to the website's IP",
    };
  }
  return { domain: d, verdict: "dead", mx: [], detail: "no MX and no A record" };
}

/** Check many domains with bounded concurrency, de-duplicated. */
export async function checkDomains(domains: string[]): Promise<Map<string, DomainCheck>> {
  const unique = [...new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, DomainCheck>();
  const CONCURRENCY = 8;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const slice = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map((d) => checkDomain(d)));
    results.forEach((r) => out.set(r.domain, r));
  }
  return out;
}
