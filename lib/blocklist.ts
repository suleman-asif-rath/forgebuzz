// The safety guardrail for a HANDS-OFF account. Because nothing is reviewed by
// a human before posting, any topic touching these areas is dropped entirely.
// Cantagio's scope is deliberately "lighter viral" (pop culture, tech, sports,
// entertainment, space, fun facts). When in doubt, we drop.

// Whole-word / phrase matches (case-insensitive). Kept broad on purpose.
export const BLOCKED_TERMS: string[] = [
  // violence / tragedy
  "kill", "killed", "murder", "shooting", "shooter", "massacre", "stabbing",
  "dead", "death", "dies", "died", "fatal", "suicide", "terror", "terrorist",
  "bomb", "bombing", "explosion", "war", "genocide", "hostage", "assault",
  "abuse", "victim", "crash", "wildfire", "earthquake", "flood", "hurricane",
  "disaster", "outbreak", "pandemic", "overdose",
  // politics / division
  "trump", "biden", "election", "senate", "congress", "parliament",
  "president", "prime minister", "politic", "immigration", "abortion",
  "protest", "riot", "coup", "sanction", "gaza", "israel", "palestine",
  "ukraine", "russia war", "putin",
  // adult / hateful / self-harm
  "nsfw", "porn", "sex", "nude", "onlyfans", "racist", "slur", "nazi",
  "self-harm", "self harm", "drug", "cocaine", "heroin",
  // financial-advice landmines
  "crypto scam", "pump and dump", "get rich",
];

function esc(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRe(terms: string[]): RegExp {
  return new RegExp("\\b(" + terms.map(esc).join("|") + ")\\b", "i");
}

const blockedRe = buildRe(BLOCKED_TERMS);

/** True when a title should be dropped for safety.
 *  `extra` adds the user's own blocked words from Settings. */
export function isBlocked(title: string, extra: string[] = []): boolean {
  if (blockedRe.test(title)) return true;
  const clean = extra.map((w) => w.trim()).filter(Boolean);
  if (clean.length && buildRe(clean).test(title)) return true;
  return false;
}
