import { config, isDryRun } from "./config";
import { fetchAllTrends } from "./trends";
import { pickTrends } from "./filter";
import { writeCard, assembleCaption } from "./copywriter";
import { findBackground } from "./pexels";
import { renderCardPng } from "./render";
import { getStore } from "./store";
import { publishBoth } from "./meta";
import { newId, fingerprint } from "./util";
import type { GenerateSummary, PostRow, PublishSummary } from "./types";

// Posting slots across the day (server-local hours). The morning "generate"
// run fills these; the hourly "publish" run sends whichever are due.
const SLOT_HOURS = [9, 11, 13, 15, 17, 19, 21];

function scheduleTimes(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const h = SLOT_HOURS[i % SLOT_HOURS.length];
    const d = new Date(now);
    d.setHours(h, 0, 0, 0);
    // If a slot already passed today it stays in the past, so publish picks it
    // up immediately (good for a first run / catch-up).
    out.push(d.toISOString());
  }
  return out;
}

export async function runGenerate(): Promise<GenerateSummary> {
  const store = getStore();
  const mode = isDryRun() ? "dry-run" : "live";

  const trends = await fetchAllTrends();
  const used = await store.getUsedFingerprints();
  const { picks, skipped } = pickTrends(trends, {
    count: config.postsPerDay,
    usedFingerprints: used,
  });

  const times = scheduleTimes(picks.length);
  const rows: PostRow[] = [];

  for (let i = 0; i < picks.length; i++) {
    const t = picks[i];
    try {
      const content = await writeCard(t);
      if (!content) {
        skipped.push(`copywriter skipped: ${t.title}`);
        continue;
      }
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

export async function runPublish(): Promise<PublishSummary> {
  const store = getStore();
  const mode = isDryRun() ? "dry-run" : "live";
  const due = await store.getDue(new Date().toISOString());

  const posted: PublishSummary["posted"] = [];
  const failed: PublishSummary["failed"] = [];

  for (const row of due) {
    const result = await publishBoth(row.imageUrl, row.caption);
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
