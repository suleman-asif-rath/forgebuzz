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

/** ISO times for the day's posting slots, in the configured timezone. */
export function scheduleTimes(slotHours: number[], timezone: string, count: number): string[] {
  const { year, month, day } = todayInTz(timezone);
  const hours = slotHours.length ? [...slotHours].sort((a, b) => a - b) : [9, 12, 15, 18, 21];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const h = hours[i % hours.length];
    out.push(zonedTimeToUTC(year, month, day, h, 0, timezone).toISOString());
  }
  return out;
}
