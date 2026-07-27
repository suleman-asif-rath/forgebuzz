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
 *  Large photos take a few seconds; publishing too early fails. */
async function waitForContainer(id: string, token: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const r = await call(`${id}?fields=status_code`, {}, token, "GET");
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR") throw new Error(`IG container ${id} failed processing`);
    await sleep(3000);
  }
  throw new Error(`IG container ${id} not ready in time`);
}

/** Post a single image to Instagram (create container -> wait -> publish). */
export async function postInstagramImage(imageUrl: string, caption: string, token: string): Promise<string> {
  const container = await call(`${config.meta.igUserId}/media`, { image_url: imageUrl, caption }, token);
  await waitForContainer(container.id, token);
  return (await call(`${config.meta.igUserId}/media_publish`, { creation_id: container.id }, token)).id;
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
