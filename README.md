# ForgeBuzz

Automated Instagram + Facebook page for **@forgee.buzz**. It posts two kinds of
content, both as bold text over a stock photo, hands-off:

- **Memes** — original jokes about everyday life and animals
- **Facts** — verified "wow" facts written as hooks
  ("Japan is turning footsteps into electricity") Built on
Next.js + Vercel, scheduled by GitHub Actions, at $0 on free tiers.

Every post is **original**. ForgeBuzz never downloads, re-hosts, or reposts
anyone else's image — so there is no copyright or credit exposure on the
brand's accounts.

**Facts are never invented.** The FACTS lane only ever rephrases a fact that was
already verified before the AI saw it: either one of the hand-checked entries in
`lib/facts.ts`, or a post from a subreddit that requires sources. The writer is
explicitly forbidden from adding a number, place, date or claim of its own, and
returns `skip` if it cannot write the hook from the given fact alone. This is
the one rule that matters most on an unattended account.

---

## Start here (morning quick look, ~3 minutes)

You can see the whole thing working right now with **no accounts and no keys**.
It runs in "dry-run" mode: it generates real memes but does not post.

```bash
cd cantagio
npm install        # already done, safe to re-run
npm run dev
```

Open http://localhost:3000 and click **Generate today's posts**. Real memes
appear. Then click **Publish due posts** (dry-run: it logs instead of posting).

Preview the meme renderer directly in the browser:
- http://localhost:3000/api/render
- http://localhost:3000/api/render?top=WHEN%20YOU%20SET%205%20ALARMS&bottom=AND%20WAKE%20UP%20AT%20NOON&photo=tired%20cat
- http://localhost:3000/api/render?overlay=1 — the transparent text layer that gets burned onto reels

---

## The two modes

The app checks which keys are present and turns each service on automatically.
With no keys it uses safe fallbacks, so it always runs end to end.

| Service | With key | Without key (fallback) |
| --- | --- | --- |
| Joke writer | Google Gemini 2.5 Flash | Built-in local writer |
| Photos / clips | Pexels + Pixabay | Branded gradient |
| Storage | Supabase (Postgres + Storage) | Local files (dev only) |
| Posting | Instagram + Facebook (LIVE) | Dry-run (logs only) |

Posting goes LIVE only when all three Meta keys are set.

---

## Setup to go live

### 1. Get your keys (all free)

**Gemini (jokes).** https://aistudio.google.com -> Get API key. Multiple keys
can be supplied comma-separated as `GEMINI_API_KEYS` — the writer rotates
through them, so a rate-limited key rolls over instead of failing.

**Pexels / Pixabay (photos + stock clips).** https://www.pexels.com/api/ and
https://pixabay.com/api/docs/ -> create a key on each.

**Supabase (storage + queue).**
1. https://supabase.com -> New project. Note the Project URL and the
   `service_role` key (Project Settings -> API).
2. SQL Editor -> paste and run `supabase/schema.sql`.
3. Storage -> New bucket -> name it `forgebuzz` -> make it **Public**.
4. Upload the reel music to a `music/` folder in that bucket, or run
   `python scripts/generate-music.py --upload` to synthesise and upload it.

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

1. Create an empty GitHub repo `forgebuzz` and push this folder to it.
2. https://vercel.com -> New Project -> import the repo.
3. In Vercel Project Settings -> Environment Variables, add every value from
   your `.env.local`. Set `PUBLIC_BASE_URL` to your Vercel URL and set a random
   `CRON_SECRET`.
4. Deploy.

> Storage note: Vercel's filesystem is temporary, so the local file store does
> NOT work in production. Supabase must be configured before deploying (the app
> uses it for the queue, the meme images, the reels, and the music).

### 4. Turn on the automatic timers

In the GitHub repo -> Settings -> Secrets and variables -> Actions, add:
- `FORGEBUZZ_URL` = your Vercel URL (no trailing slash)
- `CRON_SECRET` = the same value you set in Vercel

The three workflows then run themselves:
- `generate.yml` fills the day's queue each morning (04:00 UTC = 09:00 PKT).
- `publish.yml` posts whatever is due, every 20 minutes.
- `reel.yml` builds a reel at five candidate slots, up to your daily cap.

You can also run them by hand from the repo's **Actions** tab.

---

## The control room (dashboard)

Open the app (locally `http://localhost:3000`, or your Vercel URL) to manage the
whole brand without touching code. Changes are saved to the store and read by
the pipeline on its **next run**, so there is nothing to redeploy.

- **Overview** — service status, today's counts (in queue / posted / failed),
  the big **Posting ON / PAUSED** switch, and the Generate / Publish buttons.
- **Settings**
  - **Posting & frequency**: master pause switch, posts per day, fixed vs
    variable posting times, the time slots, your timezone, and reels per day.
  - **Content lanes**: turn each kind of post on or off and set how often it
    appears — RELATABLE, WORK, SLEEP, FOOD, MONEY, ANIMALS and FACTS.
  - **Content sources**: the joke seed bank, Reddit joke sparks (titles only),
    and the verified fact bank + sourced fact subreddits — each toggled
    separately, with a freshness limit for the Reddit side.
  - **Humor edge**: Clean / PG-13 / Sharp. Moves the profanity and sarcasm dial
    only — the hard lines are blocked at every level and cannot be turned off.
  - **Voice**: your caption call-to-action and the core hashtags on every post.
  - **Safety net**: add your own extra blocked words on top of the built-in list.
- **Queue** — every generated meme with its status and scheduled time; delete
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
       premises.ts  seed bank (200+ hand-written premises)
       memeFuel.ts  Reddit TITLES ONLY as extra sparks
       -> ideas.ts      safety filter + de-dupe + weighted lane pick
       -> jokewriter.ts Gemini writes topText / bottomText / caption
       -> blocklist     word check over the finished joke
       -> reviewer.ts   Gemini: "would this embarrass the brand?"
       -> Pexels photo
       -> render.tsx    impact text over the photo (PNG)
       -> save image + enqueue with a staggered post time

  -> POST /api/reel      (five candidate slots)
       same joke pipeline, then:
       -> stock clip + transparent text overlay + royalty-free music
       -> mux.ts burns it all together with ffmpeg, grabs a cover frame

  -> POST /api/publish   (every 20 min)
       find posts whose time has come
       -> post to Instagram + Facebook (Meta Graph API)
       -> mark posted, remember the premise so it never repeats
```

Branding cannot drift: every meme is drawn from one template using the tokens
in `brand/brand.ts`, with the fonts in `brand/fonts/`.

## Project structure

```
brand/            Brand identity: tokens (brand.ts), logo SVGs, fonts, brand board
app/
  page.tsx        Control-room dashboard
  actions.tsx     Generate / Publish buttons
  api/generate/   Build the day's queue
  api/reel/       Build one meme reel
  api/publish/    Post due items
  api/render/     Live meme preview
lib/
  premises.ts     The joke seed bank — 210 premises (plain data)
  facts.ts        The verified fact bank — 148 hand-checked facts
  memeFuel.ts     Reddit titles as extra sparks (never their images)
  ideas.ts        Safety filter + de-dupe + weighted lane pick
  jokewriter.ts   Gemini writer: jokes, plus a strict fact mode that may only
                  rephrase a supplied fact, never author one
  publishPolicy.ts  When a post counts as finished (both platforms, or retry)
  reviewer.ts     Second pass: "would this embarrass the brand?"
  blocklist.ts    Safety word lists (the hands-off guardrail)
  render.tsx      The meme renderer (impact text, outline, watermark)
  pexels.ts       Photo lookup
  stockVideo.ts   Stock clip lookup for reels
  music.ts        Royalty-free reel music
  mux.ts          ffmpeg: burn the joke on, mix music, grab a cover frame
  meta.ts         Instagram + Facebook publisher
  store.ts        Supabase store (prod) / local file store (dev)
  pipeline.ts     Ties generate + reel + publish together
  config.ts       Reads env, decides which services are live
scripts/
  generate-music.py      Synthesise + upload the reel music
  flush-news-queue.mjs   One-off: clear unposted items (used for the meme pivot)
supabase/schema.sql      Run once in Supabase
.github/workflows/       The three timers
```

## Safety and limits

Because nothing is reviewed by a human before it posts, there are three nets:

1. **Premise blocklist** (`lib/blocklist.ts`) drops anything hateful, political,
   religious, tragic, sexual, or news-like *before* a joke is written.
2. **Output blocklist** re-checks the finished joke. Profanity depends on the
   dashboard's humor edge; the hard lines are absolute at every level.
3. **The reviewer** (`lib/reviewer.ts`) asks Gemini whether the meme would
   embarrass the brand. This catches what a word list cannot — a joke that is
   technically clean but mean or bleak.

Other limits:
- **Instagram** allows 25 API posts per 24 hours; 6 images + 3 reels is well
  within limits.
- **Costs** stay at $0 on the listed free tiers.
- **Token expiry**: the Meta Page token lasts ~60 days. Regenerate it and update
  `META_PAGE_TOKEN` when the logs report a code-190 error.

## Tuning

- Add premises to `lib/premises.ts` — one line each, no code changes needed.
- Adjust the voice and palette in `brand/brand.ts`.
- Widen the safety net in `lib/blocklist.ts` or from the dashboard.
- Reels are capped at 15s and re-encoded at `ultrafast` to fit the serverless
  time budget (measured: ~7s for a 1080x1920 clip).
