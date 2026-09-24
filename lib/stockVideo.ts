// Find a stock video clip for a keyword, so a daily Reel can be assembled at
// $0. Prefers a vertical (9:16) clip but will accept any orientation rather
// than produce no reel at all (Meta fits/crops it). Tries Pexels first, then
// Pixabay, then a few generic fallback keywords. Returns a directly-
// downloadable mp4 URL, or null only if nothing at all is found.

import { config } from "./config";

export interface StockVideo {
  url: string; // direct .mp4
  width: number;
  height: number;
  duration: number; // seconds
  source: "pexels" | "pixabay";
}

const MIN_DURATION = 6; // shorter than this makes a choppy reel
const MAX_DURATION = 70;

// Broad terms that reliably return footage, used if a specific keyword is dry.
const FALLBACK_KEYWORDS = ["abstract background", "city timelapse", "nature", "technology", "lights"];

// Lower is better. Strongly prefer portrait and a modest width (keeps the
// re-hosted file small) but never hard-exclude, so we always get *something*.
function score(width: number, height: number): number {
  const portraitPenalty = height > width ? 0 : 3000;
  const widthPenalty = width > 1280 ? (width - 1280) * 2 : Math.abs(width - 1000);
  return portraitPenalty + widthPenalty;
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
        if (!w || !h) continue;
        const sc = score(w, h);
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
      for (const key of ["medium", "large", "small"] as const) {
        const f = hit?.videos?.[key];
        if (!f?.url) continue;
        const w = Number(f.width ?? 0);
        const h = Number(f.height ?? 0);
        const sc = score(w, h);
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

async function findOne(keyword: string): Promise<StockVideo | null> {
  return (await fromPexels(keyword)) || (await fromPixabay(keyword));
}

/** Best available clip for a keyword, trying generic fallbacks before giving up. */
export async function findStockVideo(keyword: string): Promise<StockVideo | null> {
  const direct = await findOne(keyword);
  if (direct) return direct;
  for (const fb of FALLBACK_KEYWORDS) {
    const clip = await findOne(fb);
    if (clip) return clip;
  }
  return null;
}
