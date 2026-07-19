import { config } from "./config";

/** Authorises trigger endpoints. Allowed when:
 *   - no secret is configured (local dev), OR
 *   - the request carries the shared CRON_SECRET header (GitHub Actions), OR
 *   - it's a same-origin browser request (the dashboard buttons).
 *  For real production privacy, put the whole app behind Vercel Authentication
 *  (see README); this check is a light guard, not a full auth system. */
export function authorized(req: Request): boolean {
  if (!config.cronSecret) return true;
  if (req.headers.get("x-cron-secret") === config.cronSecret) return true;
  if (req.headers.get("sec-fetch-site") === "same-origin") return true;
  return false;
}
