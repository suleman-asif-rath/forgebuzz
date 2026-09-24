# ForgeBuzz to Meme Page: Design

**Status:** IMPLEMENTED. See "What actually happened" at the bottom.
**Date:** 2026-09-24

---

## What we're doing

ForgeBuzz stops being a trending-news/facts page and becomes a **pure funny meme
page** on Instagram + Facebook, still fully automated and still hands-off.

The plumbing that works stays: the queue, the scheduler, the Meta publisher, the
dashboard, Supabase storage, the GitHub Actions timers. What gets replaced is the
**content engine** — where ideas come from, what Gemini writes, and what gets
drawn on the image.

### Decisions you made

| Question | Your answer |
| --- | --- |
| Meme source | AI-generated originals only. Never repost anyone's image. |
| Humor lanes | Relatable everyday life + wholesome/animal |
| Meme format | Classic impact text over a real photo |
| Reels | Keep them, meme-ified (joke burned on as impact text) |
| Idea engine | Curated seed bank **+** Reddit titles as extra fuel |
| Humor edge | Options 2 **and** 3 — see the assumption below |
| Rebrand scope | Same handle, playful visual refresh |
| Existing queue | Clear unposted news, keep posted history |

### Assumption to confirm (the one thing I guessed)

You answered "2 and 3" on humor edge. I read that as: **gen-z internet voice,
PG-13 edge.** Concretely —

- **Allowed:** light profanity (damn, hell, crap), sarcasm, self-deprecation,
  chronically-online slang, absurdism, grown-up life humor (bills, hating your
  job, hangovers, being broke).
- **Never:** slurs, hate, politics, religion, tragedy, death, self-harm, sexual
  content, body-shaming, punching down at any group, anything about a real named
  private person.

If that's not the blend you meant, say so and it's a one-line change to the
prompt and the blocklist.

---

## Architecture

### Today

```
trends.ts (Google News, RSS, Hacker News, Reddit)
  -> filter.ts       safety + freshness + dedupe + weighted category pick
  -> copywriter.ts   Gemini writes headline + caption
  -> pexels.ts       background photo
  -> render.tsx      branded card (headline bottom-left, category pill, logo)
  -> store -> meta.ts
```

### After

```
premises.ts     curated seed bank (the guaranteed supply)
memeFuel.ts     Reddit TITLES ONLY as extra spark (never their images)
  -> ideas.ts        merge + safety + dedupe + weighted lane pick
  -> jokewriter.ts   Gemini writes { topText, bottomText, caption, photoKeyword }
  -> reviewer.ts     second Gemini pass: "would this embarrass the brand?"
  -> pexels.ts       the photo the joke sits on        (unchanged)
  -> render.tsx      renderMemePng: impact text, top + bottom, over the photo
  -> store -> meta.ts                                   (unchanged)
```

The shape of the pipeline is the same. Each stage keeps one clear job, so each
can be tested on its own.

---

## The pieces

### 1. `lib/premises.ts` — NEW, the seed bank

A few hundred joke premises written into the repo, each tagged with a lane and a
photo hint. This is the supply that can never fail.

```ts
{ lane: "SLEEP",   premise: "setting five alarms and ignoring every one",
  photo: "tired person in bed" }
{ lane: "ANIMALS", premise: "a cat deliberately knocking a glass off a table",
  photo: "cat on a table" }
{ lane: "MONEY",   premise: "your balance right after payday vs three days later",
  photo: "empty wallet" }
```

Plain data, no logic. You can add a premise without touching code.

### 2. `lib/memeFuel.ts` — replaces `trends.ts`

Pulls **titles only** from subreddits where the title carries the joke
(r/Showerthoughts, r/dadjokes, r/oneliners, plus r/aww and r/AnimalsBeingDerps
for the animal lane). Their images are never fetched, never stored, never posted
— a title is only a spark for an original joke.

**Known weakness:** many meme-sub titles are junk ("me irl"). So Reddit is the
*top-up*, never the base. If Reddit is down, rate-limited, or all its titles get
filtered, the seed bank alone still fills the day. Short and low-information
titles get dropped before they ever reach Gemini.

The existing news sources (Google News, RSS, Hacker News) are removed.

### 3. `lib/ideas.ts` — replaces `filter.ts`

Same job as today: safety filter, drop anything already used (fingerprint
dedupe), then a weighted pick across lanes. The freshness/max-age filter is gone
— a joke about Mondays doesn't expire. Reddit-sourced fuel keeps a light recency
preference; seed premises are evergreen.

**Lanes** (these replace TRENDING / WORLD / TECH / SPORTS / ENTERTAINMENT /
SPACE / DID YOU KNOW, and each gets its own on/off + frequency slider in your
dashboard, exactly like the old categories):

`RELATABLE` · `WORK` · `SLEEP` · `FOOD` · `MONEY` · `ANIMALS`

Six lanes rather than your two picks, because splitting "everyday life" into
work/sleep/food/money is what stops four Monday jokes landing in the same day —
and it lets you turn down, say, MONEY without losing the whole lane.

### 4. `lib/jokewriter.ts` — replaces `copywriter.ts`

Same Gemini key rotation and local fallback as today. New prompt, new output:

```jsonc
{
  "topText": "WHEN YOU SET 5 ALARMS",      // <= 40 chars, the setup
  "bottomText": "AND WAKE UP AT NOON",     // <= 40 chars, the punchline
  "lane": "SLEEP",
  "caption": "...",                        // short. memes don't need paragraphs
  "hashtags": ["#forgebuzz", "#memes"],
  "photoKeyword": "tired cat"              // what Pexels should find
}
```

Either text line may be empty — some jokes are one line, and forcing two is how
memes get unfunny.

The local fallback writer stays, so a total Gemini outage still produces a
postable meme from the seed bank rather than nothing.

### 5. `lib/reviewer.ts` — NEW, the embarrassment check

Because you chose an edgier tone on an unattended page, every joke gets a second,
cheap Gemini pass before it queues:

> "Here is a meme about to be posted by a brand account. Would any reasonable
> person find this offensive, mean, tragic, political, sexual, or likely to
> embarrass the brand? Answer yes/no and why."

A "yes" drops the joke and the pipeline moves to the next premise. This costs one
extra fast call per post and is the thing that lets the page run while you sleep.
The hard blocklist still runs first — this is a second net, not a replacement.

### 6. `lib/render.tsx` — new `renderMemePng`

Full-bleed photo, white all-caps condensed text top and bottom, black outline,
small `@forgee.buzz` watermark bottom-right. The category pill and the
news-style logo lockup come off the card — they read as "news page", not memes.

Anton is already bundled and is the right shape for meme text, so **no new font
is needed**.

**Implementation risk, flagged early:** Satori (the engine behind `@vercel/og`)
has limited support for `-webkit-text-stroke`. If it doesn't render, the outline
gets simulated with layered `textShadow`, which Satori does support. I'll prove
this out on a single test render before building anything on top of it.

### 7. Meme reels

Same joke treatment on video: stock clip + joke burned on as impact text + your
existing royalty-free music.

**Implementation risk, flagged early:** `lib/mux.ts` currently copies the video
stream untouched (`-c:v copy`), which is why it's fast. Burning text on forces a
re-encode, which is much slower and could blow the serverless time budget.
Mitigation: render the text as a transparent PNG with the existing renderer,
composite it with a single ffmpeg `overlay`, re-encode at `-preset ultrafast`,
and cap clips at ~15s. If that still doesn't fit the budget, the fallback is to
put the joke on the cover frame only. I'll measure this before committing to it.

### 8. Brand refresh — `brand/brand.ts`

Handle, name, logo files and accounts all stay. What changes:

- **Tagline:** "Know it before it's everywhere" becomes something meme-native.
- **Accent:** the calm news blue warms up. The Signal gradient stays the single
  accent (the brand rule that it never gets a second bright colour holds).
- **Caption voice:** short. The CTA stops being "so you always know it first".
- **Core hashtags:** `#forgebuzz #trending #didyouknow` become memes/relatable/funny.

`brand.ts` stays the single source of truth — every change above is a token edit
there, not a change scattered across files.

### 9. Dashboard

- "Areas of interest" becomes **Humor lanes** (the six above).
- **News freshness** section: removed.
- **Trend sources** becomes **Meme fuel** (seed bank always on; Reddit toggle).
- New: **humor edge** control (clean / PG-13 / sharp) so you can dial the tone
  without me touching code.
- Everything else — master switch, posts per day, fixed vs variable timing,
  timezone, reels per day, blocked words — unchanged.

### 10. The switchover

A one-off script clears unposted news items from the queue. Posted history and
your actual IG/FB feeds are untouched. Used-topic fingerprints are kept (they
cost nothing and stop an old headline sneaking back).

---

## Cadence, captions, CTA — what I'm assuming

These are all dashboard-editable later, so I'm picking sensible defaults rather
than spending your last awake minutes on them:

- **6 image memes/day + up to 3 reels/day**, variable timing. Unchanged from now.
- **Short captions.** A meme's caption is a line or two, not the current
  hook/context/CTA paragraph block. The card carries the joke.
- **CTA:** a light "follow for more" rather than the news-brand one.
- **12 hashtags**, core set rewritten for memes.

Tell me if any of those are wrong.

---

## Testing

- `premises.ts` — every seed has a valid lane and a photo hint; no duplicates.
- `ideas.ts` — blocked premises never survive; used fingerprints never reappear;
  a disabled lane is never picked; weights actually shift the distribution.
- `jokewriter.ts` — malformed Gemini JSON falls back cleanly; over-long text gets
  clamped; an empty line is allowed.
- `reviewer.ts` — a deliberately offensive joke is rejected; a harmless one passes.
- `renderMemePng` — the outline renders (the Satori risk above), long text wraps
  without overflowing, the watermark is never covered.
- End-to-end in dry-run before anything goes live.

---

## What I am NOT doing

- Not reposting, scraping, or re-hosting anyone's meme images.
- Not renaming your accounts.
- Not touching `meta.ts`, `store.ts`, `schedule.ts`, or the workflows beyond what
  the content change requires.
- Not deleting anything from your live IG or FB feeds.

---

## What actually happened

Built and verified. Three things went differently from the plan:

**1. The two flagged risks were both fine.**
- Satori's text outline works, simulated with 16 layered `textShadow` points.
  Verified by rendering real memes over real photos.
- The reel re-encode takes **~7s** for a 15s 1080x1920 clip at `ultrafast`,
  comfortably inside the serverless budget. The cover is a real frame grabbed
  from the finished video, so the grid thumbnail matches what plays.

**2. Generation had to become incremental.**
Building a whole day in one call took 45-80s and blew Vercel's 60s cap — each
post is two Gemini calls, a photo lookup, a render and an upload. `/api/generate`
now builds at most 3 per call and the workflow calls it until the day is full,
mirroring how the reel pipeline already worked. This required the "variable"
posting times to become *deterministic per day* (seeded PRNG in `lib/schedule.ts`),
so repeated runs agree on the same slot list instead of reshuffling times
already handed out.

**3. Two real bugs surfaced, both pre-existing or self-inflicted.**
- **`gemini-2.5-flash` is retired for newer API keys.** 7 of the 10 keys in
  rotation were silently 404ing — meaning the live news page had been falling
  back to the local writer for some posts. Fixed by moving to
  `gemini-3.6-flash`, making the model an env var, and adding a fallback model,
  per-key 429 cooldowns and backoff in a new shared `lib/gemini.ts`.
- **The seed bank tripped its own safety filter.** "the 4pm crash arriving on
  schedule" and "sleeping through an earthquake" were dropped by the
  tragic-news word list. Curated seeds now skip that list; anything pulled off
  the internet still gets the full check.

**The local fallback writer was removed rather than ported.** Filling a template
with the raw premise produced non-jokes ("ME: A DOG WHO THINKS THE POSTMAN IS
A... / ALSO ME: SURPRISED"). On a meme page a bad post costs more than a missing
one, so the pipeline now skips when Gemini is unavailable.

### Verification

- `npm run build` — passes.
- `npx tsc --noEmit` — clean.
- `npm run check` — 17/17 content-rule assertions (new; see
  `scripts/content-rules.check.ts`). Covers the seed bank, the premise picker
  honouring dashboard settings, and every humor-edge level.
- Scheduling — verified stable across repeated runs, chronological, in-window.
- Renderer — verified on long text, one-liners, bright and busy photos.
- Generate — produced 6/6 real memes end to end in dry-run.
- Reel — the ffmpeg path (overlay, music, cover frame) verified in isolation.
  **Not yet verified end to end through `/api/reel`**, because the Gemini free
  tier hit its daily quota during testing. Worth watching on the first real run.

### Still open

**Is "gen-z voice, PG-13 edge" the blend you meant by "2 and 3"?** Built to that
assumption; it is a one-line change in `lib/jokewriter.ts` and the dashboard has
a Clean / PG-13 / Sharp switch if you want to move it yourself.
