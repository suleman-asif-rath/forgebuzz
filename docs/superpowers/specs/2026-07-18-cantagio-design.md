# Cantagio: Automated Social Content Platform (Design Spec)

Date: 2026-07-18
Status: Branding locked, ready to build
Owner: Suleman

## 1. What we are building

An automated pipeline that posts 5 to 7 branded image posts per day to Instagram and Facebook for the brand **Cantagio** (@cantagio), with no manual step. It sources what is trending, writes a punchy headline and caption, renders an on-brand card, and publishes it on a schedule. Reels are deferred to a later phase.

### Decisions already locked
- Content is **original branded graphics** (we compose our own cards), not reposts of other people's content. This is legally safe and fully automatable.
- Topics are **lighter viral only**: pop culture, tech, sports, entertainment, space, "did you know" facts. No hard news (politics, disasters, deaths). This makes hands-off posting safe.
- **Images only** for v1. Reels come later.
- Budget is **$0**. Everything runs on free tiers. If a free tier is exhausted, the pipeline pauses instead of charging.
- Hosting is **Vercel** for the code, **GitHub Actions** as the timer (Vercel's free cron only runs about once a day, which is not enough for staggered posting).

## 2. Architecture

A small factory that runs on a timer. Two jobs: a morning "generate" job fills a queue for the day, and an hourly "publish" job posts whatever is due.

```
   GitHub Actions (free timer)
        |                 |
        v                 v
  /api/generate      /api/publish  (Vercel serverless functions)
        |                 |
        v                 |
  Trend sources           |
  (Reddit JSON,           |
   RSS, Hacker News)      |
        |                 |
  Filter + rank + dedupe  |
  (safety filter,         |
   skip used topics)      |
        |                 |
  Gemini: headline +      |
  caption + hashtags      |
        |                 |
  Pexels: background photo |
        |                 |
  @vercel/og: render card -> PNG
        |                 |
  Save PNG to public URL  |
  (Supabase Storage)      |
        |                 |
  Enqueue post rows ------+--> pick rows due now
  (Supabase table)             |
                               v
                     Meta Graph API
                     Instagram (container -> publish)
                     Facebook Page (photo post)
                               |
                               v
                     Log result, mark topic used
```

### Components
- **Trend sourcer**: pulls candidate topics from free sources, normalizes them into `{title, source, url, score, category}`.
- **Filter and ranker**: drops sensitive/NSFW topics via a keyword blocklist, removes topics already used (Supabase), ranks by freshness and popularity.
- **Copywriter**: Gemini rewrites the topic into an Anton-ready headline plus a 4-part caption and 12 hashtags, following `brand.ts` rules.
- **Card renderer**: `@vercel/og` turns a fixed React template plus tokens into a 1080x1350 PNG. This is the branding engine.
- **Publisher**: adapts the proven Meta posting code (see reuse map) to post to Instagram and the Facebook Page.
- **Store**: Supabase holds the post queue, the used-topics list, and the rendered images.

## 3. APIs and services

| Service | Job | Cost / free tier | Sign-up |
|---|---|---|---|
| **Vercel** | Host code + run functions | Free (Hobby) | vercel.com, sign in with GitHub |
| **GitHub Actions** | The timer (pings Vercel) | Free (2,000 min/mo, we use a few) | Already have GitHub |
| **Reddit** (`.json` endpoints) | Trend source | Free, no key | None. Public JSON, keep request rate low |
| **RSS feeds** | Trend source | Free, no key | None. Use `rss-parser` |
| **Hacker News (Algolia) API** | Tech trends | Free, no key | None |
| **Google Gemini 2.5 Flash** | Headlines + captions | Free tier (generous daily limit) | aistudio.google.com -> Get API key |
| **Pexels API** | Background photos | Free (200 req/hr) | pexels.com/api -> request key |
| **Supabase** | Queue + storage | Free (500 MB db, 1 GB storage) | supabase.com, new project |
| **Meta Graph API** | Post to IG + FB | Free | See Phase 0 below |

If Gemini's free limit ever bites, the cheapest paid fallback is Groq (Llama, also has a free tier) or staying on Gemini and reducing posts per day. No paid service is required for v1.

## 4. Content pipeline logic

1. **Fetch**: `/api/generate` calls each trend source, collects ~40 to 60 candidate topics.
2. **Filter**: drop anything matching the safety blocklist (violence, politics, tragedy, adult, slurs). Drop topics whose fingerprint is in the `used_topics` table.
3. **Rank and pick**: score by source popularity + recency; pick the top 5 to 7, spread across categories so the feed has variety.
4. **Write**: for each pick, Gemini returns `{headline, captionHook, captionContext, cta, hashtags[], backgroundKeyword, category, template}` where template is one of Big Headline / Fact / Question.
5. **Background**: query Pexels with `backgroundKeyword`, take the first landscape result (Fact cards skip this and use a solid Ink background).
6. **Render**: `@vercel/og` composes the card from the template + tokens + headline + background, outputs a 1080x1350 PNG.
7. **Store and enqueue**: upload the PNG to Supabase Storage (public URL), insert a `posts` row with a `scheduled_for` time staggered across the day and `status = queued`.
8. **Publish**: `/api/publish` (hourly) selects rows where `scheduled_for <= now` and `status = queued`, posts each to Instagram (create media container, poll until ready, publish) and Facebook, then sets `status = posted` and adds the topic to `used_topics`.

## 5. Keeping branding 100% consistent

- One `brand.ts` token file is the single source of truth (colors, fonts, logo, watermark, caption rules). Nothing hard-codes brand values.
- Every card is rendered from **the same template component** using those tokens, so cards cannot drift off-brand.
- Three layout variants (Big Headline, Fact, Question) all share the identity: C-Tile logo top-left, category pill top-right, Anton headline bottom-left, `@cantagio` watermark centered.
- Fonts (Anton, Manrope) are embedded from files in the repo, so rendering is identical every time.
- Captions follow the fixed 4-part structure (hook, context, CTA, hashtags) enforced in the Gemini prompt.

## 6. Vercel setup

Project structure:
```
cantagio/
  brand/              # tokens, logo SVGs, fonts (done)
  app/
    api/generate/route.ts
    api/publish/route.ts
    api/render/route.tsx   # @vercel/og card renderer
  lib/
    trends.ts          # Reddit + RSS + HN sourcing
    filter.ts          # safety blocklist + dedupe
    copywriter.ts      # Gemini prompt + parse
    pexels.ts          # background fetch
    meta.ts            # IG + FB publisher (adapted from reuse)
    supabase.ts        # db + storage client
  .github/workflows/
    generate.yml       # cron: once each morning
    publish.yml        # cron: hourly
```

Environment variables (set in Vercel dashboard, never in code):
`GEMINI_API_KEY`, `PEXELS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `META_PAGE_ID`, `META_IG_USER_ID`, `META_PAGE_ACCESS_TOKEN`, `CRON_SECRET` (a shared secret so only GitHub Actions can trigger the endpoints).

Scheduling: GitHub Actions workflows send an authenticated request to `/api/generate` (morning) and `/api/publish` (hourly). Each endpoint checks `CRON_SECRET`.

## 7. Build plan (working version first)

- **Phase 0: Accounts and keys** (user does this, ~1 hour). See checklist below. This is the only fiddly part.
- **Phase 1: MVP render**. One branded card from a hardcoded topic, rendered on screen. No posting. Goal: confirm the look matches the brand board.
- **Phase 2: Real trends**. Wire trend sourcing + safety filter + dedupe. Endpoint returns today's picks.
- **Phase 3: Post one, by hand**. Render one card, upload, publish to IG + FB manually via an endpoint. Proves the Meta pipe works.
- **Phase 4: Automate**. Turn on the queue + the two GitHub Actions timers. It now runs itself.
- **Phase 5: Polish**. More template variety, better ranking, error alerts to phone (Telegram or email).
- **Later: Reels**.

## 8. Reuse map (don't build from scratch)

- **Dopa Break** (`attention-gym/`): `scripts/autopilot-post.mjs` is a working IG + FB publisher (container -> publish flow); `.github/workflows/autopilot.yml` is a ready GitHub Actions cron; `bank.json` is a clean post-item schema.
- **FreightFeed** (`proxmox/freightfeed/`, read-only reference): `src/publish/meta.ts` + `tokens.ts` (typed Meta publisher + token refresh), `src/ingest/*` (trend sourcing), `src/media/cards.ts` (branded card templating), `src/llm/*` (LLM with fallback). This is a near-complete blueprint.

## 9. Rules and risks

- **Meta rate limits**: Instagram allows 25 API-published posts per 24 hours; 5 to 7 is well under. Facebook Pages are more generous.
- **Meta app review**: publishing to Instagram needs the `instagram_content_publish` permission, which requires the account to be a Business/Creator account linked to a Facebook Page, and app review for production. During development it works on accounts you own without full review.
- **Token expiry**: Page access tokens must be long-lived and refreshed (~60 days). We reuse FreightFeed's refresh pattern.
- **Safety filter is mandatory**: because posting is hands-off, the keyword blocklist is the guardrail that keeps sensitive topics out. It ships in Phase 2 before any automation.
- **Free-tier ceiling**: if Gemini or Pexels limits are hit, the generate job logs and pauses; it never falls back to a paid call without a config change.

## 10. Phase 0 checklist (for the user)

1. Convert your Instagram account to a **Professional (Business or Creator)** account.
2. Create a **Facebook Page** for Cantagio and link the Instagram account to it (Page settings -> Linked accounts).
3. Create a **Meta Developer app** at developers.facebook.com, add the Instagram Graph API and Facebook Login products.
4. Generate a **long-lived Page access token** and note the Page ID and Instagram user ID.
5. Get a **Gemini API key** (aistudio.google.com) and a **Pexels API key** (pexels.com/api).
6. Create a **Supabase project** and note its URL and service key.
7. Create an empty **GitHub repo** named `cantagio` and connect it to a new **Vercel** project.

I can walk you through each of these step by step with screenshots-level detail when you are ready.
