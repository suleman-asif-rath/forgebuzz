// When is a post finished?
//
// Pulled out of runPublish so the rule is explicit and testable. It decides
// whether a publish attempt closes the row or leaves it queued for another go.
//
// The rule exists because reels were landing on Facebook but not Instagram:
// Instagram has to transcode a video before it will publish, that can outlast
// the serverless run, and the old code marked the row posted as soon as EITHER
// platform returned an id — closing it permanently with Instagram missing.

/** How long a post that reached only one platform keeps retrying the other.
 *  Past this it is accepted as-is, so a platform that is down for hours cannot
 *  hold a row in the queue forever (and block the topic from being reused). */
export const PARTIAL_RETRY_WINDOW_MS = 2 * 60 * 60_000;

export type PublishOutcome =
  /** Reached both platforms — mark posted. */
  | "done"
  /** Reached neither — mark failed. */
  | "failed"
  /** Reached one; still young enough to retry the other on the next run. */
  | "retry"
  /** Reached one and ran out of retry window — accept it and close the row. */
  | "accept-partial";

export function publishOutcome(args: {
  fbId?: string | null;
  igId?: string | null;
  createdAt: string;
  now?: number;
  windowMs?: number;
}): PublishOutcome {
  const { fbId, igId, createdAt } = args;
  const now = args.now ?? Date.now();
  const windowMs = args.windowMs ?? PARTIAL_RETRY_WINDOW_MS;

  if (fbId && igId) return "done";
  if (!fbId && !igId) return "failed";

  const age = now - Date.parse(createdAt);
  // An unparseable timestamp must not mean "retry forever".
  if (!Number.isFinite(age) || age > windowMs) return "accept-partial";
  return "retry";
}
