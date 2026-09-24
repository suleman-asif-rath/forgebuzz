// Turn "today at hour H in timezone Z" into a UTC instant, using only the
// built-in Intl API (no date library). Good for fixed-offset zones like
// Asia/Karachi; DST zones are handled per-slot which is accurate enough here.

function tzParts(timeZone: string, date: Date): Record<string, number> {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return p;
}

function tzOffsetMs(timeZone: string, date: Date): number {
  const p = tzParts(timeZone, date);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

function zonedTimeToUTC(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off = tzOffsetMs(tz, new Date(guess));
  return new Date(guess - off);
}

function todayInTz(tz: string): { year: number; month: number; day: number } {
  const p = tzParts(tz, new Date());
  return { year: p.year, month: p.month, day: p.day };
}

/** Deterministic PRNG, so "variable" times are random-looking but STABLE for a
 *  given day. Generation runs several times a day to stay inside the
 *  serverless time budget, and every run must agree on the same slot list —
 *  otherwise the later batches would reshuffle times already handed out. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** ISO times for the day's posting slots, in the configured timezone.
 *  - "fixed":    posts land exactly on the given slot hours (:00).
 *  - "variable": posts are spread at randomized times across the window
 *                [earliest slot .. latest slot], one per equal segment, so they
 *                stay well spread but fall at different times every day.
 *                Stable within a day — see mulberry32 above. */
export function scheduleTimes(
  slotHours: number[],
  timezone: string,
  count: number,
  mode: "fixed" | "variable" = "fixed",
): string[] {
  const { year, month, day } = todayInTz(timezone);
  const hours = slotHours.length ? [...slotHours].sort((a, b) => a - b) : [9, 12, 15, 18, 21];

  if (mode === "variable" && count > 0) {
    const start = hours[0];
    const end = Math.max(start + 1, Math.min(23, hours[hours.length - 1]));
    const span = end - start;
    // Seeded on the day itself, so repeated runs produce the identical list.
    const rand = mulberry32(hashSeed(`${year}-${month}-${day}-${timezone}-${count}`));
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      // Stratified random: one time inside segment i of `count`.
      const lo = start + (span * i) / count;
      const hi = start + (span * (i + 1)) / count;
      const t = lo + rand() * (hi - lo);
      const h = Math.max(0, Math.min(23, Math.floor(t)));
      const mi = Math.max(0, Math.min(59, Math.floor((t - Math.floor(t)) * 60)));
      out.push(zonedTimeToUTC(year, month, day, h, mi, timezone).toISOString());
    }
    return out.sort(); // ISO strings sort chronologically
  }

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const h = hours[i % hours.length];
    out.push(zonedTimeToUTC(year, month, day, h, 0, timezone).toISOString());
  }
  return out;
}

/** ISO time for today at a single hour in the given timezone (used by the reel). */
export function scheduleAtHour(hour: number, timezone: string): string {
  const { year, month, day } = todayInTz(timezone);
  return zonedTimeToUTC(year, month, day, hour, 0, timezone).toISOString();
}
