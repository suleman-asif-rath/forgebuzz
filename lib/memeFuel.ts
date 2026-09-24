// Meme fuel: fresh joke sparks, on top of the built-in seed bank.
//
// IMPORTANT: this reads TITLES ONLY. We never fetch, store, re-host or post
// anyone else's image. A title is an idea prompt — the joke writer produces an
// original meme from it, and the result is ForgeBuzz's own content.
//
// This replaced lib/trends.ts when the page moved from news to memes. There is
// deliberately no Google News / RSS / Hacker News here any more.

import { FACT_LANE } from "./types";
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

// Subreddits chosen because the TITLE carries a JOKE. Three kinds are
// deliberately excluded:
//   - image-first meme subs (r/memes, r/meirl): titles are junk like "me irl"
//   - discussion and advice subs (r/Cooking, r/Frugal): titles are questions
//     and recipes, not jokes
//   - venting and health subs (r/antiwork, r/insomnia): titles skew political,
//     bleak or medical — exactly the register this page moved away from
//
// That leaves humour and animals. The other lanes (WORK, SLEEP, FOOD, MONEY)
// are served entirely by the seed bank, which has 35 hand-written premises
// each — so narrowing this list costs variety nothing.
const SUBS: { sub: string; lane: string; photo: string }[] = [
  { sub: "Showerthoughts", lane: "RELATABLE", photo: "person thinking" },
  { sub: "oneliners", lane: "RELATABLE", photo: "funny everyday scene" },
  { sub: "dadjokes", lane: "RELATABLE", photo: "person laughing" },
  { sub: "CleanJokes", lane: "RELATABLE", photo: "person laughing" },
  { sub: "aww", lane: "ANIMALS", photo: "cute pet" },
  { sub: "AnimalsBeingDerps", lane: "ANIMALS", photo: "funny pet" },
  { sub: "cats", lane: "ANIMALS", photo: "cat at home" },
  { sub: "rarepuppers", lane: "ANIMALS", photo: "happy dog" },
];

// Fact sources for the FACTS lane. These subs are chosen because a post there
// is REQUIRED to cite a source, so the claim has already been checked by
// someone before we see it — the writer then only rephrases it. Toggled
// separately from the joke sparks (Settings -> fuel.facts).
const FACT_SUBS: { sub: string; photo: string }[] = [
  { sub: "todayilearned", photo: "interesting object" },
  { sub: "Damnthatsinteresting", photo: "interesting scene" },
];

// TIL titles are all prefixed and often trail into editorialising after a dash.
function cleanFactTitle(title: string): string {
  return title
    .replace(/^til:?\s*(that\s+)?/i, "")
    .replace(/\s+\[[^\]]*\]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A fact title only qualifies if it reads as a self-contained claim. Anything
 *  hedged ("apparently", "allegedly") is dropped: the whole point of this lane
 *  is that the fact is solid before Gemini ever sees it. */
const HEDGED = /\b(apparently|allegedly|reportedly|supposedly|rumou?r|might have|may have|some say|believed to)\b/i;

function usableFact(fact: string): boolean {
  if (fact.length < 30 || fact.length > 220) return false;
  if (HEDGED.test(fact)) return false;
  if (/https?:\/\//i.test(fact)) return false;
  if (/\?\s*$/.test(fact)) return false; // a question is not a fact
  return fact.split(/\s+/).filter((w) => w.length > 2).length >= 6;
}

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

/** Sourced facts from Reddit for the FACTS lane, titles only. Same failure
 *  policy: if these are unreachable, lib/facts.ts alone still carries the lane. */
export async function fetchFactFuel(): Promise<Premise[]> {
  const batches = await Promise.all(
    FACT_SUBS.map(async ({ sub, photo }) => {
      try {
        const j = await getJson(`https://www.reddit.com/r/${sub}/top.json?t=week&limit=25`);
        const children = j?.data?.children ?? [];
        const out: Premise[] = [];
        for (const c of children) {
          const d = c?.data;
          if (!d || d.over_18 || d.stickied || d.pinned) continue;
          const fact = cleanFactTitle(String(d.title ?? ""));
          if (!usableFact(fact)) continue;
          out.push({
            premise: fact,
            lane: FACT_LANE,
            photo,
            source: `reddit r/${sub}`,
            url: `https://reddit.com${d.permalink}`,
            score: Number(d.ups ?? 0),
            publishedAt: d.created_utc ? new Date(Number(d.created_utc) * 1000).toISOString() : undefined,
            // A fact does not go stale, so it is not held to the recency limit.
            evergreen: true,
          });
        }
        return out;
      } catch (e) {
        console.warn(`[memeFuel] fact sub r/${sub} failed:`, (e as Error).message);
        return [];
      }
    }),
  );
  return normalize(batches.flat());
}
