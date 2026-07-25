// Instagram + Facebook publisher. Adapted from the battle-tested Dopa Break
// autopilot (scripts/autopilot-post.mjs): Graph API v23.0, token in the
// Authorization header (never the URL), code-190 expiry detection, and
// retry on 5xx/429 only. ForgeBuzz v1 posts single images.

import { config, isDryRun } from "./config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function api() {
  return `https://graph.facebook.com/${config.meta.apiVersion}`;
}

async function call(
  path: string,
  params: Record<string, string>,
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
        headers: { Authorization: `Bearer ${config.meta.token}` },
        body: method === "POST" ? qs : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && !json.error) return json;
      let message = `${method} ${path}: ${res.status} ${JSON.stringify(json.error ?? json)}`;
      if (json.error?.code === 190) {
        message =
          `Meta token expired or invalid (code 190). Regenerate the long-lived ` +
          `Page token and update META_PAGE_TOKEN. ${message}`;
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
export async function postFacebookImage(imageUrl: string, caption: string): Promise<string> {
  const r = await call(`${config.meta.fbPageId}/photos`, { url: imageUrl, message: caption });
  return r.post_id ?? r.id;
}

/** Post a single image to Instagram (create container -> publish). */
export async function postInstagramImage(imageUrl: string, caption: string): Promise<string> {
  const container = await call(`${config.meta.igUserId}/media`, {
    image_url: imageUrl,
    caption,
  });
  return (await call(`${config.meta.igUserId}/media_publish`, { creation_id: container.id })).id;
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
  const errors: string[] = [];
  let fbId: string | null = null;
  let igId: string | null = null;
  try {
    fbId = await postFacebookImage(imageUrl, caption);
  } catch (e) {
    errors.push(`FB: ${(e as Error).message}`);
  }
  try {
    igId = await postInstagramImage(imageUrl, caption);
  } catch (e) {
    errors.push(`IG: ${(e as Error).message}`);
  }
  return { fbId, igId, errors };
}
