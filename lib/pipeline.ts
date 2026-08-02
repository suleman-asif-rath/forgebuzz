import { isDryRun } from "./config";
import { getSettings } from "./settings";
import { fetchAllTrends } from "./trends";
import { pickTrends } from "./filter";
import { writeCard, assembleCaption } from "./copywriter";
import { findBackground } from "./pexels";
import { findStockVideo } from "./stockVideo";
import { renderCardPng, renderReelCoverPng } from "./render";
import { getStore } from "./store";
import { publishBoth, publishReel } from "./meta";
import { scheduleTimes } from "./schedule";
import { newId, fingerprint } from "./util";
import type { GenerateSummary, PostRow, PublishSummary, Settings, Trend } from "./types";

export async function runGenerate(): Promise<GenerateSummary> {
  const store = getStore();
  const settings = await getSettings();
  const mode = isDryRun() ? "dry-run" : "live";

  const trends = await fetchAllTrends(settings.sources);
  const used = await store.getUsedFingerprints();
  const { picks, skipped } = pickTrends(trends, {
    count: settings.postsPerDay,
    usedFingerprints: used,
    categories: settings.categories,
    extraBlockedWords: settings.extraBlockedWords,
    maxAgeHours: settings.maxAgeHours,
  });

  const times = scheduleTimes(settings.slotHours, settings.timezone, picks.length);
  const rows: PostRow[] = [];

  for (let i = 0; i < picks.length; i++) {
    const t = picks[i];
    try {
      const content = await writeCard(t);
      if (!content) {
        skipped.push(`copywriter skipped: ${t.title}`);
        continue;
      }
      // Apply the dashboard voice settings.
      content.cta = settings.voice.cta;
      content.hashtags = [...new Set([...settings.voice.hashtagsCore, ...content.hashtags])].slice(0, 12);

      const backgroundUrl = await findBackground(content.backgroundKeyword);
      const png = await renderCardPng({
        template: content.template,
        category: content.category,
        headline: content.headline,
        stat: content.stat,
        source: t.source,
        backgroundUrl,
      });
      const id = newId();
      const { imagePath, imageUrl } = await store.saveImage(id, png);
      rows.push({
        id,
        createdAt: new Date().toISOString(),
        scheduledFor: times[i],
        status: "queued",
        mediaType: "image",
        category: content.category,
        template: content.template,
        headline: content.headline,
        caption: assembleCaption(content),
        hashtags: content.hashtags,
        source: t.source,
        sourceUrl: t.url,
        topicFingerprint: fingerprint(t.title),
        imagePath,
        imageUrl,
        fbId: null,
        igId: null,
        error: null,
      });
    } catch (e) {
      skipped.push(`render/failed: ${t.title} (${(e as Error).message})`);
    }
  }

  if (rows.length) await store.enqueue(rows);
  return { mode, picked: picks.length, queued: rows, skipped };
}

/** Day bucket (YYYY-MM-DD) in a timezone, for the "one reel a day" guard. */
function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export interface ReelSummary {
  mode: "live" | "dry-run" | "paused" | "skipped";
  reason?: string;
  id?: string;
  fbId?: string | null;
  igId?: string | null;
  errors?: string[];
}

/** Generate and (unless paused) post ONE reel. Called hourly by its own cron,
 *  which self-gates to the dashboard's reel hour; `force` bypasses the gate and
 *  the once-a-day guard (used for manual runs / verification). */
export async function runReel(force = false): Promise<ReelSummary> {
  const store = getStore();
  const settings = await getSettings();
  if (!settings.reel.enabled) return { mode: "skipped", reason: "reel disabled" };

  const now = new Date();
  const tz = settings.timezone;
  const hourNow = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).format(now),
  );
  if (!force && hourNow !== settings.reel.slotHour) {
    return { mode: "skipped", reason: `not reel hour (now ${hourNow}, want ${settings.reel.slotHour})` };
  }

  const today = dayKey(now, tz);
  const recent = await store.listRecent(40);
  const existing = recent.find(
    (r) => r.mediaType === "reel" && r.status !== "failed" && dayKey(new Date(r.createdAt), tz) === today,
  );
  if (!force && existing) return { mode: "skipped", reason: "reel already done today", id: existing.id };

  const trends = await fetchAllTrends(settings.sources);
  const used = await store.getUsedFingerprints();
  const row = await buildReelRow(settings, trends, used);
  if (!row) return { mode: "skipped", reason: "no fresh topic or clip found" };
  await store.enqueue([row]);

  if (!settings.postingEnabled) return { mode: "paused", id: row.id };
  if (isDryRun()) return { mode: "dry-run", id: row.id };

  const result = await publishReel(row.videoUrl as string, row.imageUrl, row.caption);
  if (!result.fbId && !result.igId) {
    await store.markFailed(row.id, result.errors.join(" | ") || "unknown");
    return { mode: "live", id: row.id, errors: result.errors };
  }
  await store.markPosted(row.id, { fbId: result.fbId, igId: result.igId });
  await store.markTopicUsed(row.topicFingerprint);
  return { mode: "live", id: row.id, fbId: result.fbId, igId: result.igId, errors: result.errors };
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Build a single reel PostRow: pick a fresh topic, find a vertical stock clip,
 *  re-host it, render a branded cover, and schedule it for the reel hour.
 *  Returns null if no fresh topic or no matching clip is available. */
async function buildReelRow(
  settings: Settings,
  trends: Trend[],
  usedFingerprints: Set<string>,
): Promise<PostRow | null> {
  const store = getStore();
  const { picks } = pickTrends(trends, {
    count: 1,
    usedFingerprints,
    categories: settings.categories,
    extraBlockedWords: settings.extraBlockedWords,
    maxAgeHours: settings.maxAgeHours,
  });
  const t = picks[0];
  if (!t) return null;

  const content = await writeCard(t);
  if (!content) return null;
  content.cta = settings.voice.cta;
  content.hashtags = [...new Set([...settings.voice.hashtagsCore, ...content.hashtags])].slice(0, 12);

  const clip = await findStockVideo(content.backgroundKeyword);
  if (!clip) return null;

  const id = newId();
  const mp4 = await downloadToBuffer(clip.url);
  const { videoUrl } = await store.saveVideo(id, mp4);
  const coverPng = await renderReelCoverPng({
    template: content.template,
    category: content.category,
    headline: content.headline,
    source: t.source,
  });
  const { imagePath, imageUrl } = await store.saveImage(id, coverPng);

  return {
    id,
    createdAt: new Date().toISOString(),
    scheduledFor: new Date().toISOString(),
    status: "queued",
    mediaType: "reel",
    category: content.category,
    template: content.template,
    headline: content.headline,
    caption: assembleCaption(content),
    hashtags: content.hashtags,
    source: t.source,
    sourceUrl: t.url,
    topicFingerprint: fingerprint(t.title),
    imagePath,
    imageUrl,
    videoUrl,
    fbId: null,
    igId: null,
    error: null,
  };
}

export async function runPublish(): Promise<PublishSummary> {
  const store = getStore();
  const settings = await getSettings();
  const due = await store.getDue(new Date().toISOString());

  // Master switch: paused means the queue keeps building but nothing is sent.
  if (!settings.postingEnabled) {
    return { mode: "paused", due: due.length, posted: [], failed: [] };
  }

  const mode = isDryRun() ? "dry-run" : "live";
  const posted: PublishSummary["posted"] = [];
  const failed: PublishSummary["failed"] = [];

  for (const row of due) {
    const result =
      row.mediaType === "reel" && row.videoUrl
        ? await publishReel(row.videoUrl, row.imageUrl, row.caption)
        : await publishBoth(row.imageUrl, row.caption);
    if (!result.fbId && !result.igId) {
      await store.markFailed(row.id, result.errors.join(" | ") || "unknown");
      failed.push({ id: row.id, error: result.errors.join(" | ") || "unknown" });
    } else {
      await store.markPosted(row.id, { fbId: result.fbId, igId: result.igId });
      await store.markTopicUsed(row.topicFingerprint);
      posted.push({ id: row.id, fbId: result.fbId, igId: result.igId });
    }
  }

  return { mode, due: due.length, posted, failed };
}
