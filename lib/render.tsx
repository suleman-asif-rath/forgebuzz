import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MemeSpec } from "./types";

// --- brand constants (kept in sync with brand/brand.ts) ------------
const INK = "#0F1117";
const MEME_WHITE = "#FFFFFF"; // meme text is pure white on purpose — it is not body text
const OUTLINE = "#000000";
const OUTLINE_W = 7;

const FONT_DIR = path.join(process.cwd(), "brand", "fonts");
const fontFile = (f: string) => readFileSync(path.join(FONT_DIR, f));

// Loaded once at module init.
const FONTS = [
  { name: "Anton", data: fontFile("anton.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Manrope", data: fontFile("manrope-400.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Manrope", data: fontFile("manrope-700.woff"), weight: 700 as const, style: "normal" as const },
  { name: "Manrope", data: fontFile("manrope-800.woff"), weight: 800 as const, style: "normal" as const },
];

/** The meme-text outline.
 *
 *  Satori does not reliably support `-webkit-text-stroke`, so the black outline
 *  is built from layered text-shadows ringing the glyph. 16 points around the
 *  circle plus the cardinals reads as a solid stroke at meme sizes; fewer
 *  points leaves visible gaps on diagonal strokes.
 */
function outlineShadow(width = OUTLINE_W, color = OUTLINE): string {
  const layers: string[] = [];
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.round(Math.cos(a) * width * 100) / 100;
    const y = Math.round(Math.sin(a) * width * 100) / 100;
    layers.push(`${x}px ${y}px 0 ${color}`);
  }
  // A soft drop shadow underneath lifts the text off a busy photo.
  layers.push(`0 ${Math.round(width * 0.9)}px ${width * 2}px rgba(0,0,0,0.55)`);
  return layers.join(", ");
}

const MEME_SHADOW = outlineShadow();

/** Meme text shrinks as it gets longer so a long line never overflows. */
function memeSize(len: number, base: number): number {
  if (len <= 18) return base;
  if (len <= 28) return Math.round(base * 0.86);
  if (len <= 40) return Math.round(base * 0.72);
  if (len <= 56) return Math.round(base * 0.6);
  return Math.round(base * 0.5);
}

function MemeText({ text, size }: { text: string; size: number }) {
  return (
    <span
      style={{
        fontFamily: "Anton",
        fontSize: size,
        lineHeight: 1.02,
        color: MEME_WHITE,
        textTransform: "uppercase",
        textAlign: "center",
        letterSpacing: 0.5,
        textShadow: MEME_SHADOW,
        // Satori needs an explicit width to wrap centred text predictably.
        width: "100%",
        display: "flex",
        justifyContent: "center",
      }}
    >
      {text}
    </span>
  );
}

function Watermark({ size = 26 }: { size?: number }) {
  return (
    <span
      style={{
        fontFamily: "Manrope",
        fontWeight: 800,
        fontSize: size,
        letterSpacing: 3,
        textTransform: "lowercase",
        color: "rgba(255,255,255,0.88)",
        textShadow: outlineShadow(3),
      }}
    >
      @forgee.buzz
    </span>
  );
}

// --- the still meme (1080x1350, IG 4:5) -----------------------------

function MemeCard(spec: MemeSpec) {
  const W = 1080;
  const H = 1350;
  const hasTop = !!spec.topText;
  const hasBottom = !!spec.bottomText;

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        position: "relative",
        backgroundColor: INK,
        fontFamily: "Manrope",
      }}
    >
      {/* the photo the joke sits on */}
      {spec.photoUrl ? (
        <img
          src={spec.photoUrl}
          width={W}
          height={H}
          style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            backgroundImage: "linear-gradient(150deg, #2A1B2E 0%, #0F1117 78%)",
          }}
        />
      )}

      {/* a light scrim top and bottom so white text survives a bright photo */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          backgroundImage:
            "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 68%, rgba(0,0,0,0.52) 100%)",
        }}
      />

      {/* the joke */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: hasTop && hasBottom ? "space-between" : hasTop ? "flex-start" : "flex-end",
          alignItems: "center",
          width: W,
          height: H,
          paddingTop: 56,
          paddingLeft: 56,
          paddingRight: 56,
          // Extra clearance so a bottom line never crowds the watermark.
          paddingBottom: 104,
        }}
      >
        {hasTop ? <MemeText text={spec.topText} size={memeSize(spec.topText.length, 92)} /> : null}
        {hasBottom ? <MemeText text={spec.bottomText} size={memeSize(spec.bottomText.length, 92)} /> : null}
      </div>

      {/* watermark */}
      <div style={{ position: "absolute", bottom: 22, right: 30, display: "flex" }}>
        <Watermark />
      </div>
    </div>
  );
}

/** Render a meme to PNG bytes (1080x1350). */
export async function renderMemePng(spec: MemeSpec): Promise<Buffer> {
  const res = new ImageResponse(MemeCard(spec), { width: 1080, height: 1350, fonts: FONTS });
  return Buffer.from(await res.arrayBuffer());
}

// --- the reel text overlay (1080x1920, transparent) ------------------
// Rendered with no background so ffmpeg can composite it straight onto the
// stock clip (see lib/mux.ts). The bottom text sits well above the bottom edge
// because Instagram's own UI covers roughly the lowest fifth of a reel.

function ReelOverlay(spec: MemeSpec) {
  const W = 1080;
  const H = 1920;
  const hasTop = !!spec.topText;
  const hasBottom = !!spec.bottomText;

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        justifyContent: hasTop && hasBottom ? "space-between" : hasTop ? "flex-start" : "flex-end",
        alignItems: "center",
        backgroundColor: "transparent",
        fontFamily: "Manrope",
        paddingTop: 170,
        paddingLeft: 60,
        paddingRight: 60,
        paddingBottom: 380, // clear of the IG caption / action rail
      }}
    >
      {hasTop ? <MemeText text={spec.topText} size={memeSize(spec.topText.length, 86)} /> : null}
      {hasBottom ? <MemeText text={spec.bottomText} size={memeSize(spec.bottomText.length, 86)} /> : null}
    </div>
  );
}

/** Render the reel's text as a transparent PNG (1080x1920) for compositing. */
export async function renderMemeOverlayPng(spec: MemeSpec): Promise<Buffer> {
  const res = new ImageResponse(ReelOverlay(spec), { width: 1080, height: 1920, fonts: FONTS });
  return Buffer.from(await res.arrayBuffer());
}

/** Fallback reel cover (1080x1920) used only when a real frame cannot be
 *  grabbed from the finished video. Same joke, on the gradient. */
export async function renderReelCoverPng(spec: MemeSpec): Promise<Buffer> {
  const res = new ImageResponse(
    MemeCard({ ...spec, photoUrl: spec.photoUrl ?? null }),
    { width: 1080, height: 1350, fonts: FONTS },
  );
  return Buffer.from(await res.arrayBuffer());
}
