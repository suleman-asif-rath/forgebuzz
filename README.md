# Cantagio

Automated Instagram + Facebook branded-content platform for **@cantagio**. It
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
| Posting | Instagram + Facebook (LIVE) | Dry-run (logs only) |

Posting goes LIVE only when all three Meta keys are set. Everything else is
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
3. Storage -> New bucket -> name it `cantagio` -> make it **Public**.

**Meta (Instagram + Facebook).** This is the fiddly one.
1. Convert your Instagram to a **Professional (Business or Creator)** account.
2. Create a **Facebook Page** and link the Instagram account to it
   (Page settings -> Linked accounts).
3. Go to https://developers.facebook.com -> create an app (type: Business).
   Add products: **Instagram Graph API** and **Facebook Login**.
4. In Graph API Explorer, generate a token with permissions:
   `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`,
   `instagram_basic`, `instagram_content_publish`.
5. Exchange it for a **long-lived Page access token** (lasts ~60 days).
6. Note your **Facebook Page ID** and your **Instagram Business user ID**
   (get the IG id via `GET /{page-id}?fields=instagram_business_account`).

### 2. Add the keys locally

Copy `.env.example` to `.env.local` and fill in what you have:

```bash
cp .env.example .env.local
```

Any key you leave blank simply keeps that service in fallback mode. Restart
`npm run dev` after editing.

### 3. Deploy to Vercel

1. Create an empty GitHub repo `cantagio` and push this folder to it.
2. https://vercel.com -> New Project -> import the repo.
3. In Vercel Project Settings -> Environment Variables, add every value from
   your `.env.local`. Set `PUBLIC_BASE_URL` to your Vercel URL
   (e.g. `https://cantagio.vercel.app`) and set a random `CRON_SECRET`.
4. Deploy.

> Storage note: Vercel's filesystem is temporary, so the local file store does
> NOT work in production. Supabase must be configured before deploying (the app
> uses it for both the queue and the card images).

### 4. Turn on the automatic timers

In the GitHub repo -> Settings -> Secrets and variables -> Actions, add:
- `CANTAGIO_URL` = your Vercel URL (no trailing slash)
- `CRON_SECRET` = the same value you set in Vercel

The two workflows then run themselves:
- `generate.yml` fills the day's queue each morning (04:00 UTC = 09:00 PKT).
- `publish.yml` posts whatever is due, every hour.

You can also run them by hand from the repo's **Actions** tab.

---

## How it works

```
GitHub Actions (timer)
  -> POST /api/generate   (morning)
       fetch trends (Reddit, RSS, Hacker News)
       -> safety filter + de-dupe + rank + pick 6
       -> Gemini writes headline + caption + hashtags
       -> Pexels background
       -> @vercel/og renders the branded card (PNG)
       -> save image + enqueue with a staggered post time
  -> POST /api/publish     (hourly)
       find posts whose time has come
       -> post image to Instagram + Facebook (Meta Graph API)
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
  meta.ts         Instagram + Facebook publisher
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
- **Token expiry**: the Meta Page token lasts ~60 days. Regenerate it and update
  `META_PAGE_TOKEN` when the logs report a code-190 error.

## Tuning

- `POSTS_PER_DAY` (default 6). Posting slots are 09/11/13/15/17/19/21 local.
- Add or change trend sources in `lib/trends.ts`.
- Adjust the voice/brand in `brand/brand.ts` and the safety net in `lib/blocklist.ts`.
