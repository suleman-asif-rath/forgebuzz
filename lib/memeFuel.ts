// Meme fuel: fresh joke sparks, on top of the built-in seed bank.
//
// IMPORTANT: this reads TITLES ONLY. We never fetch, store, re-host or post
// anyone else's image. A title is an idea prompt — the joke writer produces an
// original meme from it, and the result is ForgeBuzz's own content.
//
// This replaced lib/trends.ts when the page moved from news to memes. There is
// deliberately no Google News / RSS / Hacker News here any more.

import type { Premise } from "./types";

const UA = "forgebuzz-bot/2.0 (original meme generator)";
const TIMEOUT = 12_000;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// Subreddits chosen because the TITLE carries the idea. Image-first meme subs
// (r/memes, r/meirl) are deliberately excluded: their titles are junk like
// "me irl", so they give the writer nothing to work with.
const SUBS: { sub: string; lane: string; photo: string }[] = [
  { sub: "Showerthoughts", lane: "RELATABLE", photo: "person thinking" },
  { sub: "oneliners", lane: "RELATABLE", photo: "funny everyday scene" },
  { sub: "dadjokes", lane: "RELATABLE", photo: "person laughing" },
  { sub: "antiwork", lane: "WORK", photo: "tired office worker" },
  { sub: "OneJob", lane: "WORK", photo: "workplace fail" },
  { sub: "insomnia", lane: "SLEEP", photo: "person awake at night" },
  { sub: "Cooking", lane: "FOOD", photo: "home cooking kitchen" },
  { sub: "frugal", lane: "MONEY", photo: "wallet and coins" },
  { sub: "aww", lane: "ANIMALS", photo: "cute pet" },
  { sub: "AnimalsBeingDerps", lane: "ANIMALS", photo: "funny pet" },
  { sub: "cats", lane: "ANIMALS", photo: "cat at home" },
];

// Titles that carry no usable idea. Reddit is a top-up, so we drop aggressively
// rather than hand the writer something it cannot build a joke from.
const JUNK_TITLE = /^(me[_ ]?irl|lol|this|same|yep|mood|relatable|oc|repost|[^a-z0-9]*)$/i;

function usableTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 25 || t.length > 200) return false; // too thin or an essay
  if (JUNK_TITLE.test(t)) return false;
  if (/https?:\/\//i.test(t)) return false; // link dumps
  if (/^\[?(oc|repost|update|meta|mod)\]?\b/i.test(t)) return false;
  // Needs enough real words to describe a situation.
  const words = t.split(/\s+/).filter((w) => w.length > 2);
  return words.length >= 5;
}

/** Scale each subreddit's upvotes to 0..100 so a huge sub doesn't drown a small
 *  one purely on raw counts. */
function normalize(items: Premise[]): Premise[] {
  const max = Math.max(1, ...items.map((i) => i.score));
  return items.map((i) => ({ ...i, score: Math.round((i.score / max) * 100) }));
}

async function fetchSub({ sub, lane, photo }: (typeof SUBS)[number]): Promise<Premise[]> {
  try {
    const j = await getJson(`https://www.reddit.com/r/${sub}/hot.json?limit=25`);
    const children = j?.data?.children ?? [];
    const out: Premise[] = [];
    for (const c of children) {
      const d = c?.data;
      if (!d || d.over_18 || d.stickied || d.pinned) continue;
      const title = String(d.title ?? "").trim();
      if (!usableTitle(title)) continue;
      out.push({
        premise: title,
        lane,
        photo,
        source: `reddit r/${sub}`,
        url: `https://reddit.com${d.permalink}`,
        score: Number(d.ups ?? 0),
        publishedAt: d.created_utc ? new Date(Number(d.created_utc) * 1000).toISOString() : undefined,
        evergreen: false,
      });
    }
    return out;
  } catch (e) {
    console.warn(`[memeFuel] r/${sub} failed:`, (e as Error).message);
    return [];
  }
}

/** Reddit titles as extra joke sparks. A failing subreddit is skipped, not
 *  fatal — and if every one fails, the seed bank alone still fills the day. */
export async function fetchRedditFuel(): Promise<Premise[]> {
  const batches = await Promise.all(SUBS.map(fetchSub));
  return normalize(batches.flat());
}
