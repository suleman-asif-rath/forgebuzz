// Turn the seed bank + Reddit fuel into the day's joke premises.
//
// Replaces lib/filter.ts from the news era. Same job — safety, dedupe,
// weighted pick — minus the freshness rules, because a joke about Mondays does
// not expire. Only Reddit-sourced fuel carries a recency preference.

import type { LaneSetting, Premise } from "./types";
import { SEEDS } from "./premises";
import { fetchRedditFuel, fetchFactFuel } from "./memeFuel";
import { FACTS } from "./facts";
import { FACT_LANE } from "./types";
import { isBlocked } from "./blocklist";
import { fingerprint } from "./util";

export interface FuelToggles {
  seeds: boolean;
  reddit: boolean;
  facts: boolean;
}

/** The built-in seed bank as premises. Evergreen, so always eligible.
 *  Scores are randomised per run so the same seeds don't lead every day. */
function seedPremises(): Premise[] {
  return SEEDS.map((s) => ({
    premise: s.premise,
    lane: s.lane,
    photo: s.photo,
    source: "seed bank",
    score: Math.floor(Math.random() * 100),
    evergreen: true,
  }));
}

/** The verified fact bank as premises. Evergreen — a fact does not expire. */
function factPremises(): Premise[] {
  return FACTS.map((f) => ({
    premise: f.fact,
    lane: FACT_LANE,
    photo: f.photo,
    source: "fact bank",
    score: Math.floor(Math.random() * 100),
    evergreen: true,
  }));
}

/** Gather every enabled fuel source. Both banks are local and never fail, so
 *  the day's posts survive Reddit being down, rate-limited, or fully filtered. */
export async function gatherPremises(fuel: FuelToggles): Promise<Premise[]> {
  const seeds = fuel.seeds ? seedPremises() : [];
  const facts = fuel.facts ? factPremises() : [];
  const [reddit, factFuel] = await Promise.all([
    fuel.reddit ? fetchRedditFuel().catch(() => []) : Promise.resolve([]),
    fuel.facts ? fetchFactFuel().catch(() => []) : Promise.resolve([]),
  ]);
  const all = [...seeds, ...facts, ...reddit, ...factFuel];
  if (!all.length) {
    // Everything off or dead — fall back to the local banks rather than post
    // nothing at all.
    return [...seedPremises(), ...factPremises()];
  }
  return all;
}

export interface PickOptions {
  count: number;
  usedFingerprints: Set<string>;
  lanes: Record<string, LaneSetting>; // enabled + weight per humor lane
  extraBlockedWords?: string[];
  maxAgeHours?: number; // applies to Reddit fuel only; seeds are evergreen
}

/** Filter for safety, drop duplicates / already-used / disabled-lane premises,
 *  then pick `count` of them weighted by each lane's priority. */
export function pickPremises(
  premises: Premise[],
  { count, usedFingerprints, lanes, extraBlockedWords = [], maxAgeHours = 48 }: PickOptions,
): { picks: Premise[]; skipped: string[] } {
  const skipped: string[] = [];
  const enabled = (lane: string) => lanes[lane]?.enabled ?? true;
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 3600_000;

  // Seed premises never go stale. Reddit sparks should still be recent-ish, so
  // the page reflects what people are actually talking about this week.
  const isFresh = (p: Premise): boolean => {
    if (p.evergreen) return true;
    if (!p.publishedAt) return true; // no timestamp is fine for a joke prompt
    const age = now - Date.parse(p.publishedAt);
    return !Number.isFinite(age) || age <= maxAgeMs;
  };

  // 1. Safety + enabled-lane + freshness filter.
  const safe = premises.filter((p) => {
    // Seed-bank premises are hand-curated, so they skip the tragic-news list
    // (which false-positives on words like "crash" and "earthquake").
    // Anything pulled off the internet still gets the full check.
    if (isBlocked(p.premise, extraBlockedWords, !p.evergreen)) {
      skipped.push(`blocked (safety): ${p.premise}`);
      return false;
    }
    if (!enabled(p.lane)) return false; // lane switched off in the dashboard
    if (!isFresh(p)) return false;
    return true;
  });

  // 2. Dedupe by fingerprint, keeping the highest-scoring instance.
  const byFp = new Map<string, Premise>();
  for (const p of safe) {
    const fp = fingerprint(p.premise);
    if (usedFingerprints.has(fp)) continue;
    const existing = byFp.get(fp);
    if (!existing || p.score > existing.score) byFp.set(fp, p);
  }
  const unique = [...byFp.values()].sort((a, b) => b.score - a.score);

  // 3. Group by lane (each sorted by score desc).
  const byLane = new Map<string, Premise[]>();
  for (const p of unique) {
    const arr = byLane.get(p.lane) ?? [];
    arr.push(p);
    byLane.set(p.lane, arr);
  }

  // 4. Weighted pick: each slot chooses a lane with probability proportional to
  //    its priority weight, then takes that lane's best remaining premise.
  //    Higher weight => shows up more often.
  const picks: Premise[] = [];
  const seen = new Set<string>();
  while (picks.length < count) {
    const avail = [...byLane.entries()].filter(([, arr]) => arr.length > 0);
    if (avail.length === 0) break;
    const weighted = avail.map(([lane, arr]) => ({
      lane,
      arr,
      weight: Math.max(1, lanes[lane]?.weight ?? 3),
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
      const fp = fingerprint(next.premise);
      if (!seen.has(fp)) {
        seen.add(fp);
        picks.push(next);
      }
    }
  }

  return { picks: picks.slice(0, count), skipped };
}
