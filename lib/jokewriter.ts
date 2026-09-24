import brand from "@/brand/brand";
import { generateJson } from "./gemini";
import { FACT_LANE } from "./types";
import type { HumorEdge, MemeContent, Premise } from "./types";
import { clampHeadline } from "./util";

// Replaces lib/copywriter.ts from the news era. Same Gemini key rotation and
// local fallback; completely different output — a meme's two text lines rather
// than a headline and a paragraph.

const MAX_LINE = 42; // chars per meme line before the renderer has to shrink it

const STOP = new Set([
  "this", "that", "with", "from", "have", "will", "your", "just", "about",
  "into", "than", "then", "they", "them", "what", "when", "were", "been",
  "after", "over", "first", "could", "would", "these", "there", "here",
  "the", "and", "for", "are", "but", "not", "you", "all", "new", "being",
  "instead", "every", "single", "their", "while", "until", "again",
]);

function topicalHashtags(premise: string, lane: string): string[] {
  const isFact = lane === FACT_LANE;
  const words = premise
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP.has(w));
  const laneTag = "#" + lane.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const topical = words.slice(0, 5).map((w) => "#" + w);
  // A fact post tagged #memes reads as a joke and undercuts the claim.
  const flavour = isFact
    ? ["#didyouknow", "#interesting", "#factsdaily"]
    : ["#funny", "#memepage"];
  const all = [...brand.caption.hashtagsCore, laneTag, ...flavour, ...topical];
  return [...new Set(all)].slice(0, brand.caption.hashtagsBySize);
}

/** How much attitude the writer is allowed. The hard lines (slurs, politics,
 *  tragedy, sexual content, punching down) hold at every level — this only
 *  moves the profanity and sarcasm dial. See lib/blocklist.ts. */
function edgeRules(edge: HumorEdge): string {
  if (edge === "clean") {
    return [
      `TONE: playful and warm. Absolutely no swearing of any kind, not even mild.`,
      `Self-deprecating is fine. Keep it something anyone could show their mum.`,
    ].join(" ");
  }
  if (edge === "sharp") {
    return [
      `TONE: chronically-online and sharp. Heavy internet slang is welcome`,
      `("the way I", "not me", "bestie", "it's giving", "screaming", "I'm dead").`,
      `Mild swearing only (damn, hell, crap) — never strong profanity.`,
      `Be absurd and exaggerated. Always punch at yourself, never at a group.`,
    ].join(" ");
  }
  return [
    `TONE: chronically-online but broadly relatable. Internet slang is welcome.`,
    `Mild swearing only (damn, hell, crap) — never strong profanity.`,
    `Grown-up life humour (bills, hating Mondays, being broke) is fine.`,
    `Always punch at yourself, never at a group.`,
  ].join(" ");
}

// --- defaults for a partial Gemini response ---------------------------------
// NOT a standalone writer. The news version of this file had a local fallback
// that filled a template with the raw topic, which was fine for a headline but
// produces a non-joke for a meme ("ME: A DOG WHO THINKS THE POSTMAN IS A... /
// ALSO ME: SURPRISED"). A meme page posting that is worse than posting less,
// so when Gemini is unavailable we skip the premise instead — see writeMeme.
function localDefaults(p: Premise): MemeContent {
  const core = p.premise.replace(/^(til that|til|psa:)\s*/i, "").trim();
  return {
    topText: clampHeadline(core, MAX_LINE).toUpperCase(),
    bottomText: "",
    lane: p.lane,
    captionLine: "every time. no notes.",
    cta: brand.caption.cta,
    hashtags: topicalHashtags(core, p.lane),
    photoKeyword: p.photo,
  };
}

// --- Gemini ----------------------------------------------------------------

function buildPrompt(p: Premise, edge: HumorEdge, forReel: boolean): string {
  const format = forReel
    ? `This is the text burned onto a short VIDEO REEL. It is the first thing viewers read, so it has to stop the scroll in under a second.`
    : `This is a single image meme: white impact text over a photo.`;
  return [
    `You write ORIGINAL memes for "ForgeBuzz" (@forgee.buzz), a meme page about`,
    `everyday life and animals. Everything you write must be your own — never`,
    `reproduce an existing meme's wording.`,
    ``,
    edgeRules(edge),
    format,
    ``,
    `PREMISE (a starting idea from ${p.source}): "${p.premise}"`,
    ``,
    `Write a meme about this premise. The classic shape is a setup on top and a`,
    `punchline on the bottom, but a strong one-liner is better than a forced`,
    `two-parter — in that case put the whole line in "topText" and leave`,
    `"bottomText" empty.`,
    ``,
    `RULES:`,
    `- Each line MAX ${MAX_LINE} characters. Short is funnier and renders bigger.`,
    `- No hashtags, no emoji, no quotation marks in topText/bottomText.`,
    `- Never mention a real named person, brand, company, or public figure.`,
    `- Nothing political, religious, tragic, sexual, or mean about any group.`,
    `- The caption must NOT repeat the meme text. It adds one extra beat.`,
    ``,
    `Return ONLY compact JSON:`,
    `{`,
    `  "topText": string,       // the setup, or the whole one-liner. UPPERCASE.`,
    `  "bottomText": string,    // the punchline, or "" for a one-liner. UPPERCASE.`,
    `  "lane": one of ${JSON.stringify(brand.categories)},`,
    `  "captionLine": string,   // ONE short line, lowercase, adds to the joke`,
    `  "hashtags": string[],    // exactly 12, starting #forgebuzz #memes #relatable`,
    `  "photoKeyword": string   // 1-3 literal words for a stock photo, e.g. "tired cat"`,
    `}`,
    `If this premise cannot become a harmless funny meme, return {"skip": true}.`,
  ].join("\n");
}

function cleanLine(s: unknown, max = MAX_LINE): string {
  const t = String(s ?? "")
    .replace(/["“”]/g, "")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return clampHeadline(t, max).toUpperCase();
}

/** The FACTS lane prompt.
 *
 *  The single most important rule in this file: the model is handed a fact that
 *  is ALREADY VERIFIED (from lib/facts.ts, or a sourced subreddit) and may only
 *  rephrase it. It must never introduce a number, place, date or claim of its
 *  own, because an invented-but-believable fact posted unattended under the
 *  brand's name is the one failure this lane cannot afford.
 *
 *  Temperature is held low for the same reason — see writePost. */
function buildFactPrompt(p: Premise, forReel: boolean): string {
  const format = forReel
    ? `This is the on-screen text of a short video, so it is the first thing a viewer reads.`
    : `This is a single image post: bold text over a photo.`;
  return [
    `You write scroll-stopping fact hooks for "ForgeBuzz" (@forgee.buzz).`,
    format,
    ``,
    `VERIFIED FACT: "${p.premise}"`,
    ``,
    `Rewrite this fact as a hook in the style of:`,
    `  "JAPAN IS TURNING FOOTSTEPS INTO ELECTRICITY"`,
    `  "THERE IS A FOREST IN UTAH THAT IS ONE SINGLE TREE"`,
    `Short, present tense, declarative, and surprising. No punchline, no joke.`,
    ``,
    `CRITICAL ACCURACY RULES:`,
    `- Use ONLY what the fact above says. Do NOT add numbers, places, dates,`,
    `  names, causes or consequences that are not in it.`,
    `- Do NOT exaggerate or round figures to sound more impressive.`,
    `- If you cannot write an accurate hook from this fact alone, or the fact`,
    `  seems doubtful, return {"skip": true}. Skipping is always acceptable.`,
    ``,
    `FORMAT RULES:`,
    `- Each line MAX ${MAX_LINE} characters. No hashtags, emoji or quote marks.`,
    `- Split across topText and bottomText where it reads naturally, or put the`,
    `  whole hook in topText and leave bottomText empty.`,
    ``,
    `Return ONLY compact JSON:`,
    `{`,
    `  "topText": string,       // the hook, or its first half. UPPERCASE.`,
    `  "bottomText": string,    // the rest, or "". UPPERCASE.`,
    `  "lane": "FACTS",`,
    `  "captionLine": string,   // ONE line of the real detail, drawn from the fact`,
    `  "hashtags": string[],    // exactly 12, starting #forgebuzz #facts #didyouknow`,
    `  "photoKeyword": string   // 1-3 literal words for a stock photo`,
    `}`,
  ].join("\n");
}

async function geminiWrite(
  p: Premise,
  edge: HumorEdge,
  forReel: boolean,
): Promise<MemeContent | null> {
  const isFact = p.lane === FACT_LANE;
  // Facts get a near-deterministic temperature: creativity is exactly what
  // causes a model to embellish a claim. Jokes need the opposite.
  const parsed = isFact
    ? await generateJson(buildFactPrompt(p, forReel), 0.3)
    : await generateJson(buildPrompt(p, edge, forReel), 1.0);
  if (parsed.skip) return null; // the model judged it unusable

  const local = localDefaults(p);
  const topText = cleanLine(parsed.topText) || local.topText;
  const bottomText = cleanLine(parsed.bottomText); // "" is a valid one-liner
  const lane = String(parsed.lane || p.lane).toUpperCase();

  return {
    topText,
    bottomText,
    lane: (brand.categories as readonly string[]).includes(lane) ? lane : p.lane,
    captionLine: String(parsed.captionLine || local.captionLine).trim().slice(0, 120),
    cta: brand.caption.cta,
    hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length
      ? parsed.hashtags.slice(0, 12).map((h: string) => (String(h).startsWith("#") ? String(h) : "#" + h))
      : local.hashtags,
    photoKeyword: String(parsed.photoKeyword || p.photo).trim() || p.photo,
  };
}

/** Write a meme from a premise, or null if it should be skipped.
 *
 *  Returns null when Gemini cannot be reached. That deliberately leaves the
 *  day's queue shorter rather than posting a template-filled non-joke: on a
 *  meme page a bad post costs more than a missing one. */
export async function writeMeme(
  p: Premise,
  edge: HumorEdge = "pg13",
  forReel = false,
): Promise<MemeContent | null> {
  try {
    return await geminiWrite(p, edge, forReel);
  } catch (e) {
    console.warn(`[jokewriter] skipping premise: ${(e as Error).message}`);
    return null;
  }
}

/** The joke as one line, for the dashboard queue and the `headline` column. */
export function flattenJoke(c: MemeContent): string {
  return [c.topText, c.bottomText].filter(Boolean).join(" / ");
}

/** Assemble the full IG/FB caption. Memes keep it short — the card has the joke. */
export function assembleCaption(c: MemeContent): string {
  return [c.captionLine, "", c.cta, "", c.hashtags.join(" ")].join("\n").trim();
}
