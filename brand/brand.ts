/**
 * Cantagio — Brand Tokens (single source of truth)
 * -------------------------------------------------
 * Every generated post card, caption, and watermark reads from THIS file.
 * Changing a value here changes every future post. Do not hard-code brand
 * values anywhere else — import from here so branding can never drift.
 *
 * Identity: "Cantagio" surfaces what's happening in the world and makes it
 * worth knowing. The mark is the "C Tile" — the letter C knocked out of a
 * soft Signal-Blue rounded tile. Calm, clear, knowledge-forward.
 */

export const brand = {
  name: "Cantagio",
  handle: "@cantagio",
  tagline: "Know it before it's everywhere.",

  /** Logo -------------------------------------------------------------
   *  Primary mark = the C Tile (see brand/logo-mark.svg). It doubles as the
   *  profile avatar (brand/avatar.svg). Horizontal lockup = brand/logo-wordmark.svg. */
  logo: {
    mark: "brand/logo-mark.svg",
    wordmark: "brand/logo-wordmark.svg",
    avatar: "brand/avatar.svg",
    style: "C knocked out of a soft-blue rounded tile",
  },

  /** Colours ---------------------------------------------------------- */
  color: {
    ink: "#0B1020", // primary background (deep ink-navy)
    surface: "#151C2E", // raised panels / solid-colour cards
    line: "#26304A", // hairlines / dividers
    text: "#EDF1FA", // primary text (soft cool white, never pure white)
    muted: "#8B93A8", // secondary text, source lines, timestamps
    signalFrom: "#3E86FF", // signature soft blue
    signalTo: "#63C6F5", // signature soft sky-cyan
    // Never introduce a second bright accent. The Signal gradient IS the brand.
  },

  /** The one signature gradient. Used for the mark/tile, keyword highlights,
   *  category pills, and accents — sparingly. */
  gradient: {
    signal: "linear-gradient(135deg, #3E86FF 0%, #63C6F5 100%)",
    signalAngleDeg: 135,
  },

  /** Typography ------------------------------------------------------- */
  type: {
    display: "Anton", // headlines on cards. UPPERCASE. Ultra-condensed bold.
    body: "Manrope", // captions, tags, watermark, source lines.
    displayTracking: "0.005em",
    displayLineHeight: 0.92, // tight, stacked look
    displayCase: "uppercase",
  },

  /** Post canvas ------------------------------------------------------ */
  canvas: {
    // Instagram-optimal portrait. Feed shows 4:5; we render at 2x.
    width: 1080,
    height: 1350,
    safePadding: 72, // px of untouchable margin on every side
    overlayTopOpacity: 0.35, // dark scrim at top for logo legibility
    overlayBottomOpacity: 0.82, // stronger scrim at bottom under headline
  },

  /** Fixed layout anchors — identical on every card ------------------- */
  layout: {
    logo: "top-left", // C-tile mark + wordmark
    categoryPill: "top-right", // signal-gradient pill
    headline: "bottom-left", // Anton, up to 3 lines
    watermark: "bottom-center", // @cantagio
    sourceLine: "above-watermark", // "via <source>"
  },

  /** Category tags (drives the top-right pill + hashtag set) ---------- */
  categories: [
    "TRENDING",
    "WORLD",
    "TECH",
    "SPORTS",
    "ENTERTAINMENT",
    "SPACE",
    "DID YOU KNOW",
  ] as const,

  /** Caption + hashtag style ----------------------------------------- */
  caption: {
    // Structure the AI writer must follow, every time:
    //   1) HOOK line (punchy, matches the card headline, may use 1 emoji)
    //   2) 1–2 sentences of context / the interesting detail
    //   3) CTA line (ask for a reaction: follow / comment / tag)
    //   4) blank line, then the fixed hashtag block
    cta: "Follow @cantagio so you always know it first.",
    maxContextSentences: 2,
    hashtagsCore: ["#cantagio", "#trending", "#didyouknow"],
    hashtagsBySize: 12, // total hashtags per post (core + topical)
  },
} as const;

export type Brand = typeof brand;
export default brand;
