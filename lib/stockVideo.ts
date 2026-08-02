// Find a vertical (9:16) stock video clip for a keyword, so a daily Reel can be
// assembled at $0. Tries Pexels (has a real portrait filter) first, then
// Pixabay as a fallback. Returns a directly-downloadable mp4 URL, or null (the
// pipeline then skips the reel for the day and logs it).

import { config } from "./config";

export interface StockVideo {
  url: string; // direct .mp4
  width: number;
  height: number;
  duration: number; // seconds
  source: "pexels" | "pixabay";
}

// Reels want a portrait clip that is short enough to hold attention. We prefer
// ~720-1080 wide to keep the re-hosted file small, and 5-45s long.
const MIN_DURATION = 4;
const MAX_DURATION = 60;

function scorePortrait(width: number, height: number): number {
  // Lower is better. Reward portrait aspect and a width near 1080.
  const portraitBonus = height > width ? 0 : 4000; // heavily penalise landscape
  return portraitBonus + Math.abs(width - 1000);
}

async function fromPexels(keyword: string): Promise<StockVideo | null> {
  if (!config.pexels.on) return null;
  try {
    const url =
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}` +
      `&orientation=portrait&size=medium&per_page=15`;
    const res = await fetch(url, {
      headers: { Authorization: config.pexels.key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`pexels ${res.status}`);
    const j = await res.json();
    const videos: any[] = j?.videos ?? [];

    let best: StockVideo | null = null;
    let bestScore = Infinity;
    for (const v of videos) {
      const dur = Number(v?.duration ?? 0);
      if (dur < MIN_DURATION || dur > MAX_DURATION) continue;
      for (const f of v?.video_files ?? []) {
        if (f?.file_type !== "video/mp4" || !f?.link) continue;
        const w = Number(f.width ?? 0);
        const h = Number(f.height ?? 0);
        if (h <= w) continue; // portrait only
        if (w > 1200) continue; // keep the re-hosted file modest
        const sc = scorePortrait(w, h);
        if (sc < bestScore) {
          bestScore = sc;
          best = { url: f.link, width: w, height: h, duration: dur, source: "pexels" };
        }
      }
    }
    return best;
  } catch (e) {
    console.warn(`[stockVideo/pexels] ${(e as Error).message}`);
    return null;
  }
}

async function fromPixabay(keyword: string): Promise<StockVideo | null> {
  if (!config.pixabay.on) return null;
  try {
    const url =
      `https://pixabay.com/api/videos/?key=${config.pixabay.key}` +
      `&q=${encodeURIComponent(keyword)}&safesearch=true&per_page=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`pixabay ${res.status}`);
    const j = await res.json();
    const hits: any[] = j?.hits ?? [];

    let best: StockVideo | null = null;
    let bestScore = Infinity;
    for (const hit of hits) {
      const dur = Number(hit?.duration ?? 0);
      if (dur < MIN_DURATION || dur > MAX_DURATION) continue;
      // Pixabay renditions: large/medium/small/tiny. Prefer the smallest that is
      // still reasonably sized so the re-host stays light.
      for (const key of ["medium", "large", "small"] as const) {
        const f = hit?.videos?.[key];
        if (!f?.url) continue;
        const w = Number(f.width ?? 0);
        const h = Number(f.height ?? 0);
        const sc = scorePortrait(w, h);
        if (sc < bestScore) {
          bestScore = sc;
          best = { url: f.url, width: w, height: h, duration: dur, source: "pixabay" };
        }
        break; // one rendition per hit is enough
      }
    }
    return best;
  } catch (e) {
    console.warn(`[stockVideo/pixabay] ${(e as Error).message}`);
    return null;
  }
}

/** Best available vertical clip for a keyword, or null if none found. */
export async function findStockVideo(keyword: string): Promise<StockVideo | null> {
  return (await fromPexels(keyword)) || (await fromPixabay(keyword));
}
