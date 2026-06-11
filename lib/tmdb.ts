import "server-only";
import { eventsInWindow, type MarqueeEvent } from "@/lib/sportsEvents";

// "What to Watch This Weekend" data, from TMDb (free API, US region).
// Strategy: TMDb has no perfect "new on streaming this weekend" feed, so we
// blend three signals and let the editor trim — recall over precision:
//   1. notable shows with episodes airing this weekend (new seasons + big drops)
//   2. brand-new series premiering this weekend
//   3. trending titles on these services (fallback so it's never empty)
// All filtered to the US majors, popularity-ranked, capped.

const KEY = process.env.TMDB_API_KEY;
export const isTmdbConfigured = Boolean(KEY);

const API = "https://api.themoviedb.org/3";
const REGION = "US";

// US provider ids -> friendly label. Includes tier/variant ids that map to the
// same brand (Paramount+, Peacock).
const OURS: Record<number, string> = {
  8: "Netflix",
  9: "Prime Video",
  337: "Disney+",
  15: "Hulu",
  1899: "HBO Max",
  350: "Apple TV+",
  386: "Peacock",
  387: "Peacock",
  531: "Paramount+",
  2303: "Paramount+",
  2616: "Paramount+",
};
const PROVIDER_PARAM = Object.keys(OURS).join("|");
// genres that are noise for a general "what to watch": kids, news, reality, soap, talk
const EXCLUDE_GENRES = "10762,10763,10764,10766,10767";

export interface WatchPick {
  type: "tv" | "movie";
  title: string;
  tmdbId: number;
  overview: string;
  providers: string[];
  /** TMDb "where to watch" page — lists each service with its deep link. */
  link?: string;
  reason: "premiere" | "new-episodes" | "trending";
  date?: string;
}

export interface WeekendPicks {
  window: { start: string; end: string; label: string };
  tv: WatchPick[];
  movies: WatchPick[];
  sports: MarqueeEvent[];
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The Fri–Sun window for "this weekend" — current weekend on Fri/Sat/Sun,
 *  otherwise the upcoming one. */
export function weekendWindow(now: Date): { start: string; end: string; label: string } {
  const day = now.getUTCDay(); // 0 Sun .. 6 Sat
  const offsetToFri = day === 0 ? -2 : day === 6 ? -1 : 5 - day;
  const fri = new Date(now);
  fri.setUTCDate(now.getUTCDate() + offsetToFri);
  const sun = new Date(fri);
  sun.setUTCDate(fri.getUTCDate() + 2);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { start: ymd(fri), end: ymd(sun), label: `${fmt(fri)} – ${fmt(sun)}` };
}

async function tmdb(path: string, params: Record<string, string>): Promise<{ results?: unknown[] }> {
  const qs = new URLSearchParams({ api_key: KEY as string, ...params });
  try {
    const res = await fetch(`${API}${path}?${qs}`, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return {};
    return (await res.json()) as { results?: unknown[] };
  } catch {
    return {};
  }
}

type RawTitle = {
  id: number;
  name?: string;
  title?: string;
  overview?: string;
  popularity?: number;
  first_air_date?: string;
  release_date?: string;
  vote_count?: number;
};

/** Which of OUR services currently stream a given title (flatrate, US) + the
 *  TMDb "where to watch" link (which carries the real per-service deep links). */
async function providersFor(
  type: "tv" | "movie",
  id: number
): Promise<{ names: string[]; link?: string }> {
  const j = (await tmdb(`/${type}/${id}/watch/providers`, {})) as {
    results?: { US?: { flatrate?: { provider_id: number }[]; link?: string } };
  };
  const us = j.results?.US;
  const flat = us?.flatrate ?? [];
  const names = new Set<string>();
  for (const p of flat) if (OURS[p.provider_id]) names.add(OURS[p.provider_id]);
  return { names: [...names], link: us?.link };
}

export async function getWeekendPicks(now: Date): Promise<WeekendPicks> {
  const win = weekendWindow(now);
  const base = {
    watch_region: REGION,
    with_watch_providers: PROVIDER_PARAM,
    with_watch_monetization_types: "flatrate",
    sort_by: "popularity.desc",
  };

  // 1) notable shows airing this weekend
  const airing = ((await tmdb("/discover/tv", {
    ...base,
    "air_date.gte": win.start,
    "air_date.lte": win.end,
    without_genres: EXCLUDE_GENRES,
    "vote_count.gte": "50",
  })).results ?? []) as RawTitle[];

  // 2) brand-new series premiering this weekend (no vote floor — they're new)
  const premieres = ((await tmdb("/discover/tv", {
    ...base,
    "first_air_date.gte": win.start,
    "first_air_date.lte": win.end,
    without_genres: EXCLUDE_GENRES,
  })).results ?? []) as RawTitle[];

  // 3) movies newly on streaming this weekend
  const movies = ((await tmdb("/discover/movie", {
    ...base,
    "primary_release_date.gte": win.start,
    "primary_release_date.lte": win.end,
  })).results ?? []) as RawTitle[];

  const premiereIds = new Set(premieres.map((p) => p.id));
  // merge tv: premieres first (genuinely new), then notable airing, dedup
  const tvMerged: RawTitle[] = [];
  const seen = new Set<number>();
  for (const t of [...premieres, ...airing]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    tvMerged.push(t);
  }

  let tv: WatchPick[] = tvMerged.slice(0, 8).map((t) => ({
    type: "tv" as const,
    title: t.name ?? "",
    tmdbId: t.id,
    overview: t.overview ?? "",
    providers: [],
    reason: premiereIds.has(t.id) ? ("premiere" as const) : ("new-episodes" as const),
    date: t.first_air_date,
  }));

  let movie: WatchPick[] = movies.slice(0, 5).map((m) => ({
    type: "movie" as const,
    title: m.title ?? "",
    tmdbId: m.id,
    overview: m.overview ?? "",
    providers: [],
    reason: "premiere" as const,
    date: m.release_date,
  }));

  // 3b) fallback: if nothing surfaced, use trending titles that are on our services
  if (tv.length === 0 && movie.length === 0) {
    const trending = ((await tmdb("/trending/tv/week", {})).results ?? []) as RawTitle[];
    tv = trending.slice(0, 10).map((t) => ({
      type: "tv" as const,
      title: t.name ?? "",
      tmdbId: t.id,
      overview: t.overview ?? "",
      providers: [],
      reason: "trending" as const,
    }));
  }

  // attach real provider labels; drop anything not actually on our services
  const withProviders = async (picks: WatchPick[], cap: number) => {
    const out: WatchPick[] = [];
    for (const p of picks) {
      const r = await providersFor(p.type, p.tmdbId);
      p.providers = r.names;
      p.link = r.link;
      if (p.providers.length || p.reason === "premiere") out.push(p);
      if (out.length >= cap) break;
    }
    return out;
  };

  tv = await withProviders(tv, 4);
  movie = await withProviders(movie, 2);

  return { window: win, tv, movies: movie, sports: eventsInWindow(win.start, win.end) };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const REASON_LABEL: Record<WatchPick["reason"], string> = {
  premiere: "New",
  "new-episodes": "New episodes",
  trending: "Trending",
};

/** Render the picks as an HTML block to drop into the editor. */
export function renderWhatToWatchHtml(picks: WeekendPicks): string {
  const line = (p: WatchPick) => {
    const name = `<strong>${esc(p.title)}</strong>`;
    const tag = p.link ? `<a href="${esc(p.link)}">${name}</a>` : name;
    const where = p.providers.length ? ` <em>(${esc(p.providers.join(", "))})</em>` : "";
    const why = ` — ${REASON_LABEL[p.reason]}`;
    return `<li>${tag}${where}${why}</li>`;
  };

  const parts: string[] = [`<h2>What to Watch This Weekend</h2>`, `<p><em>${esc(picks.window.label)}</em></p>`];

  if (picks.tv.length || picks.movies.length) {
    parts.push("<ul>");
    for (const p of [...picks.tv, ...picks.movies]) parts.push(line(p));
    parts.push("</ul>");
  } else {
    parts.push("<p>Nothing major dropping this weekend.</p>");
  }

  if (picks.sports.length) {
    parts.push(`<h3>On the sports front</h3>`, "<ul>");
    for (const e of picks.sports) {
      const note = e.note ? ` <em>(${esc(e.note)})</em>` : "";
      const net = e.network ? ` — ${esc(e.network)}` : "";
      parts.push(`<li><strong>${esc(e.name)}</strong>${note}${net}</li>`);
    }
    parts.push("</ul>");
  }

  return parts.join("\n");
}
