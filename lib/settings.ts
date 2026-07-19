import brand from "@/brand/brand";
import { config } from "./config";
import { getStore } from "./store";
import type { Settings, CategorySetting } from "./types";

/** Factory defaults. Used until the user changes anything in the dashboard,
 *  and to backfill any field missing from a stored settings blob. */
export function defaultSettings(): Settings {
  const categories: Record<string, CategorySetting> = {};
  for (const c of brand.categories) categories[c] = { enabled: true, weight: 3 };
  return {
    postingEnabled: true,
    postsPerDay: config.postsPerDay,
    slotHours: [9, 11, 13, 15, 17, 19, 21],
    timezone: "Asia/Karachi",
    categories,
    sources: { reddit: true, rss: true, hackernews: true },
    voice: {
      cta: brand.caption.cta,
      hashtagsCore: [...brand.caption.hashtagsCore],
    },
    extraBlockedWords: [],
  };
}

/** Merge stored settings over defaults so new fields always have a value. */
function merge(stored: Partial<Settings> | null): Settings {
  const d = defaultSettings();
  if (!stored) return d;
  return {
    postingEnabled: stored.postingEnabled ?? d.postingEnabled,
    postsPerDay: clampInt(stored.postsPerDay ?? d.postsPerDay, 1, 12),
    slotHours: Array.isArray(stored.slotHours) && stored.slotHours.length ? stored.slotHours : d.slotHours,
    timezone: stored.timezone || d.timezone,
    categories: { ...d.categories, ...(stored.categories ?? {}) },
    sources: { ...d.sources, ...(stored.sources ?? {}) },
    voice: {
      cta: stored.voice?.cta || d.voice.cta,
      hashtagsCore: stored.voice?.hashtagsCore?.length ? stored.voice.hashtagsCore : d.voice.hashtagsCore,
    },
    extraBlockedWords: stored.extraBlockedWords ?? d.extraBlockedWords,
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
