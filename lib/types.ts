// Shared shapes for the ForgeBuzz meme pipeline.

/** The one meme format the page posts: white impact text, top and/or bottom,
 *  over a full-bleed photo. Kept as a union so a second format (two-panel,
 *  text-card) can be added later without touching the queue schema. */
export type MemeFormat = "impact";

/** The humor lanes. Mirrors brand.categories — the pipeline reads the brand
 *  list, this type exists so lane strings are checkable at the edges. */
export const MEME_LANES = [
  "RELATABLE",
  "WORK",
  "SLEEP",
  "FOOD",
  "MONEY",
  "ANIMALS",
  "FACTS",
] as const;
export type MemeLane = (typeof MEME_LANES)[number];

/** The lane whose posts are verified facts rather than jokes. */
export const FACT_LANE = "FACTS";

/** A joke premise waiting to be written up. Comes either from the built-in seed
 *  bank (lib/premises.ts) or from Reddit titles used purely as inspiration
 *  (lib/memeFuel.ts) — we never fetch, store, or post anyone else's image. */
export interface Premise {
  /** For a joke lane: the situation the joke is about.
   *  For the FACTS lane: the VERIFIED fact itself. The writer may only
   *  rephrase this, never add to it — see buildFactPrompt in jokewriter.ts. */
  premise: string;
  lane: string; // humor lane, e.g. "SLEEP"
  photo: string; // hint for the stock photo the joke sits on
  source: string; // "seed bank" or "reddit r/Showerthoughts"
  url?: string; // where the spark came from, when there is one
  score: number; // relative priority within its source
  publishedAt?: string; // ISO, for Reddit fuel only
  evergreen: boolean; // seed-bank premises never go stale
}

/** The meme text + caption produced by the joke writer. */
export interface MemeContent {
  topText: string; // the setup. may be empty for a one-liner.
  bottomText: string; // the punchline. may be empty.
  lane: string; // uppercase lane, e.g. "WORK"
  captionLine: string; // ONE short line that adds to the joke
  cta: string;
  hashtags: string[];
  photoKeyword: string; // stock search term for the photo/clip
}

/** Everything the renderer needs to draw one meme. */
export interface MemeSpec {
  topText: string;
  bottomText: string;
  photoUrl?: string | null; // stock photo URL, or null -> gradient fallback
  /** true renders on a transparent background, for compositing onto a reel. */
  transparent?: boolean;
}

/** image = a still meme; reel = a short clip with the joke burned on. */
export type MediaKind = "image" | "reel";

/** A row in the post queue.
 *
 *  NOTE on column names: `category`, `template` and `headline` are the original
 *  Supabase columns from the news era. They are reused rather than renamed so
 *  the live table needs no migration and posted history stays readable:
 *    category -> the humor lane      template -> the meme format
 *    headline -> the joke as one line, for the dashboard queue view
 */
export interface PostRow {
  id: string;
  createdAt: string; // ISO
  scheduledFor: string; // ISO
  status: "queued" | "posted" | "failed";
  mediaType: MediaKind; // "image" (default) or "reel"
  category: string; // humor lane
  template: MemeFormat; // meme format
  headline: string; // the joke, flattened to one line (display only)
  caption: string; // full assembled IG/FB caption
  hashtags: string[];
  source: string;
  sourceUrl: string;
  topicFingerprint: string;
  imagePath: string; // local: /generated/<id>.png ; supabase: public URL
  imageUrl: string; // absolute URL usable by Meta (for a reel: the cover image)
  videoUrl?: string | null; // reels only: absolute URL of the mp4 Meta will fetch
  fbId?: string | null;
  igId?: string | null;
  error?: string | null;
}

// --- Settings (editable from the dashboard, read live by the pipeline) ---
export interface LaneSetting {
  enabled: boolean;
  weight: number; // 1 (rare) .. 5 (often); relative priority within enabled lanes
}

/** How sharp the humor is allowed to get. The hard lines (slurs, hate,
 *  politics, tragedy, sexual content, punching down) are absolute at EVERY
 *  level — this only moves the profanity/sarcasm dial. */
export type HumorEdge = "clean" | "pg13" | "sharp";

export interface Settings {
  postingEnabled: boolean; // master switch: false pauses ALL publishing
  postsPerDay: number; // 1..12
  // "fixed" posts at the exact slotHours; "variable" spreads posts at randomized
  // times across the day (different each day) for a more organic, less-automated feel.
  postingMode: "fixed" | "variable";
  slotHours: number[]; // fixed: exact posting hours; variable: the active window bounds
  timezone: string; // IANA tz, e.g. "Asia/Karachi"
  maxAgeHours: number; // Reddit fuel older than this is ignored (seeds are exempt)
  humorEdge: HumorEdge;
  categories: Record<string, LaneSetting>; // keyed by humor lane
  // where content comes from. seeds/reddit feed the joke lanes; facts feeds
  // the FACTS lane (its own bank plus sourced fact subreddits).
  fuel: { seeds: boolean; reddit: boolean; facts: boolean };
  voice: { cta: string; hashtagsCore: string[] };
  extraBlockedWords: string[]; // added to the built-in safety net
  reel: { enabled: boolean; perDay: number }; // up to N short reels/day (1..3)
}

export interface GenerateSummary {
  mode: "dry-run" | "live";
  picked: number;
  queued: PostRow[];
  skipped: string[];
}

export interface PublishSummary {
  mode: "dry-run" | "live" | "paused";
  due: number;
  posted: { id: string; fbId?: string | null; igId?: string | null }[];
  failed: { id: string; error: string }[];
}
