import { config } from "./config";

/** In production, trigger endpoints require the shared CRON_SECRET header.
 *  When no secret is configured (local dev), requests are allowed so the
 *  dashboard buttons work out of the box. */
export function authorized(req: Request): boolean {
  if (!config.cronSecret) return true;
  return req.headers.get("x-cron-secret") === config.cronSecret;
}
