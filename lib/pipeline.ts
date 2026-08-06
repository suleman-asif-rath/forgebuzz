import { isDryRun } from "./config";
import { getSettings } from "./settings";
import { fetchAllTrends } from "./trends";
import { pickTrends } from "./filter";
import { writeCard, assembleCaption } from "./copywriter";
import { findBackground } from "./pexels";
import { findStockVideo } from "./stockVideo";
import { pickMusicUrl } from "./music";
import { muxMusicOntoVideo } from "./mux";
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
  mode: "queued" | "skipped";
  reason?: string;
  id?: string;
}

/** Build ONE reel (stock clip + music + branded cover) and enqueue it. Called
 *  hourly by its own cron, which self-gates to the dashboard's reel hour; the
 *  workflow then triggers /api/publish to post it. Building and publishing are
 *  separate serverless calls so neither exceeds the time budget (video work is
 *  slow). `force` bypasses the hour gate and the once-a-day guard (manual runs). */
export async function runReel(force = false): Promise<ReelSummary> {
  const store = getStore();
  const settings = await getSettings();
  if (!settings.reel.enabled) return { mode: "skipped", reason: "reel disabled" };

  // Timing is controlled by the reel workflow's cron (a fixed evening slot), so
  // there's no hour gate here — just the one-reel-per-day guard.
  const now = new Date();
  const tz = settings.timezone;
  const today = dayKey(now, tz);
  const recent = await store.listRecent(40);
  const existing = recent.find(
    (r) => r.mediaType === "reel" && r.status !== "failed" && dayKey(new Date(r.createdAt), tz) === today,
  );
  if (!force && existing) return { mode: "skipped", reason: "reel already done today", id: existing.id };

  const trends = await fetchAllTrends(settings.sources);
  const used = await store.getUsedFingerprints();
  const { row, reason } = await buildReelRow(settings, trends, used);
  if (!row) return { mode: "skipped", reason: reason ?? "could not build a reel" };
  await store.enqueue([row]);
  return { mode: "queued", id: row.id };
}

/** Callbacks that persist each platform id the moment it lands (timeout-safe). */
function reelPersist(store: ReturnType<typeof getStore>, id: string) {
  return {
    fb: (fbId: string) => store.updatePostIds(id, { fbId }),
    ig: (igId: string) => store.updatePostIds(id, { igId }),
  };
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Build a single reel PostRow: pick a fresh topic, find a stock clip, re-host
 *  it, and render a branded cover. Tries several candidate topics so one
 *  unsafe/clip-less topic doesn't lose the day. Returns { row } on success, or
 *  { reason } explaining why nothing could be built. */
async function buildReelRow(
  settings: Settings,
  trends: Trend[],
  usedFingerprints: Set<string>,
): Promise<{ row?: PostRow; reason?: string }> {
  const store = getStore();
  const { picks } = pickTrends(trends, {
    count: 8, // several candidates; we use the first that yields a clip
    usedFingerprints,
    categories: settings.categories,
    extraBlockedWords: settings.extraBlockedWords,
    maxAgeHours: settings.maxAgeHours,
  });
  if (!picks.length) return { reason: "no fresh topic passed the filter" };

  let sawTopic = false;
  for (const t of picks) {
    const content = await writeCard(t);
    if (!content) continue; // topic judged unsafe/off-brand — try the next
    sawTopic = true;
    content.cta = settings.voice.cta;
    content.hashtags = [...new Set([...settings.voice.hashtagsCore, ...content.hashtags])].slice(0, 12);

    const clip = await findStockVideo(content.backgroundKeyword);
    if (!clip) continue; // no footage for this topic — try the next

    const id = newId();
    const rawClip = await downloadToBuffer(clip.url);
    // Mix in calming background music. If anything fails, fall back to the
    // silent clip so the day's reel still goes out.
    let finalVideo = rawClip;
    try {
      const musicUrl = pickMusicUrl();
      if (musicUrl) {
        const music = await downloadToBuffer(musicUrl);
        finalVideo = await muxMusicOntoVideo(rawClip, music, clip.duration);
      }
    } catch (e) {
      console.warn(`[reel] music mix failed, using silent clip: ${(e as Error).message}`);
      finalVideo = rawClip;
    }
    const { videoUrl } = await store.saveVideo(id, finalVideo);
    const coverPng = await renderReelCoverPng({
      template: content.template,
      category: content.category,
      headline: content.headline,
      source: t.source,
    });
    const { imagePath, imageUrl } = await store.saveImage(id, coverPng);

    return {
      row: {
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
      },
    };
  }
  return { reason: sawTopic ? "topics found but no stock clip matched" : "all candidate topics were filtered out" };
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
        ? await publishReel(
            row.videoUrl,
            row.imageUrl,
            row.caption,
            { fbId: row.fbId, igId: row.igId },
            reelPersist(store, row.id),
          )
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
