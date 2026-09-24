import brand from "@/brand/brand";
import { config } from "./config";
import { getStore } from "./store";
import type { HumorEdge, LaneSetting, Settings } from "./types";

/** Factory defaults. Used until the user changes anything in the dashboard,
 *  and to backfill any field missing from a stored settings blob. */
export function defaultSettings(): Settings {
  const categories: Record<string, LaneSetting> = {};
  for (const lane of brand.categories) categories[lane] = { enabled: true, weight: 3 };
  return {
    postingEnabled: true,
    postsPerDay: config.postsPerDay,
    postingMode: "variable",
    slotHours: [9, 11, 13, 15, 17, 19, 21],
    timezone: "Asia/Karachi",
    maxAgeHours: 48,
    humorEdge: "pg13",
    categories,
    fuel: { seeds: true, reddit: true },
    voice: {
      cta: brand.caption.cta,
      hashtagsCore: [...brand.caption.hashtagsCore],
    },
    extraBlockedWords: [],
    reel: { enabled: true, perDay: 3 },
  };
}

const EDGES: HumorEdge[] = ["clean", "pg13", "sharp"];

/** Merge stored settings over defaults so new fields always have a value.
 *
 *  Note on `categories`: the stored blob may still hold the old news
 *  categories (TRENDING, SPACE, ...). Only the current humor lanes are kept,
 *  so a leftover news category can never be picked after the meme pivot. */
function merge(stored: Partial<Settings> | null): Settings {
  const d = defaultSettings();
  if (!stored) return d;

  const categories: Record<string, LaneSetting> = {};
  for (const lane of brand.categories) {
    const s = stored.categories?.[lane];
    categories[lane] = {
      enabled: s?.enabled ?? d.categories[lane].enabled,
      weight: clampInt(s?.weight ?? d.categories[lane].weight, 1, 5),
    };
  }

  return {
    postingEnabled: stored.postingEnabled ?? d.postingEnabled,
    postsPerDay: clampInt(stored.postsPerDay ?? d.postsPerDay, 1, 12),
    postingMode:
      stored.postingMode === "fixed" || stored.postingMode === "variable"
        ? stored.postingMode
        : d.postingMode,
    slotHours: Array.isArray(stored.slotHours) && stored.slotHours.length ? stored.slotHours : d.slotHours,
    timezone: stored.timezone || d.timezone,
    maxAgeHours: clampInt(stored.maxAgeHours ?? d.maxAgeHours, 6, 168),
    humorEdge: EDGES.includes(stored.humorEdge as HumorEdge) ? (stored.humorEdge as HumorEdge) : d.humorEdge,
    categories,
    fuel: {
      seeds: stored.fuel?.seeds ?? d.fuel.seeds,
      reddit: stored.fuel?.reddit ?? d.fuel.reddit,
    },
    voice: {
      cta: stored.voice?.cta || d.voice.cta,
      hashtagsCore: stored.voice?.hashtagsCore?.length ? stored.voice.hashtagsCore : d.voice.hashtagsCore,
    },
    extraBlockedWords: stored.extraBlockedWords ?? d.extraBlockedWords,
    reel: {
      enabled: stored.reel?.enabled ?? d.reel.enabled,
      perDay: clampInt(stored.reel?.perDay ?? d.reel.perDay, 1, 3),
    },
  };
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));
}

export async function getSettings(): Promise<Settings> {
  const stored = await getStore().getSettings();
  return merge(stored);
}

/** Apply a partial update and persist the merged result. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = merge({ ...current, ...patch });
  await getStore().saveSettings(next);
  return next;
}
