// Instagram publisher using the "Instagram API with Instagram Login"
// (graph.instagram.com) — no Facebook Page required. Posts a single image via
// the create-container -> publish flow, with the retry/expiry handling adapted
// from the battle-tested Dopa Break autopilot.

import { config, isDryRun } from "./config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function api() {
  return `${config.meta.host}/${config.meta.apiVersion}`;
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
          `Instagram token expired or invalid (code 190). Refresh the long-lived ` +
          `Instagram user token and update IG_ACCESS_TOKEN. ${message}`;
      }
      lastErr = new Error(message);
      if (res.status < 500 && res.status !== 429) break; // client errors won't heal
    } catch (e) {
      lastErr = e as Error;
    }
    if (attempt === 1) await sleep(5000);
  }
  throw lastErr ?? new Error("instagram call failed");
}

/** Post a single image to Instagram (create container -> publish). */
export async function postInstagramImage(imageUrl: string, caption: string): Promise<string> {
  const container = await call(`${config.meta.userId}/media`, {
    image_url: imageUrl,
    caption,
  });
  return (await call(`${config.meta.userId}/media_publish`, { creation_id: container.id })).id;
}

export interface PublishResult {
  fbId?: string | null;
  igId?: string | null;
  errors: string[];
}

/** Publish one post to Instagram. In dry-run, logs instead of posting.
 *  (Named publishBoth for pipeline compatibility; Facebook is not used.) */
export async function publishBoth(imageUrl: string, caption: string): Promise<PublishResult> {
  if (isDryRun()) {
    console.log(
      `[dry-run] would post image to Instagram ${imageUrl}\n  caption: ${caption.slice(0, 90).replace(/\n/g, " ")}...`,
    );
    return { fbId: null, igId: "dryrun-ig", errors: [] };
  }
  const errors: string[] = [];
  let igId: string | null = null;
  try {
    igId = await postInstagramImage(imageUrl, caption);
  } catch (e) {
    errors.push(`IG: ${(e as Error).message}`);
  }
  return { fbId: null, igId, errors };
}
