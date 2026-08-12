import Parser from "rss-parser";
import type { Trend } from "./types";

const UA = "forgebuzz-bot/1.0 (branded content aggregator)";
const TIMEOUT = 12_000;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// A category is "evergreen" when its content is timeless (facts / trivia) and
// therefore exempt from the freshness (max-age) filter. Everything else is
// time-sensitive news and must be recent.
const EVERGREEN_CATEGORIES = new Set(["DID YOU KNOW"]);
const isEvergreen = (category: string) => EVERGREEN_CATEGORIES.has(category);

// --- Reddit -------------------------------------------------------
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
  // High-virality, broadly-shareable, wholesome sources (great reel fodder).
  { sub: "BeAmazed", category: "TRENDING" },
  { sub: "interestingasfuck", category: "TRENDING" },
  { sub: "oddlysatisfying", category: "TRENDING" },
  { sub: "mademesmile", category: "TRENDING" },
  { sub: "Awwducational", category: "DID YOU KNOW" },
  { sub: "nextfuckinglevel", category: "TRENDING" },
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
            publishedAt: d.created_utc ? new Date(Number(d.created_utc) * 1000).toISOString() : undefined,
            evergreen: isEvergreen(category),
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
        publishedAt: h.created_at || (h.created_at_i ? new Date(h.created_at_i * 1000).toISOString() : undefined),
        evergreen: false,
      }));
    return normalizePerSource(out);
  } catch (e) {
    console.warn("[trends] hacker news failed:", (e as Error).message);
    return [];
  }
}

// --- RSS (topical feeds) -----------------------------------------
const FEEDS: { url: string; source: string; category: string }[] = [
  { url: "https://www.space.com/feeds/all", source: "Space.com", category: "SPACE" },
  { url: "https://www.sciencedaily.com/rss/top/science.xml", source: "ScienceDaily", category: "DID YOU KNOW" },
  { url: "https://www.theverge.com/rss/index.xml", source: "The Verge", category: "TECH" },
];

// --- Google News (keyless RSS, by topic) -------------------------
const GNEWS_BASE = "https://news.google.com/rss";
const GNEWS_TAIL = "?hl=en-US&gl=US&ceid=US:en";
const GOOGLE_FEEDS: { url: string; source: string; category: string }[] = [
  { url: `${GNEWS_BASE}${GNEWS_TAIL}`, source: "Google News", category: "TRENDING" },
  { url: `${GNEWS_BASE}/headlines/section/topic/WORLD${GNEWS_TAIL}`, source: "Google News · World", category: "WORLD" },
  { url: `${GNEWS_BASE}/headlines/section/topic/TECHNOLOGY${GNEWS_TAIL}`, source: "Google News · Tech", category: "TECH" },
  { url: `${GNEWS_BASE}/headlines/section/topic/ENTERTAINMENT${GNEWS_TAIL}`, source: "Google News · Entertainment", category: "ENTERTAINMENT" },
  { url: `${GNEWS_BASE}/headlines/section/topic/SPORTS${GNEWS_TAIL}`, source: "Google News · Sports", category: "SPORTS" },
];

async function fetchFeeds(feeds: typeof FEEDS, stripPublisher = false): Promise<Trend[]> {
  const parser = new Parser({ timeout: TIMEOUT, headers: { "User-Agent": UA } });
  const out: Trend[] = [];
  await Promise.all(
    feeds.map(async ({ url, source, category }) => {
      try {
        const feed = await parser.parseURL(url);
        (feed.items ?? []).slice(0, 15).forEach((it, i) => {
          // Google News titles look like "Headline - Publisher"; drop the suffix.
          let title = String(it.title ?? "").trim();
          if (stripPublisher) title = title.replace(/\s+-\s+[^-]+$/, "").trim();
          if (title.length < 15) return;
          out.push({
            title,
            source,
            url: it.link ?? url,
            score: 60 - i * 3, // feed order is the ranking signal
            category,
            publishedAt: it.isoDate || (it.pubDate ? new Date(it.pubDate).toISOString() : undefined),
            evergreen: isEvergreen(category),
          });
        });
      } catch (e) {
        console.warn(`[trends] feed ${source} failed:`, (e as Error).message);
      }
    }),
  );
  return out;
}

/** Scale each source's scores to 0..100 so a busy source doesn't drown out a
 *  quieter one purely on raw counts. */
function normalizePerSource(items: Trend[]): Trend[] {
  const max = Math.max(1, ...items.map((i) => i.score));
  return items.map((i) => ({ ...i, score: Math.round((i.score / max) * 100) }));
}

export interface SourceToggles {
  reddit: boolean;
  rss: boolean;
  hackernews: boolean;
  googlenews: boolean;
}

/** Pull the enabled sources in parallel; a failing source is skipped, not fatal. */
export async function fetchAllTrends(
  sources: SourceToggles = { reddit: true, rss: true, hackernews: true, googlenews: true },
): Promise<Trend[]> {
  const [reddit, hn, rss, gnews] = await Promise.all([
    sources.reddit ? fetchReddit() : Promise.resolve([]),
    sources.hackernews ? fetchHackerNews() : Promise.resolve([]),
    sources.rss ? fetchFeeds(FEEDS) : Promise.resolve([]),
    sources.googlenews ? fetchFeeds(GOOGLE_FEEDS, true) : Promise.resolve([]),
  ]);
  return [...reddit, ...hn, ...rss, ...gnews];
}
