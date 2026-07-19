import Parser from "rss-parser";
import type { Trend } from "./types";

const UA = "cantagio-bot/1.0 (branded content aggregator)";
const TIMEOUT = 12_000;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// --- Reddit -------------------------------------------------------
// Each entry maps a subreddit to a Cantagio category. All are "lighter viral".
const SUBREDDITS: { sub: string; category: string }[] = [
  { sub: "todayilearned", category: "DID YOU KNOW" },
  { sub: "space", category: "SPACE" },
  { sub: "technology", category: "TECH" },
  { sub: "gadgets", category: "TECH" },
  { sub: "sports", category: "SPORTS" },
  { sub: "movies", category: "ENTERTAINMENT" },
  { sub: "Music", category: "ENTERTAINMENT" },
  { sub: "science", category: "DID YOU KNOW" },
  { sub: "UpliftingNews", category: "TRENDING" },
  { sub: "Damnthatsinteresting", category: "TRENDING" },
];

async function fetchReddit(): Promise<Trend[]> {
  const out: Trend[] = [];
  await Promise.all(
    SUBREDDITS.map(async ({ sub, category }) => {
      try {
        const j = await getJson(`https://www.reddit.com/r/${sub}/hot.json?limit=20`);
        const children = j?.data?.children ?? [];
        for (const c of children) {
          const d = c?.data;
          if (!d || d.over_18 || d.stickied || d.pinned) continue;
          const title = String(d.title ?? "").trim();
          if (title.length < 15) continue;
          out.push({
            title,
            source: `reddit r/${sub}`,
            url: `https://reddit.com${d.permalink}`,
            score: Number(d.ups ?? 0),
            category,
          });
        }
      } catch (e) {
        console.warn(`[trends] reddit r/${sub} failed:`, (e as Error).message);
      }
    }),
  );
  return normalizePerSource(out);
}

// --- Hacker News (Algolia) ---------------------------------------
async function fetchHackerNews(): Promise<Trend[]> {
  try {
    const j = await getJson("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30");
    const hits = j?.hits ?? [];
    const out: Trend[] = hits
      .filter((h: any) => h.title)
      .map((h: any) => ({
        title: String(h.title).trim(),
        source: "Hacker News",
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        score: Number(h.points ?? 0),
        category: "TECH",
      }));
    return normalizePerSource(out);
  } catch (e) {
    console.warn("[trends] hacker news failed:", (e as Error).message);
    return [];
  }
}

// --- RSS ----------------------------------------------------------
const FEEDS: { url: string; source: string; category: string }[] = [
  { url: "https://www.space.com/feeds/all", source: "Space.com", category: "SPACE" },
  { url: "https://www.sciencedaily.com/rss/top/science.xml", source: "ScienceDaily", category: "DID YOU KNOW" },
  { url: "https://www.theverge.com/rss/index.xml", source: "The Verge", category: "TECH" },
];

async function fetchRss(): Promise<Trend[]> {
  const parser = new Parser({ timeout: TIMEOUT, headers: { "User-Agent": UA } });
  const out: Trend[] = [];
  await Promise.all(
    FEEDS.map(async ({ url, source, category }) => {
      try {
        const feed = await parser.parseURL(url);
        (feed.items ?? []).slice(0, 12).forEach((it, i) => {
          const title = String(it.title ?? "").trim();
          if (title.length < 15) return;
          out.push({
            title,
            source,
            url: it.link ?? url,
            score: 60 - i * 3, // feed order is the only ranking signal
            category,
          });
        });
      } catch (e) {
        console.warn(`[trends] rss ${source} failed:`, (e as Error).message);
      }
    }),
  );
  return out;
}

/** Scale each source's scores to 0..100 so a busy subreddit doesn't drown
 *  out a quieter one purely on raw upvote counts. */
function normalizePerSource(items: Trend[]): Trend[] {
  const max = Math.max(1, ...items.map((i) => i.score));
  return items.map((i) => ({ ...i, score: Math.round((i.score / max) * 100) }));
}

export interface SourceToggles {
  reddit: boolean;
  rss: boolean;
  hackernews: boolean;
}

/** Pull the enabled sources in parallel; a failing source is skipped, not fatal. */
export async function fetchAllTrends(
  sources: SourceToggles = { reddit: true, rss: true, hackernews: true },
): Promise<Trend[]> {
  const [reddit, hn, rss] = await Promise.all([
    sources.reddit ? fetchReddit() : Promise.resolve([]),
    sources.hackernews ? fetchHackerNews() : Promise.resolve([]),
    sources.rss ? fetchRss() : Promise.resolve([]),
  ]);
  return [...reddit, ...hn, ...rss];
}
