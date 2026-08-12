// Shared shapes for the ForgeBuzz pipeline.

export type TemplateKind = "headline" | "fact" | "question";

/** A raw candidate topic pulled from a trend source. */
export interface Trend {
  title: string;
  source: string; // e.g. "reddit r/space", "Hacker News"
  url: string;
  score: number; // relative popularity within its source
  category: string; // mapped ForgeBuzz category (e.g. "SPACE")
  publishedAt?: string; // ISO time the item was published, when the source gives it
  evergreen?: boolean; // timeless (facts/trivia): exempt from the freshness filter
}

/** The card + caption content produced by the copywriter. */
export interface CardContent {
  headline: string; // short, punchy, for the Anton card headline
  template: TemplateKind;
  category: string; // uppercase pill text, e.g. "TRENDING"
  stat?: string; // for "fact" cards: the big number, e.g. "8 MIN"
  captionHook: string;
  captionContext: string;
  cta: string;
  hashtags: string[];
  backgroundKeyword: string; // Pexels search term for the photo
}

/** Everything the renderer needs to draw one card. */
export interface CardSpec {
  template: TemplateKind;
  category: string;
  headline: string;
  stat?: string;
  source?: string;
  backgroundUrl?: string | null; // Pexels photo URL, or null -> gradient
}

/** image = a still card; reel = a short stock video with the card as its cover. */
export type MediaKind = "image" | "reel";

/** A row in the post queue. */
export interface PostRow {
  id: string;
  createdAt: string; // ISO
  scheduledFor: string; // ISO
  status: "queued" | "posted" | "failed";
  mediaType: MediaKind; // "image" (default) or "reel"
  category: string;
  template: TemplateKind;
  headline: string;
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
export interface CategorySetting {
  enabled: boolean;
  weight: number; // 1 (rare) .. 5 (often); relative priority within enabled cats
}

export interface Settings {
  postingEnabled: boolean; // master switch: false pauses ALL publishing
  postsPerDay: number; // 1..12
  slotHours: number[]; // posting hours in `timezone`, e.g. [9,12,15,18,21]
  timezone: string; // IANA tz, e.g. "Asia/Karachi"
  maxAgeHours: number; // news-like topics older than this are dropped (facts exempt)
  categories: Record<string, CategorySetting>; // keyed by brand category
  sources: { reddit: boolean; rss: boolean; hackernews: boolean; googlenews: boolean };
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
