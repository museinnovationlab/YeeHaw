// Hand-maintained calendar of marquee, tentpole sporting events (US audience).
// Deliberately NOT regular-season games — only the big "everyone's watching"
// windows. Dates are approximate where the exact schedule shifts year to year;
// VERIFY/UPDATE ANNUALLY (most are predictable within a week).
//
// The "What to Watch This Weekend" generator checks which of these overlap the
// upcoming Fri–Sun window.

export interface MarqueeEvent {
  name: string;
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (inclusive)
  note?: string;
}

export const MARQUEE_EVENTS: MarqueeEvent[] = [
  // 2026
  { name: "Super Bowl LX", start: "2026-02-08", end: "2026-02-08" },
  { name: "Winter Olympics", start: "2026-02-06", end: "2026-02-22", note: "Milan–Cortina" },
  { name: "The Masters", start: "2026-04-09", end: "2026-04-12", note: "golf" },
  { name: "Kentucky Derby", start: "2026-05-02", end: "2026-05-02" },
  { name: "PGA Championship", start: "2026-05-14", end: "2026-05-17", note: "golf" },
  { name: "French Open", start: "2026-05-24", end: "2026-06-07", note: "tennis · Roland-Garros" },
  { name: "NBA Finals", start: "2026-06-04", end: "2026-06-21" },
  { name: "Stanley Cup Final", start: "2026-06-03", end: "2026-06-20", note: "NHL" },
  { name: "FIFA World Cup", start: "2026-06-11", end: "2026-07-19", note: "USA · Canada · Mexico" },
  { name: "U.S. Open", start: "2026-06-18", end: "2026-06-21", note: "golf" },
  { name: "Wimbledon", start: "2026-06-29", end: "2026-07-12", note: "tennis" },
  { name: "Tour de France", start: "2026-07-04", end: "2026-07-26", note: "cycling" },
  { name: "MLB All-Star Game", start: "2026-07-14", end: "2026-07-14" },
  { name: "The Open Championship", start: "2026-07-16", end: "2026-07-19", note: "golf" },
  { name: "US Open", start: "2026-08-31", end: "2026-09-13", note: "tennis" },
  { name: "World Series", start: "2026-10-23", end: "2026-11-01", note: "MLB" },
  // 2027 (so it keeps working into next year before the annual update)
  { name: "Super Bowl LXI", start: "2027-02-07", end: "2027-02-07" },
];

/** Events whose date range overlaps [windowStart, windowEnd] (all YYYY-MM-DD). */
export function eventsInWindow(windowStart: string, windowEnd: string): MarqueeEvent[] {
  return MARQUEE_EVENTS.filter((e) => e.start <= windowEnd && e.end >= windowStart);
}
