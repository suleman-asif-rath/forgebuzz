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

/** Attempts allowed on EACH model before moving to the next one.
 *
 *  The free tier's real limit is `GenerateRequestsPerDayPerProjectPerModel`:
 *  20 requests per DAY, per key, per model. Two consequences shape this file:
 *
 *   1. Rotating keys helps (each key is its own project), and rotating MODELS
 *      helps just as much, because each model has its own separate allowance.
 *      10 keys x 2 models is ~400 requests a day, which is ample for the
 *      handful of posts this page makes.
 *   2. The budget must be PER MODEL. A global attempt budget was spent
 *      entirely on the first model's exhausted keys, so the fallback model —
 *      sitting there with its whole daily allowance untouched — was never
 *      reached, and the premise was dropped.
 *
 *  Still bounded overall, because generation runs in a 60s serverless budget. */
const ATTEMPTS_PER_MODEL = 4;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// Round-robin pointer, shared across every caller, so quota spreads evenly.
let rotationIndex = 0;

/** Key+model pairs that recently hit their quota, and when to try them again.
 *  Keyed by BOTH because the quota is per key per model: a key that is spent
 *  on one model may still have its full allowance on another. Cleared
 *  naturally as the cooldown expires. */
const coolingUntil = new Map<string, number>();
const coolKey = (model: string, key: string) => `${model}::${key}`;
// The quota is daily, but a serverless process is short-lived, so this only
// needs to stop one run from hammering a key it has already seen refuse.
const COOLDOWN_MS = 45_000;

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

  // Prefer keys that are not cooling — but if EVERY key is cooling, still try
  // them rather than give up having made no request at all. Skipping the whole
  // rotation was silently dropping every premise for a full minute once a
  // burst had throttled all the keys: the caller saw "no attempt made" and
  // treated it as an unwritable premise.
  const rotated = keys.map((_, i) => keys[(rotationIndex + i) % keys.length]);

  // A 404 means the model is unavailable for that key, and trying the same
  // model on other keys is usually pointless — so a 404 jumps to the next model.
  for (const model of models) {
    const available = rotated.filter((k) => !isCooling(coolKey(model, k)));
    const order = available.length ? available : rotated;
    let modelAttempts = 0;
    for (let i = 0; i < order.length && modelAttempts < ATTEMPTS_PER_MODEL; i++) {
      const key = order[i];
      modelAttempts++;
      attempt++;
      try {
        const out = await callOnce(model, key, prompt, temperature);
        // Advance past the key that worked, so load spreads on the next call.
        rotationIndex = (keys.indexOf(key) + 1) % keys.length;
        return out;
      } catch (e) {
        lastErr = e as Error;
        const status = e instanceof GeminiError ? e.status : 0;
        if (status === 429) {
          // Spent for the day on THIS model; another key, or this same key on
          // the fallback model, is far more likely to work.
          coolingUntil.set(coolKey(model, key), Date.now() + COOLDOWN_MS);
          continue;
        }
        if (status === 404) break; // this model is gone for this key set
        // 429 already rotated above; this backoff is for real overload (5xx).
        if (RETRYABLE.has(status)) await sleep(300 * attempt);
      }
    }
  }
  throw lastErr;
}
