/**
 * ForgeBuzz — Brand Tokens (single source of truth)
 * -------------------------------------------------
 * Every generated meme, caption, and watermark reads from THIS file.
 * Changing a value here changes every future post. Do not hard-code brand
 * values anywhere else — import from here so branding can never drift.
 *
 * Identity: ForgeBuzz is a meme page. It posts the thoughts everyone has and
 * nobody says out loud. Warm, playful, chronically-online — never mean.
 *
 * The mark is still the Spark Tile, but the palette warmed up when the page
 * moved from news to memes: hot coral into warm amber, on a near-black base.
 */

export const brand = {
  name: "ForgeBuzz",
  handle: "@forgee.buzz",
  tagline: "Too relatable. Every single day.",

  /** Logo -------------------------------------------------------------
   *  Primary mark = the Spark Tile (see brand/logo-mark.svg). It doubles as the
   *  profile avatar (brand/avatar.svg). Horizontal lockup = brand/logo-wordmark.svg.
   *  Wordmark = "Forge" in text colour + "Buzz" in the signal accent. */
  logo: {
    mark: "brand/logo-mark.svg",
    wordmark: "brand/logo-wordmark.svg",
    avatar: "brand/avatar.svg",
    style: "spark knocked out of a warm rounded tile",
  },

  /** Colours ---------------------------------------------------------- */
  color: {
    ink: "#0F1117", // primary background (warm near-black)
    surface: "#191C26", // raised panels / solid-colour cards
    line: "#2B3040", // hairlines / dividers
    text: "#F7F4EF", // primary text (warm off-white, never pure white)
    muted: "#9A9AA8", // secondary text, watermarks, timestamps
    signalFrom: "#FF3D71", // signature hot coral
    signalTo: "#FFA63D", // signature warm amber
    // Never introduce a third bright accent. The Signal gradient IS the brand.
  },

  /** The one signature gradient. Used for the mark/tile, the dashboard, reel
   *  accents and the lane pill — sparingly. Meme cards stay photo + white text;
   *  the gradient never competes with the joke. */
  gradient: {
    signal: "linear-gradient(135deg, #FF3D71 0%, #FFA63D 100%)",
    signalAngleDeg: 135,
  },

  /** Typography ------------------------------------------------------- */
  type: {
    meme: "Anton", // the joke itself. UPPERCASE, white, heavy black outline.
    display: "Anton", // headings on covers and the brand board
    body: "Manrope", // captions, watermark, dashboard
    displayTracking: "0.005em",
    displayLineHeight: 0.94,
    displayCase: "uppercase",
  },

  /** Meme canvas ------------------------------------------------------ */
  canvas: {
    // Instagram-optimal portrait. Feed shows 4:5.
    width: 1080,
    height: 1350,
    safePadding: 56, // px of untouchable margin on every side
    // The photo is full-bleed. A light scrim top and bottom keeps the white
    // meme text readable over a busy or bright photo.
    scrimOpacity: 0.42,
    // Meme text outline, in px. Simulated with layered text-shadows because
    // Satori does not reliably support -webkit-text-stroke.
    outlineWidth: 7,
  },

  /** Fixed layout anchors — identical on every meme -------------------- */
  layout: {
    topText: "top-center", // the setup
    bottomText: "bottom-center", // the punchline
    watermark: "bottom-right", // @forgee.buzz, small and unobtrusive
  },

  /** Humor lanes (drives topic mix + the dashboard sliders) ------------
   *  These replaced the old news categories when the page became a meme page. */
  categories: [
    "RELATABLE",
    "WORK",
    "SLEEP",
    "FOOD",
    "MONEY",
    "ANIMALS",
  ] as const,

  /** Caption + hashtag style ----------------------------------------- */
  caption: {
    // Memes do not need paragraphs — the card carries the joke. Structure:
    //   1) ONE short line that adds to the joke (never repeats the card text)
    //   2) a light CTA
    //   3) blank line, then the hashtag block
    cta: "follow @forgee.buzz for more 💀",
    maxContextSentences: 1,
    hashtagsCore: ["#forgebuzz", "#memes", "#relatable"],
    hashtagsBySize: 12, // total hashtags per post (core + topical)
  },
} as const;

export type Brand = typeof brand;
export default brand;
