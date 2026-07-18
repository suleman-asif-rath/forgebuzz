import { createHash } from "node:crypto";

/** Stable id for a post (time-sortable-ish + random suffix). */
export function newId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${t}${r}`;
}

/** Normalised fingerprint of a topic so near-duplicates de-dupe. */
export function fingerprint(title: string): string {
  const norm = title
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|of|to|in|on|for|and|is|are|new|this|that|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
  return createHash("sha1").update(norm).digest("hex").slice(0, 16);
}

export function titleCaseWords(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/** Trim a headline to a tweet-ish length without cutting mid-word. */
export function clampHeadline(s: string, max = 90): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).trim() + "…";
}

export function shuffle<T>(arr: T[], seed = 1): T[] {
  // Deterministic-ish shuffle so results are stable within a run.
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
