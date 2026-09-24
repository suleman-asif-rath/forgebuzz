// The embarrassment check: a second, cheap Gemini pass over the FINISHED joke,
// right before it queues.
//
// This exists because the page runs unattended at a PG-13 / chronically-online
// tone. The word blocklist catches known-bad terms; this catches the thing a
// word list cannot — a joke that is technically clean but mean, bleak, or
// simply embarrassing for a brand to post.
//
// Failure policy: if Gemini is unreachable, the joke is ALLOWED through. It has
// already passed the hard blocklist (lib/blocklist.ts) by this point, and a
// Gemini outage should not silence the page. Rejections are logged.

import { generateJson } from "./gemini";
import type { MemeContent } from "./types";

export interface Verdict {
  ok: boolean;
  reason?: string;
}

function buildPrompt(c: MemeContent): string {
  const meme = [c.topText, c.bottomText].filter(Boolean).join(" / ");
  return [
    `A brand's meme page is about to post this, with no human reviewing it first.`,
    ``,
    `MEME TEXT: "${meme}"`,
    `CAPTION: "${c.captionLine}"`,
    ``,
    `Would a reasonable person find this offensive, mean-spirited, bleak,`,
    `political, religious, sexual, about a real named person, or otherwise`,
    `embarrassing for a brand to post? Being unfunny is NOT a reason to reject.`,
    `Ordinary internet exaggeration ("I'm dead", "this is killing me") is fine.`,
    ``,
    `Return ONLY compact JSON: {"safe": boolean, "reason": string}`,
    `"reason" is a short phrase, and only matters when safe is false.`,
  ].join("\n");
}

/** Judge one finished meme. Returns { ok: true } when it is safe to post. */
export async function reviewMeme(c: MemeContent): Promise<Verdict> {
  try {
    // Deterministic: a safety judgement should not vary run to run.
    const parsed = await generateJson(buildPrompt(c), 0);
    if (parsed.safe === false) {
      return { ok: false, reason: String(parsed.reason || "flagged by reviewer") };
    }
    return { ok: true };
  } catch (e) {
    console.warn(`[reviewer] unavailable, allowing through: ${(e as Error).message}`);
    return { ok: true };
  }
}
