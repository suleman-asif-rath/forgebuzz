// Instagram + Facebook publisher. Adapted from the battle-tested Dopa Break
// autopilot: Graph API v23.0, token in the Authorization header, code-190
// expiry detection, retry on 5xx/429 only. ForgeBuzz v1 posts single images.
//
// The Page token is read at runtime: a Supabase-stored secret (so it can be
// rotated instantly without a redeploy) takes priority over the env var.

import { config, isDryRun } from "./config";
import { getStore } from "./store";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function api() {
  return `https://graph.facebook.com/${config.meta.apiVersion}`;
}

/** Live Page token: Supabase secret if set, else the META_PAGE_TOKEN env var. */
async function getMetaToken(): Promise<string> {
  try {
    const stored = await getStore().getSecret("META_PAGE_TOKEN");
    if (stored) return stored;
  } catch {
    /* fall back to env */
  }
  return config.meta.token;
}

async function call(
  path: string,
  params: Record<string, string>,
  token: string,
  method: "POST" | "GET" = "POST",
): Promise<any> {
  const qs = new URLSearchParams(params);
  const base = api();
  const url =
    method === "GET" ? `${base}/${path}${path.includes("?") ? "&" : "?"}${qs}` : `${base}/${path}`;
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: method === "POST" ? qs : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && !json.error) return json;
      let message = `${method} ${path}: ${res.status} ${JSON.stringify(json.error ?? json)}`;
      if (json.error?.code === 190) {
        message =
          `Meta token expired or invalid (code 190). Rotate the Page token ` +
          `(dashboard/API) — it's stored in Supabase now. ${message}`;
      }
      lastErr = new Error(message);
      if (res.status < 500 && res.status !== 429) break; // client errors won't heal
    } catch (e) {
      lastErr = e as Error;
    }
    if (attempt === 1) await sleep(5000);
  }
  throw lastErr ?? new Error("meta call failed");
}

/** Post a single image to the Facebook Page. Returns the post id. */
export async function postFacebookImage(imageUrl: string, caption: string, token: string): Promise<string> {
  const r = await call(`${config.meta.fbPageId}/photos`, { url: imageUrl, message: caption }, token);
  return r.post_id ?? r.id;
}

/** Wait for an IG media container to finish processing before publishing.
 *  Large photos and videos take time; publishing too early fails. Kept short so
 *  the whole publish stays inside the serverless time budget — an occasional
 *  "not ready in time" just leaves the item queued for the next hourly run. */
async function waitForContainer(
  id: string,
  token: string,
  attempts = 20,
  intervalMs = 3000,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const r = await call(`${id}?fields=status_code`, {}, token, "GET");
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR") throw new Error(`IG container ${id} failed processing`);
    await sleep(intervalMs);
  }
  throw new Error(`IG container ${id} not ready in time`);
}

/** Post a single image to Instagram (create container -> wait -> publish). */
export async function postInstagramImage(imageUrl: string, caption: string, token: string): Promise<string> {
  const container = await call(`${config.meta.igUserId}/media`, { image_url: imageUrl, caption }, token);
  await waitForContainer(container.id, token);
  return (await call(`${config.meta.igUserId}/media_publish`, { creation_id: container.id }, token)).id;
}

/** Post a Reel to Instagram: create a REELS container (video + branded cover),
 *  wait for it to finish processing, then publish. Kept within a tight time
 *  budget so it fits a serverless run. */
export async function postInstagramReel(
  videoUrl: string,
  coverUrl: string | null,
  caption: string,
  token: string,
): Promise<string> {
  const params: Record<string, string> = {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
  };
  if (coverUrl) params.cover_url = coverUrl;
  const container = await call(`${config.meta.igUserId}/media`, params, token);
  await waitForContainer(container.id, token, 14, 3000); // ~42s cap for video
  return (await call(`${config.meta.igUserId}/media_publish`, { creation_id: container.id }, token)).id;
}

/** Wait for an uploaded FB reel to finish transferring before we publish it. */
async function waitForFbReel(videoId: string, token: string, attempts = 12, intervalMs = 3000): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const r = await call(`${videoId}?fields=status`, {}, token, "GET");
    const up = r?.status?.uploading_phase?.status;
    const vs = r?.status?.video_status;
    if (up === "complete" || vs === "ready" || vs === "upload_complete") return;
    if (up === "error" || vs === "error") throw new Error(`FB reel ${videoId} upload error`);
    await sleep(intervalMs);
  }
  // Not confirmed complete, but the finish call below will surface a real error
  // if it truly isn't ready — so fall through rather than failing hard here.
}

/** Post a Reel to the Facebook Page using the three-phase video_reels flow:
 *  start (get an upload target) -> upload the hosted mp4 -> finish/publish. */
export async function postFacebookReel(videoUrl: string, caption: string, token: string): Promise<string> {
  // 1. start — reserve a video id + upload url
  const start = await call(`${config.meta.fbPageId}/video_reels`, { upload_phase: "start" }, token);
  const videoId: string = start.video_id;
  const uploadUrl: string = start.upload_url;
  if (!videoId || !uploadUrl) throw new Error(`FB reel start failed: ${JSON.stringify(start)}`);

  // 2. upload — hand Meta the hosted file URL to pull (non-resumable upload)
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_url: videoUrl },
    signal: AbortSignal.timeout(90_000),
  });
  const upJson = await up.json().catch(() => ({}));
  if (!up.ok || upJson.success === false) {
    throw new Error(`FB reel upload: ${up.status} ${JSON.stringify(upJson)}`);
  }

  // 3. wait until the transfer is done, then publish
  await waitForFbReel(videoId, token);
  await call(
    `${config.meta.fbPageId}/video_reels`,
    { upload_phase: "finish", video_id: videoId, video_state: "PUBLISHED", description: caption },
    token,
  );
  return videoId;
}

export interface PublishResult {
  fbId?: string | null;
  igId?: string | null;
  errors: string[];
}

/** Publish one post to both platforms. In dry-run, logs instead of posting. */
export async function publishBoth(imageUrl: string, caption: string): Promise<PublishResult> {
  if (isDryRun()) {
    console.log(
      `[dry-run] would post image ${imageUrl}\n  caption: ${caption.slice(0, 90).replace(/\n/g, " ")}...`,
    );
    return { fbId: "dryrun-fb", igId: "dryrun-ig", errors: [] };
  }
  const token = await getMetaToken();
  const errors: string[] = [];
  let fbId: string | null = null;
  let igId: string | null = null;
  try {
    fbId = await postFacebookImage(imageUrl, caption, token);
  } catch (e) {
    errors.push(`FB: ${(e as Error).message}`);
  }
  try {
    igId = await postInstagramImage(imageUrl, caption, token);
  } catch (e) {
    errors.push(`IG: ${(e as Error).message}`);
  }
  return { fbId, igId, errors };
}

/** Persist a platform id the instant it succeeds, so a timed-out run is safe. */
export interface ReelPersist {
  fb: (id: string) => Promise<void>;
  ig: (id: string) => Promise<void>;
}

/** Publish one Reel to both platforms, idempotently. Platforms that already
 *  have an id (from a prior, timed-out attempt) are skipped, and each new id is
 *  persisted the moment it lands — so a retry never double-posts. FB and IG run
 *  concurrently to fit the serverless time budget (video processing is slow). */
export async function publishReel(
  videoUrl: string,
  coverUrl: string | null,
  caption: string,
  existing: { fbId?: string | null; igId?: string | null },
  persist: ReelPersist,
): Promise<PublishResult> {
  if (isDryRun()) {
    console.log(`[dry-run] would post REEL ${videoUrl}\n  caption: ${caption.slice(0, 90).replace(/\n/g, " ")}...`);
    return { fbId: "dryrun-fb", igId: "dryrun-ig", errors: [] };
  }
  const token = await getMetaToken();
  const errors: string[] = [];
  let fbId: string | null = existing.fbId ?? null;
  let igId: string | null = existing.igId ?? null;

  const tasks: Promise<void>[] = [];
  if (!fbId) {
    tasks.push(
      postFacebookReel(videoUrl, caption, token)
        .then(async (id) => { fbId = id; await persist.fb(id); })
        .catch((e) => { errors.push(`FB: ${(e as Error).message}`); }),
    );
  }
  if (!igId) {
    tasks.push(
      postInstagramReel(videoUrl, coverUrl, caption, token)
        .then(async (id) => { igId = id; await persist.ig(id); })
        .catch((e) => { errors.push(`IG: ${(e as Error).message}`); }),
    );
  }
  await Promise.allSettled(tasks);
  return { fbId, igId, errors };
}
