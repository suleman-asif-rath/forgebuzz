# ForgeBuzz

Automated Instagram branded-content platform for **@forgebuzz**. It
sources trending light/viral topics, writes a headline and caption, renders an
on-brand card, and posts 5 to 7 times a day, hands-off. Built on Next.js +
Vercel, scheduled by GitHub Actions, at $0 on free tiers.

---

## Start here (morning quick look, ~3 minutes)

You can see the whole thing working right now with **no accounts and no keys**.
It runs in "dry-run" mode: it generates real branded cards but does not post.

```bash
cd cantagio
npm install        # already done, safe to re-run
npm run dev
```

Open http://localhost:3000 and click **Generate today's posts**. Real cards
appear from live trends. Then click **Publish due posts** (dry-run: it logs
instead of posting). There are already 6 example cards from tonight's test run
in the gallery.

Preview a single card design in the browser:
- http://localhost:3000/api/render
- http://localhost:3000/api/render?template=fact&stat=8%20MIN&headline=is%20how%20long%20sunlight%20takes%20to%20reach%20Earth&category=DID%20YOU%20KNOW

When you are ready to make it real, do the setup below.

---

## The two modes

The app checks which keys are present and turns each service on automatically.
With no keys it uses safe fallbacks, so it always runs end to end.

| Service | With key | Without key (fallback) |
| --- | --- | --- |
| Copywriter | Google Gemini 2.5 Flash | Built-in local writer |
| Backgrounds | Pexels photos | Branded gradient |
| Storage | Supabase (Postgres + Storage) | Local files (dev only) |
| Posting | Instagram (LIVE) | Dry-run (logs only) |

Posting goes LIVE only when your Instagram token + id are set. Everything else is
optional and only improves quality.

---

## Setup to go live

### 1. Get your keys (all free)

**Gemini (captions).** https://aistudio.google.com -> Get API key. Copy it.

**Pexels (photos).** https://www.pexels.com/api/ -> create a key.

**Supabase (storage + queue).**
1. https://supabase.com -> New project. Note the Project URL and the
   `service_role` key (Project Settings -> API).
2. SQL Editor -> paste and run `supabase/schema.sql`.
3. Storage -> New bucket -> name it `forgebuzz` -> make it **Public**.

**Instagram (via "Instagram API with Instagram Login").** No Facebook Page needed.
1. Make sure your Instagram is a **Professional (Business or Creator)** account.
2. Go to https://developers.facebook.com -> create an app (type: Business).
3. Add the **Instagram** product -> **API setup with Instagram login**.
4. Under Business login settings, add scopes: `instagram_business_basic`,
   `instagram_business_content_publish`. Add your IG account as an Instagram tester.
5. Generate a **long-lived Instagram User access token** (lasts ~60 days) and note
   your **Instagram user id**.
6. Put them in `.env.local` as `IG_ACCESS_TOKEN` and `IG_USER_ID`.
   Posting uses host `graph.instagram.com`; for your own account this works in the
   app's Development mode (no App Review needed).

### 2. Add the keys locally

Copy `.env.example` to `.env.local` and fill in what you have:

```bash
cp .env.example .env.local
```

Any key you leave blank simply keeps that service in fallback mode. Restart
`npm run dev` after editing.

### 3. Deploy to Vercel

1. Create an empty GitHub repo `forgebuzz` and push this folder to it.
2. https://vercel.com -> New Project -> import the repo.
3. In Vercel Project Settings -> Environment Variables, add every value from
   your `.env.local`. Set `PUBLIC_BASE_URL` to your Vercel URL
   (e.g. `https://forgebuzz.vercel.app`) and set a random `CRON_SECRET`.
4. Deploy.

> Storage note: Vercel's filesystem is temporary, so the local file store does
> NOT work in production. Supabase must be configured before deploying (the app
> uses it for both the queue and the card images).

### 4. Turn on the automatic timers

In the GitHub repo -> Settings -> Secrets and variables -> Actions, add:
- `FORGEBUZZ_URL` = your Vercel URL (no trailing slash)
- `CRON_SECRET` = the same value you set in Vercel

The two workflows then run themselves:
- `generate.yml` fills the day's queue each morning (04:00 UTC = 09:00 PKT).
- `publish.yml` posts whatever is due, every hour.

You can also run them by hand from the repo's **Actions** tab.

---

## The control room (dashboard)

Open the app (locally `http://localhost:3000`, or your Vercel URL) to manage the
whole brand without touching code. Changes are saved to the store and read by
the pipeline on its **next run**, so there is nothing to redeploy.

- **Overview** — service status, today's counts (in queue / posted / failed),
  the big **Posting ON / PAUSED** switch, and the Generate / Publish buttons.
- **Settings**
  - **Posting & frequency**: master pause switch, posts per day, the posting
    time slots, and your timezone.
  - **Areas of interest**: turn each topic area on or off and set how often it
    appears (a priority from Rare to Often).
  - **News freshness**: a max-age (hours) so news-like posts must be recent
    (12 to 18 recommended); timeless "Did You Know" facts are exempt.
  - **Trend sources**: toggle Google News, Reddit, News RSS, and Hacker News.
  - **Voice**: your caption call-to-action and the core hashtags on every post.
  - **Safety net**: add your own extra blocked words on top of the built-in list.
- **Queue** — every generated post with its status and scheduled time; delete
  any you do not want.

The **master switch** is the important one: flip it to PAUSED and nothing gets
posted, while the queue keeps filling so you can resume any time.

> Privacy in production: the dashboard is a public URL by default. Turn on
> **Vercel Authentication** (Project Settings -> Deployment Protection) so only
> you can open it, and add a **Protection Bypass for Automation** token so the
> GitHub Actions timers can still reach the endpoints.

## How it works

```
GitHub Actions (timer)
  -> POST /api/generate   (morning)
       fetch trends (Google News, Reddit, RSS, Hacker News)
       -> safety filter + freshness (max-age) + de-dupe + rank + pick 6
       -> Gemini writes headline + caption + hashtags
       -> Pexels background
       -> @vercel/og renders the branded card (PNG)
       -> save image + enqueue with a staggered post time
  -> POST /api/publish     (hourly)
       find posts whose time has come
       -> post image to Instagram (Instagram API with Instagram Login)
       -> mark posted, remember the topic so it never repeats
```

Branding cannot drift: every card is drawn from one template using the tokens
in `brand/brand.ts`, with the fonts in `brand/fonts/`.

## Project structure

```
brand/            Brand identity: tokens (brand.ts), logo SVGs, fonts, brand board
app/
  page.tsx        Control-room dashboard
  actions.tsx     Generate / Publish buttons
  api/generate/   Build the day's queue
  api/publish/    Post due items
  api/render/     Live single-card preview
lib/
  trends.ts       Reddit + RSS + Hacker News sourcing
  blocklist.ts    Safety word list (the hands-off guardrail)
  filter.ts       Safety filter + de-dupe + category-balanced pick
  copywriter.ts   Gemini writer (+ local fallback) + caption assembly
  pexels.ts       Background photo lookup
  render.tsx      The card renderer (the branding engine)
  meta.ts         Instagram publisher (Instagram Login, graph.instagram.com)
  store.ts        Supabase store (prod) / local file store (dev)
  pipeline.ts     Ties generate + publish together
  config.ts       Reads env, decides which services are live
supabase/schema.sql   Run once in Supabase
.github/workflows/    The two timers
```

## Safety and limits

- **Safety filter** (`lib/blocklist.ts`) drops anything political, tragic, adult,
  or otherwise sensitive before it can be posted. This is the guardrail that
  makes a fully hands-off account safe. Widen it any time.
- **Instagram** allows 25 API posts per 24 hours; 5 to 7 is well within limits.
- **Costs** stay at $0 on the listed free tiers. If a free limit is ever hit,
  that service falls back instead of charging you.
- **Token expiry**: the long-lived Instagram user token lasts ~60 days. Refresh it
  and update `IG_ACCESS_TOKEN` when the logs report a code-190 error.

## Tuning

- `POSTS_PER_DAY` (default 6). Posting slots are 09/11/13/15/17/19/21 local.
- Add or change trend sources in `lib/trends.ts`.
- Adjust the voice/brand in `brand/brand.ts` and the safety net in `lib/blocklist.ts`.
