import { isDryRun } from "./config";
import { getSettings } from "./settings";
import { gatherPremises, pickPremises } from "./ideas";
import { writeMeme, assembleCaption, flattenJoke } from "./jokewriter";
import { reviewMeme } from "./reviewer";
import { isUnsafeOutput } from "./blocklist";
import { findBackground } from "./pexels";
import { findStockVideo } from "./stockVideo";
import { pickMusicUrl } from "./music";
import { buildReel } from "./mux";
import { renderMemePng, renderMemeOverlayPng, renderReelCoverPng } from "./render";
import { getStore } from "./store";
import { publishBoth, publishReel } from "./meta";
import { scheduleTimes, assignPostTimes } from "./schedule";
import { publishOutcome } from "./publishPolicy";
import { newId, fingerprint } from "./util";
import type {
  GenerateSummary,
  LaneSetting,
  MemeContent,
  Premise,
  PostRow,
  PublishSummary,
  Settings,
} from "./types";

/** Serverless runs are capped at 60s. Stop starting new work past this so the
 *  posts already built get written to the queue instead of the whole run
 *  timing out with nothing to show. */
const TIME_BUDGET_MS = 45_000;

/** Write a joke and put it through both safety nets.
 *  Returns null when the premise should be abandoned and the next one tried. */
async function safeWrite(
  p: Premise,
  settings: Settings,
  forReel: boolean,
  skipped: string[],
): Promise<MemeContent | null> {
  const content = await writeMeme(p, settings.humorEdge, forReel);
  if (!content) {
    skipped.push(`writer skipped: ${p.premise}`);
    return null;
  }

  // Net 1: the word blocklist, over the finished joke.
  const joke = `${content.topText} ${content.bottomText} ${content.captionLine}`;
  if (isUnsafeOutput(joke, settings.humorEdge, settings.extraBlockedWords)) {
    skipped.push(`blocked (output): ${flattenJoke(content)}`);
    return null;
  }

  // Net 2: would this embarrass the brand? The page posts unattended, so this
  // catches what a word list cannot.
  const verdict = await reviewMeme(content);
  if (!verdict.ok) {
    skipped.push(`reviewer rejected (${verdict.reason}): ${flattenJoke(content)}`);
    return null;
  }

  // Apply the dashboard voice settings.
  content.cta = settings.voice.cta;
  content.hashtags = [...new Set([...settings.voice.hashtagsCore, ...content.hashtags])].slice(0, 12);
  return content;
}

/** Write, vet, illustrate and store one image meme.
 *  Returns null when the premise fell through any net — the caller just moves
 *  on to the next candidate. */
async function buildImageRow(
  p: Premise,
  settings: Settings,
  skipped: string[],
): Promise<PostRow | null> {
  try {
    const content = await safeWrite(p, settings, false, skipped);
    if (!content) return null;

    const photoUrl = await findBackground(content.photoKeyword);
    const png = await renderMemePng({
      topText: content.topText,
      bottomText: content.bottomText,
      photoUrl,
    });
    const id = newId();
    const { imagePath, imageUrl } = await getStore().saveImage(id, png);
    return {
      id,
      createdAt: new Date().toISOString(),
      scheduledFor: "", // filled in by the caller, once the day's count is known
      status: "queued",
      mediaType: "image",
      category: content.lane,
      template: "impact",
      headline: flattenJoke(content),
      caption: assembleCaption(content),
      hashtags: content.hashtags,
      source: p.source,
      sourceUrl: p.url ?? "",
      topicFingerprint: fingerprint(p.premise),
      imagePath,
      imageUrl,
      fbId: null,
      igId: null,
      error: null,
    };
  } catch (e) {
    skipped.push(`render failed: ${p.premise} (${(e as Error).message})`);
    return null;
  }
}

/** How many image memes one invocation will build. A full day does not fit in a
 *  single 60s serverless run — two Gemini calls, a photo lookup, a render and
 *  an upload per post adds up — so generation is incremental: the workflow
 *  calls /api/generate repeatedly until the day is full. */
const MAX_PER_RUN = 3;

export async function runGenerate(): Promise<GenerateSummary> {
  const started = Date.now();
  const store = getStore();
  const settings = await getSettings();
  const mode = isDryRun() ? "dry-run" : "live";

  // What is already in place for today? Repeated calls top the day up rather
  // than starting over, and a re-run after the day is full does nothing.
  const tz = settings.timezone;
  const today = dayKey(new Date(), tz);
  const recent = await store.listRecent(60);
  const todayImages = recent.filter(
    (r) => r.mediaType === "image" && r.status !== "failed" && dayKey(new Date(r.createdAt), tz) === today,
  );
  const alreadyDone = todayImages.length;
  const remaining = Math.max(0, settings.postsPerDay - alreadyDone);
  if (remaining === 0) {
    return { mode, picked: 0, queued: [], skipped: [`day already full (${alreadyDone}/${settings.postsPerDay})`] };
  }
  const buildTarget = Math.min(remaining, MAX_PER_RUN);

  const premises = await gatherPremises(settings.fuel);
  const used = await store.getUsedFingerprints();

  // Skip premises already queued today, so a second run doesn't repeat one.
  const queuedToday = new Set(todayImages.map((r) => r.topicFingerprint));
  const seen = new Set<string>([...used, ...queuedToday]);

  // Over-fetch candidates: the writer and the two safety nets both reject, so
  // asking for exactly the target would quietly under-fill the day.
  const { picks, skipped } = pickPremises(premises, {
    count: buildTarget * 4,
    usedFingerprints: seen,
    lanes: settings.categories,
    extraBlockedWords: settings.extraBlockedWords,
    maxAgeHours: settings.maxAgeHours,
  });

  // Built in parallel waves. Done one at a time, a full day of posts does not
  // fit in a 60s serverless run — each post is two Gemini calls, a photo
  // lookup, a render and an upload. Three at a time keeps memory and CPU sane
  // while cutting the wall-clock to roughly a third.
  const CONCURRENCY = 3;
  const rows: PostRow[] = [];
  let next = 0;
  while (rows.length < buildTarget && next < picks.length) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      skipped.push("time budget reached; queuing what was built");
      break;
    }
    const need = buildTarget - rows.length;
    const wave = picks.slice(next, next + Math.min(need, CONCURRENCY));
    next += wave.length;
    const built = await Promise.all(wave.map((p) => buildImageRow(p, settings, skipped)));
    for (const r of built) {
      if (r && rows.length < buildTarget) rows.push(r);
    }
  }

  // The day's full slot list is stable across runs (see lib/schedule.ts), so
  // this batch simply takes the slots after the ones already handed out.
  const times = scheduleTimes(
    settings.slotHours,
    settings.timezone,
    settings.postsPerDay,
    settings.postingMode,
  );
  assignPostTimes(rows, times, alreadyDone);

  if (rows.length) await store.enqueue(rows);
  return { mode, picked: rows.length, queued: rows, skipped };
}

/** Day bucket (YYYY-MM-DD) in a timezone, for the daily reel cap. */
function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// The UTC hours the reel workflow (reel.yml) fires at. MUST stay in sync with
// that cron. Used by variable-timing odds and by the daily cap spreading.
const REEL_SLOT_UTC = [5, 8, 11, 14, 16]; // 10:00/13:00/16:00/19:00/21:00 PKT

export interface ReelSummary {
  mode: "queued" | "skipped";
  reason?: string;
  id?: string;
}

/** Build ONE meme reel (stock clip + joke burned on + music) and enqueue it.
 *  Called at fixed cron slots, which self-gate to the dashboard's reels-per-day
 *  cap; the workflow then triggers /api/publish to post it. Building and
 *  publishing stay separate serverless calls so neither exceeds the time
 *  budget. `force` bypasses the gates for a manual run. */
export async function runReel(force = false): Promise<ReelSummary> {
  const store = getStore();
  const settings = await getSettings();
  if (!settings.reel.enabled) return { mode: "skipped", reason: "reel disabled" };

  const now = new Date();
  const tz = settings.timezone;
  const today = dayKey(now, tz);
  const recent = await store.listRecent(60);
  const todayReels = recent.filter(
    (r) => r.mediaType === "reel" && r.status !== "failed" && dayKey(new Date(r.createdAt), tz) === today,
  );
  if (!force && todayReels.length >= settings.reel.perDay) {
    return { mode: "skipped", reason: `daily reel limit reached (${todayReels.length}/${settings.reel.perDay})` };
  }

  // Variable timing: the reel workflow fires at several candidate slots; build
  // at a random subset so reel times differ day to day. The needed/remaining
  // odds still reliably hit `perDay` by the last slot (which forces a build).
  if (!force && settings.postingMode === "variable") {
    const utcHour = now.getUTCHours();
    const remaining = Math.max(1, REEL_SLOT_UTC.filter((h) => h >= utcHour).length);
    const needed = settings.reel.perDay - todayReels.length;
    if (Math.random() >= needed / remaining) {
      return { mode: "skipped", reason: `variable timing: holding this slot (${needed} left / ${remaining} slots)` };
    }
  }

  const premises = await gatherPremises(settings.fuel);
  const used = await store.getUsedFingerprints();
  const { row, reason } = await buildReelRow(settings, premises, used);
  if (!row) return { mode: "skipped", reason: reason ?? "could not build a reel" };
  await store.enqueue([row]);
  return { mode: "queued", id: row.id };
}

/** Callbacks that persist each platform id the moment it lands (timeout-safe). */
function platformPersist(store: ReturnType<typeof getStore>, id: string) {
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

// How well each lane tends to work as a short reel. Used only for reel premise
// selection, so reels lean into the most shareable lanes without changing the
// user's image-post weights. Disabled lanes are still respected.
const REEL_VIRALITY: Record<string, number> = {
  FACTS: 5, // fact hooks are the strongest reel format on IG right now
  ANIMALS: 5,
  RELATABLE: 5,
  SLEEP: 4,
  FOOD: 4,
  WORK: 3,
  MONEY: 3,
};

function biasLanesForReels(lanes: Record<string, LaneSetting>): Record<string, LaneSetting> {
  const out: Record<string, LaneSetting> = {};
  for (const [lane, s] of Object.entries(lanes)) {
    out[lane] = { enabled: s.enabled, weight: REEL_VIRALITY[lane] ?? s.weight };
  }
  return out;
}

/** Build a single reel PostRow. Tries several candidate premises so one
 *  rejected joke or clip-less keyword doesn't lose the slot. */
async function buildReelRow(
  settings: Settings,
  premises: Premise[],
  usedFingerprints: Set<string>,
): Promise<{ row?: PostRow; reason?: string }> {
  const store = getStore();
  const { picks } = pickPremises(premises, {
    count: 8, // several candidates; we use the first that yields a clip
    usedFingerprints,
    lanes: biasLanesForReels(settings.categories),
    extraBlockedWords: settings.extraBlockedWords,
    maxAgeHours: settings.maxAgeHours,
  });
  if (!picks.length) return { reason: "no premise passed the filter" };

  const skipped: string[] = [];
  let sawJoke = false;

  for (const p of picks) {
    // Find the footage BEFORE writing anything. Writing costs two Gemini calls
    // (the writer and the reviewer), and the free tier allows only about 25
    // requests a day per key, so spending them on a premise that then turns out
    // to have no matching clip is the most wasteful thing this pipeline can do.
    // The premise's own photo hint is a good enough search term for this.
    const clip = await findStockVideo(p.photo);
    if (!clip) continue; // no footage for this premise — try the next

    const content = await safeWrite(p, settings, true, skipped);
    if (!content) continue;
    sawJoke = true;

    const id = newId();
    const rawClip = await downloadToBuffer(clip.url);
    const overlay = await renderMemeOverlayPng({
      topText: content.topText,
      bottomText: content.bottomText,
      transparent: true,
    });

    // Music is a nice-to-have; a silent reel still goes out.
    let music: Buffer | null = null;
    try {
      const musicUrl = pickMusicUrl();
      if (musicUrl) music = await downloadToBuffer(musicUrl);
    } catch (e) {
      console.warn(`[reel] music fetch failed, continuing silent: ${(e as Error).message}`);
    }

    // Burn the joke on. If ffmpeg fails entirely we cannot post a meme reel —
    // the joke would be invisible — so fall through to the next candidate.
    let built;
    try {
      built = await buildReel(rawClip, music, overlay, clip.duration);
    } catch (e) {
      console.warn(`[reel] build failed: ${(e as Error).message}`);
      continue;
    }

    const { videoUrl } = await store.saveVideo(id, built.mp4);
    // The cover is a real frame of the finished reel, so the grid thumbnail
    // shows the actual meme. Fall back to a rendered card if that failed.
    let coverPng = built.cover;
    if (!coverPng?.length) {
      coverPng = await renderReelCoverPng({
        topText: content.topText,
        bottomText: content.bottomText,
        photoUrl: null,
      });
    }
    const { imagePath, imageUrl } = await store.saveImage(id, coverPng);

    return {
      row: {
        id,
        createdAt: new Date().toISOString(),
        scheduledFor: new Date().toISOString(),
        status: "queued",
        mediaType: "reel",
        category: content.lane,
        template: "impact",
        headline: flattenJoke(content),
        caption: assembleCaption(content),
        hashtags: content.hashtags,
        source: p.source,
        sourceUrl: p.url ?? "",
        topicFingerprint: fingerprint(p.premise),
        imagePath,
        imageUrl,
        videoUrl,
        fbId: null,
        igId: null,
        error: null,
      },
    };
  }

  return {
    reason: sawJoke
      ? `clips found but no joke survived (${skipped.slice(0, 2).join("; ")})`
      : "no candidate premise had matching stock footage",
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
    const persist = platformPersist(store, row.id);
    const result =
      row.mediaType === "reel" && row.videoUrl
        ? await publishReel(
            row.videoUrl,
            row.imageUrl,
            row.caption,
            { fbId: row.fbId, igId: row.igId },
            persist,
          )
        : await publishBoth(row.imageUrl, row.caption, { fbId: row.fbId, igId: row.igId }, persist);

    if (!result.fbId && !result.igId) {
      await store.markFailed(row.id, result.errors.join(" | ") || "unknown");
      failed.push({ id: row.id, error: result.errors.join(" | ") || "unknown" });
      continue;
    }

    // A post is only DONE when it reached both platforms. Marking it posted on
    // a one-sided success is how reels ended up on Facebook but never on
    // Instagram: IG's transcode can outlast the run's time budget, and the row
    // was then closed for good. Leaving it queued lets the next publish run
    // finish the missing half — safely, because both publishers skip a platform
    // that already has an id.
    const outcome = publishOutcome({
      fbId: result.fbId,
      igId: result.igId,
      createdAt: row.createdAt,
    });

    if (outcome === "done" || outcome === "accept-partial") {
      await store.markPosted(row.id, { fbId: result.fbId, igId: result.igId });
      await store.markTopicUsed(row.topicFingerprint);
      posted.push({ id: row.id, fbId: result.fbId, igId: result.igId });
      if (outcome === "accept-partial") {
        console.warn(
          `[publish] ${row.id} only reached ${result.fbId ? "Facebook" : "Instagram"} ` +
            `within the retry window; accepting it. ${result.errors.join(" | ")}`,
        );
      }
    } else {
      // Stays queued and still due, so the next run (every 20 min) retries the
      // missing platform. The id that already landed is persisted, so the
      // platform that worked is never posted to twice.
      console.warn(
        `[publish] ${row.id} reached ${result.fbId ? "Facebook" : "Instagram"} only — ` +
          `leaving queued to retry the other. ${result.errors.join(" | ")}`,
      );
    }
  }

  return { mode, due: due.length, posted, failed };
}
