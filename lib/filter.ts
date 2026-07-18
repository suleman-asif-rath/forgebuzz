import type { Trend } from "./types";
import { isBlocked } from "./blocklist";
import { fingerprint } from "./util";

export interface PickOptions {
  count: number;
  usedFingerprints: Set<string>;
}

/** Filter for safety + quality, drop duplicates and already-used topics,
 *  then pick `count` items with variety across categories. */
export function pickTrends(
  trends: Trend[],
  { count, usedFingerprints }: PickOptions,
): { picks: Trend[]; skipped: string[] } {
  const skipped: string[] = [];

  // 1. Safety + basic quality filter.
  const safe = trends.filter((t) => {
    if (isBlocked(t.title)) {
      skipped.push(`blocked (safety): ${t.title}`);
      return false;
    }
    if (t.title.length < 15 || t.title.length > 180) return false;
    if (/^\s*(ama|megathread|weekly|daily thread)/i.test(t.title)) return false;
    return true;
  });

  // 2. Dedupe by fingerprint, keeping the highest-scoring instance.
  const byFp = new Map<string, Trend>();
  for (const t of safe) {
    const fp = fingerprint(t.title);
    if (usedFingerprints.has(fp)) continue; // already posted before
    const existing = byFp.get(fp);
    if (!existing || t.score > existing.score) byFp.set(fp, t);
  }
  const unique = [...byFp.values()].sort((a, b) => b.score - a.score);

  // 3. Pick with category spread: one pass round-robin by category (best of
  //    each), then fill remaining slots by raw score.
  const byCat = new Map<string, Trend[]>();
  for (const t of unique) {
    const arr = byCat.get(t.category) ?? [];
    arr.push(t);
    byCat.set(t.category, arr);
  }
  const picks: Trend[] = [];
  const seen = new Set<string>();
  const cats = [...byCat.keys()];
  let ci = 0;
  while (picks.length < count && cats.length > 0) {
    const cat = cats[ci % cats.length];
    const arr = byCat.get(cat)!;
    const next = arr.shift();
    if (next) {
      const fp = fingerprint(next.title);
      if (!seen.has(fp)) {
        seen.add(fp);
        picks.push(next);
      }
    }
    if (arr.length === 0) cats.splice(cats.indexOf(cat), 1);
    else ci++;
    if (cats.length === 0) break;
  }
  // 4. Top up from the flat list if categories ran dry.
  for (const t of unique) {
    if (picks.length >= count) break;
    const fp = fingerprint(t.title);
    if (!seen.has(fp)) {
      seen.add(fp);
      picks.push(t);
    }
  }

  return { picks: picks.slice(0, count), skipped };
}
