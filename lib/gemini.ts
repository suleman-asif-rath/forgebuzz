// One place that talks to Gemini, used by the joke writer and the reviewer.
//
// It handles the three things that actually go wrong in production:
//   - a key being rate-limited (429)      -> roll to the next key
//   - the model being overloaded (503)    -> short backoff, then retry
//   - the model being retired for newer keys (404) -> fall back to another model
//
// That last one is not hypothetical: gemini-2.5-flash was retired for new API
// keys ("no longer available to new users"), which silently 404'd the newer
// keys in the rotation while the older ones kept working.

import { config } from "./config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Total attempts per call, across keys and models.
 *
 *  The free tier's limit is per-KEY and per-MINUTE (20 requests/min/key on
 *  gemini-3.6-flash; a 429 says "retry in ~36s"). Rotating to another key is
 *  therefore the right move — but only if we try enough of them. A fixed 5
 *  attempts meant a handful of recently-throttled keys could use up every
 *  attempt while healthy keys further round the rotation were never reached,
 *  and the premise was dropped for no good reason.
 *
 *  Still bounded, because generation runs inside a 60s serverless budget. */
const MAX_ATTEMPTS_CAP = 8;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// Round-robin pointer, shared across every caller, so quota spreads evenly.
let rotationIndex = 0;

/** Keys that recently hit their rate limit, and when they may be tried again.
 *  Without this, a run where most keys are throttled spends every attempt on
 *  keys that are already known to be refusing, and gives up with healthy keys
 *  left untouched. Cleared naturally as the cooldown expires. */
const coolingUntil = new Map<string, number>();
const COOLDOWN_MS = 60_000;

function isCooling(key: string): boolean {
  const until = coolingUntil.get(key);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    coolingUntil.delete(key);
    return false;
  }
  return true;
}

export class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function callOnce(
  model: string,
  key: string,
  prompt: string,
  temperature: number,
): Promise<unknown> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new GeminiError(`gemini ${res.status}`, res.status);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("gemini empty response", 0);
  return JSON.parse(text);
}

/** Ask Gemini for JSON. Returns the parsed object, or throws once every key and
 *  model has been exhausted. */
export async function generateJson(prompt: string, temperature: number): Promise<any> {
  const keys = config.gemini.keys;
  if (!keys.length) throw new GeminiError("no Gemini key configured", 0);

  const models = [config.gemini.model, config.gemini.fallbackModel].filter(
    (m, i, a) => m && a.indexOf(m) === i,
  );

  let lastErr: Error = new GeminiError("gemini: no attempt made", 0);
  let attempt = 0;
  // Reach as far round the key rotation as the budget allows.
  const maxAttempts = Math.min(Math.max(keys.length, 1), MAX_ATTEMPTS_CAP);
  // A 404 means the model is unavailable for that key, and trying the same
  // model on other keys is usually pointless — so a 404 jumps to the next model.
  for (const model of models) {
    for (let i = 0; i < keys.length && attempt < maxAttempts; i++) {
      const key = keys[(rotationIndex + i) % keys.length];
      if (isCooling(key)) continue; // throttled recently — don't waste an attempt
      attempt++;
      try {
        const out = await callOnce(model, key, prompt, temperature);
        rotationIndex = (rotationIndex + i + 1) % keys.length; // advance for next call
        return out;
      } catch (e) {
        lastErr = e as Error;
        const status = e instanceof GeminiError ? e.status : 0;
        if (status === 429) {
          coolingUntil.set(key, Date.now() + COOLDOWN_MS);
          continue; // another key is far more likely to work than this one
        }
        if (status === 404) break; // this model is gone for this key set
        // 429 already rotated above; this backoff is for real overload (5xx).
        if (RETRYABLE.has(status)) await sleep(300 * attempt);
      }
    }
    if (attempt >= maxAttempts) break;
  }
  throw lastErr;
}
