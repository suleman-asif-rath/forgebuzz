import brand from "@/brand/brand";
import { config } from "./config";
import type { CardContent, Trend, TemplateKind } from "./types";
import { clampHeadline } from "./util";

const STOP = new Set([
  "this", "that", "with", "from", "have", "will", "your", "just", "about",
  "into", "than", "then", "they", "them", "what", "when", "were", "been",
  "after", "over", "first", "could", "would", "these", "there", "here",
  "til", "the", "and", "for", "are", "but", "not", "you", "all", "new",
]);

function topicalHashtags(title: string, category: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP.has(w));
  const catTag = "#" + category.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const topical = words.slice(0, 6).map((w) => "#" + w);
  const all = [...brand.caption.hashtagsCore, catTag, ...topical];
  return [...new Set(all)].slice(0, brand.caption.hashtagsBySize);
}

function pickTemplate(t: Trend): TemplateKind {
  if (/\?\s*$/.test(t.title)) return "question";
  if (t.category === "DID YOU KNOW" && /\b\d/.test(t.title)) return "fact";
  return "headline";
}

/** Deterministic writer used when Gemini is off or fails. */
function localWrite(t: Trend): CardContent {
  const cleaned = t.title.replace(/^\s*(TIL that|TIL|PSA:)\s*/i, "").trim();
  const headline = clampHeadline(cleaned, 95);
  const template = pickTemplate(t);
  const kw =
    t.category === "SPACE" ? "galaxy space"
    : t.category === "TECH" ? "technology abstract"
    : t.category === "SPORTS" ? "stadium action"
    : t.category === "ENTERTAINMENT" ? "cinema lights"
    : t.category === "DID YOU KNOW" ? "abstract science"
    : "city lights night";
  return {
    headline,
    template,
    category: t.category,
    captionHook: headline,
    captionContext: `Spotted trending on ${t.source}.`,
    cta: brand.caption.cta,
    hashtags: topicalHashtags(t.title, t.category),
    backgroundKeyword: kw,
  };
}

function buildPrompt(t: Trend): string {
  return [
    `You write viral Instagram posts for "Cantagio" (@cantagio), a page sharing`,
    `light, positive, fascinating trending topics (pop culture, tech, sports,`,
    `entertainment, space, "did you know" facts). Tone: punchy, curious, upbeat,`,
    `never cynical, never political, never dark.`,
    ``,
    `TOPIC (from ${t.source}): "${t.title}"`,
    ``,
    `Return ONLY compact JSON with these fields:`,
    `{`,
    `  "headline": string,        // <= 90 chars, punchy, for a big card. No hashtags.`,
    `  "template": "headline" | "fact" | "question",`,
    `  "category": one of ${JSON.stringify(brand.categories)},`,
    `  "stat": string,            // ONLY for template "fact": the big number, e.g. "8 MIN". Else "".`,
    `  "captionHook": string,     // 1 line, may use ONE emoji`,
    `  "captionContext": string,  // 1-2 sentences of the interesting detail`,
    `  "cta": string,             // ask for a reaction (follow/comment/tag)`,
    `  "hashtags": string[],      // exactly 12, start with #cantagio #trending #didyouknow`,
    `  "backgroundKeyword": string // 1-3 words to find a matching stock photo`,
    `}`,
    `If the topic is sensitive, tragic, political or adult, return {"skip": true}.`,
  ].join("\n");
}

async function geminiWrite(t: Trend): Promise<CardContent | null> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent?key=${config.gemini.key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(t) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("gemini empty");
  const parsed = JSON.parse(text);
  if (parsed.skip) return null; // model judged it unsafe/off-brand
  // Merge with defaults so a missing field never breaks the renderer.
  const local = localWrite(t);
  return {
    headline: clampHeadline(String(parsed.headline || local.headline), 95),
    template: (parsed.template as TemplateKind) || local.template,
    category: String(parsed.category || local.category).toUpperCase(),
    stat: parsed.stat || undefined,
    captionHook: String(parsed.captionHook || local.captionHook),
    captionContext: String(parsed.captionContext || local.captionContext),
    cta: String(parsed.cta || brand.caption.cta),
    hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length
      ? parsed.hashtags.slice(0, 12).map((h: string) => (h.startsWith("#") ? h : "#" + h))
      : local.hashtags,
    backgroundKeyword: String(parsed.backgroundKeyword || local.backgroundKeyword),
  };
}

/** Returns card content, or null if the topic should be skipped. */
export async function writeCard(t: Trend): Promise<CardContent | null> {
  if (config.gemini.on) {
    try {
      return await geminiWrite(t);
    } catch (e) {
      console.warn(`[copywriter] gemini failed, using local writer: ${(e as Error).message}`);
    }
  }
  return localWrite(t);
}

/** Assemble the full IG/FB caption from content pieces. */
export function assembleCaption(c: CardContent): string {
  return [
    c.captionHook,
    "",
    c.captionContext,
    "",
    c.cta,
    "",
    c.hashtags.join(" "),
  ].join("\n").trim();
}
