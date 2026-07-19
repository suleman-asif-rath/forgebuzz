import type { Trend, CategorySetting } from "./types";
import { isBlocked } from "./blocklist";
import { fingerprint } from "./util";

export interface PickOptions {
  count: number;
  usedFingerprints: Set<string>;
  categories: Record<string, CategorySetting>; // enabled + weight per category
  extraBlockedWords?: string[];
  maxAgeHours?: number; // news-like items older than this are dropped
}

/** Filter for safety + quality + freshness, drop duplicates / used /
 *  disabled-category topics, then pick `count` items by category priority. */
export function pickTrends(
  trends: Trend[],
  { count, usedFingerprints, categories, extraBlockedWords = [], maxAgeHours = 18 }: PickOptions,
): { picks: Trend[]; skipped: string[] } {
  const skipped: string[] = [];
  const enabled = (cat: string) => categories[cat]?.enabled ?? true;
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 3600_000;

  // Timeless facts are exempt; time-sensitive news must be recent AND dated.
  const isFresh = (t: Trend): boolean => {
    if (t.evergreen) return true;
    if (!t.publishedAt) return false; // no timestamp on news-like item -> can't trust it's fresh
    const age = now - Date.parse(t.publishedAt);
    return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
  };

  // 1. Safety + quality + freshness + enabled-category filter.
  const safe = trends.filter((t) => {
    if (isBlocked(t.title, extraBlockedWords)) {
      skipped.push(`blocked (safety): ${t.title}`);
      return false;
    }
    if (!enabled(t.category)) return false; // topic area switched off
    if (!isFresh(t)) {
      skipped.push(`too old (> ${maxAgeHours}h): ${t.title}`);
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
    if (usedFingerprints.has(fp)) continue;
    const existing = byFp.get(fp);
    if (!existing || t.score > existing.score) byFp.set(fp, t);
  }
  const unique = [...byFp.values()].sort((a, b) => b.score - a.score);

  // 3. Group by category (each sorted by score desc).
  const byCat = new Map<string, Trend[]>();
  for (const t of unique) {
    const arr = byCat.get(t.category) ?? [];
    arr.push(t);
    byCat.set(t.category, arr);
  }

  // 4. Weighted pick: each slot chooses a category with probability
  //    proportional to its priority weight, then takes that category's best
  //    remaining topic. Higher weight => appears more often.
  const picks: Trend[] = [];
  const seen = new Set<string>();
  while (picks.length < count) {
    const avail = [...byCat.entries()].filter(([, arr]) => arr.length > 0);
    if (avail.length === 0) break;
    const weighted = avail.map(([cat, arr]) => ({
      cat,
      arr,
      weight: Math.max(1, categories[cat]?.weight ?? 3),
    }));
    const total = weighted.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    let chosen = weighted[0];
    for (const w of weighted) {
      r -= w.weight;
      if (r <= 0) { chosen = w; break; }
    }
    const next = chosen.arr.shift();
    if (next) {
      const fp = fingerprint(next.title);
      if (!seen.has(fp)) {
        seen.add(fp);
        picks.push(next);
      }
    }
  }

  return { picks: picks.slice(0, count), skipped };
}
