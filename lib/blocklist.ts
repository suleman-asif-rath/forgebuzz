// The safety guardrail for a HANDS-OFF meme account.
//
// Nothing is reviewed by a human before it posts, so this runs twice:
//   1. on the PREMISE, before a joke is written  -> isBlocked()
//   2. on the FINISHED joke, before it queues    -> isUnsafeOutput()
// A Gemini "would this embarrass the brand?" pass (lib/reviewer.ts) sits behind
// both as a second net. When in doubt, we drop.
//
// The two checks differ on purpose. Meme language reuses tragedy words
// affectionately ("I'm dead", "this is killing me"), so the news-tragedy list
// filters incoming premises but does not veto an otherwise harmless joke.

import type { HumorEdge } from "./types";

/** Absolute. Blocked at every humor edge, on input and output alike.
 *  These are the lines the brand never crosses. */
export const HARD_TERMS: string[] = [
  // hate / slurs / extremism
  "racist", "racism", "slur", "nazi", "supremacist", "bigot", "homophobic",
  "transphobic", "antisemitic", "ethnic cleansing",
  // politics / religion / division
  "trump", "biden", "election", "senate", "congress", "parliament",
  "president", "prime minister", "politics", "political", "immigration",
  "abortion", "protest", "riot", "coup", "sanction", "gaza", "israel",
  "palestine", "ukraine", "putin", "islam", "muslim", "christian", "jewish",
  "hindu", "church", "mosque", "temple", "religion", "religious",
  // violence / war / terror
  "war", "genocide", "terror", "terrorist", "bomb", "bombing", "shooting",
  "shooter", "massacre", "stabbing", "hostage", "murder", "murdered",
  "assault", "rape", "abuse", "abused", "torture",
  // death as an event (not the slang — see NEWS_TRAGEDY / meme usage)
  "suicide", "self-harm", "self harm", "funeral", "obituary", "overdose",
  // adult
  "nsfw", "porn", "nude", "nudes", "onlyfans", "sexual", "sexy", "erotic",
  "escort", "strip club",
  // substances
  "cocaine", "heroin", "meth", "weed", "cannabis", "vape",
  // money landmines
  "crypto scam", "pump and dump", "get rich quick", "gambling", "casino",
  // body / appearance, where jokes punch down fastest
  "obese", "anorexic", "fat people", "ugly people",
];

/** News-style tragedy. Filters incoming PREMISES only — a news headline is
 *  never good meme fuel — but is not applied to finished jokes, where "dead"
 *  and "dying" are ordinary internet slang. */
export const NEWS_TRAGEDY: string[] = [
  "dead", "death", "died", "dies", "killed", "fatal", "victim", "injured",
  "wounded", "crash", "accident", "disaster", "tragedy", "tragic",
  "outbreak", "pandemic", "earthquake", "flood", "hurricane", "wildfire",
  "explosion", "gore", "graphic", "disturbing", "horrifying", "brutal",
  "lawsuit", "arrested", "charged", "jail", "prison",
];

/** Always blocked in output regardless of edge. A brand page can be sharp
 *  without this, and Meta demotes reach on it. */
export const STRONG_PROFANITY: string[] = [
  "fuck", "fucking", "fucked", "shit", "shitty", "bitch", "bastard",
  "cunt", "dick", "asshole", "wanker", "prick", "slut", "whore",
];

/** Allowed at "pg13" and "sharp". Blocked at "clean". */
export const MILD_PROFANITY: string[] = [
  "damn", "damned", "hell", "crap", "crappy", "sucks", "sucked", "pissed",
  "bloody", "screwed", "freaking", "frickin", "arse", "ass",
];

function esc(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRe(terms: string[]): RegExp | null {
  const clean = terms.map((t) => t.trim()).filter(Boolean);
  if (!clean.length) return null;
  return new RegExp("\\b(" + clean.map(esc).join("|") + ")\\b", "i");
}

const hardRe = buildRe(HARD_TERMS)!;
const tragedyRe = buildRe(NEWS_TRAGEDY)!;
const strongRe = buildRe(STRONG_PROFANITY)!;
const mildRe = buildRe(MILD_PROFANITY)!;

function hitsExtra(text: string, extra: string[]): boolean {
  const re = buildRe(extra);
  return re ? re.test(text) : false;
}

/** True when a PREMISE should be dropped before a joke is even written.
 *  `extra` adds the user's own blocked words from Settings.
 *
 *  `newsCheck` applies the tragic-news list on top of the hard lines. It is on
 *  for anything pulled off the internet, and OFF for the hand-written seed bank
 *  — those premises are curated, and the list false-positives on ordinary words
 *  ("the 4pm crash", "sleeping through an earthquake"). */
export function isBlocked(premise: string, extra: string[] = [], newsCheck = true): boolean {
  if (hardRe.test(premise)) return true;
  if (newsCheck && tragedyRe.test(premise)) return true;
  return hitsExtra(premise, extra);
}

/** True when a FINISHED joke must not be posted.
 *  Hard lines are absolute; profanity depends on the dashboard's humor edge.
 *  Tragedy slang ("I'm dead") is tolerated here — that is the point of having
 *  a separate output check. */
export function isUnsafeOutput(
  text: string,
  edge: HumorEdge = "pg13",
  extra: string[] = [],
): boolean {
  if (hardRe.test(text)) return true;
  if (strongRe.test(text)) return true;
  if (edge === "clean" && mildRe.test(text)) return true;
  return hitsExtra(text, extra);
}
