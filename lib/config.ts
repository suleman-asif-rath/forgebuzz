// Central place that reads env once and decides which real services are on.
// The whole app degrades gracefully: any service without keys falls back to a
// local/dry-run equivalent, so the pipeline always runs end to end.

function has(v: string | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const env = process.env;

export const config = {
  gemini: {
    on: has(env.GEMINI_API_KEY),
    key: env.GEMINI_API_KEY ?? "",
    model: "gemini-2.5-flash",
  },
  pexels: {
    on: has(env.PEXELS_API_KEY),
    key: env.PEXELS_API_KEY ?? "",
  },
  supabase: {
    on: has(env.SUPABASE_URL) && has(env.SUPABASE_SERVICE_KEY),
    url: env.SUPABASE_URL ?? "",
    key: env.SUPABASE_SERVICE_KEY ?? "",
    bucket: env.SUPABASE_BUCKET ?? "forgebuzz",
  },
  meta: {
    // Posting is "live" only when all three Meta creds are present.
    on:
      has(env.META_PAGE_TOKEN) && has(env.FB_PAGE_ID) && has(env.IG_USER_ID),
    token: env.META_PAGE_TOKEN ?? "",
    fbPageId: env.FB_PAGE_ID ?? "",
    igUserId: env.IG_USER_ID ?? "",
    apiVersion: env.META_API_VERSION ?? "v23.0",
  },
  cronSecret: env.CRON_SECRET ?? "",
  postsPerDay: Math.max(1, Math.min(12, Number(env.POSTS_PER_DAY ?? 6))),
  baseUrl: (env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  isProd: env.NODE_ENV === "production",
} as const;

/** Posting is dry-run whenever Meta is not fully connected. */
export function isDryRun(): boolean {
  return !config.meta.on;
}

/** A short human summary of what's connected, for the dashboard banner. */
export function serviceStatus() {
  return {
    copywriter: config.gemini.on ? "Gemini 2.5 Flash" : "Local writer (fallback)",
    backgrounds: config.pexels.on ? "Pexels" : "Gradient (fallback)",
    storage: config.supabase.on ? "Supabase" : "Local files (dev only)",
    posting: config.meta.on ? "Instagram + Facebook (LIVE)" : "Dry-run (not posting)",
  };
}
