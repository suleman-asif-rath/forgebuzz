import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CardSpec } from "./types";

// --- brand constants (kept in sync with brand/brand.ts) ------------
const INK = "#0B1020";
const TEXT = "#EDF1FA";
const MUTED = "#8B93A8";
const ACCENT = "#63C6F5"; // solid stand-in for the gradient (Satori can't clip text)
const SIGNAL = "linear-gradient(135deg, #3E86FF 0%, #63C6F5 100%)";

const FONT_DIR = path.join(process.cwd(), "brand", "fonts");
const fontFile = (f: string) => readFileSync(path.join(FONT_DIR, f));

// Loaded once at module init.
const FONTS = [
  { name: "Anton", data: fontFile("anton.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Manrope", data: fontFile("manrope-400.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Manrope", data: fontFile("manrope-700.woff"), weight: 700 as const, style: "normal" as const },
  { name: "Manrope", data: fontFile("manrope-800.woff"), weight: 800 as const, style: "normal" as const },
];

// The Spark-Tile logo, inlined as an SVG data URI so Satori can rasterise it.
const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
  `<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">` +
  `<stop offset="0" stop-color="#3E86FF"/><stop offset="1" stop-color="#63C6F5"/></linearGradient></defs>` +
  `<rect x="8" y="8" width="104" height="104" rx="27" fill="url(#g)"/>` +
  `<path d="M60 22 C 62 48 72 58 98 60 C 72 62 62 72 60 98 C 58 72 48 62 22 60 C 48 58 58 48 60 22 Z" fill="#0B1020"/>` +
  `</svg>`;
const LOGO_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

function headlineSize(len: number): number {
  if (len <= 30) return 116;
  if (len <= 52) return 94;
  if (len <= 78) return 74;
  return 60;
}

function gradientFor(spec: CardSpec): string {
  if (spec.template === "fact") return "linear-gradient(160deg, #18233f 0%, #0B1020 72%)";
  if (spec.category === "SPACE") return "linear-gradient(160deg, #101a33 0%, #05070f 90%)";
  return "linear-gradient(160deg, #142446 0%, #070b16 92%)";
}

function CardElement(spec: CardSpec) {
  const usePhoto = spec.template !== "fact" && !!spec.backgroundUrl;
  const hSize = headlineSize(spec.headline.length);

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        display: "flex",
        position: "relative",
        backgroundColor: INK,
        color: TEXT,
        fontFamily: "Manrope",
      }}
    >
      {/* background */}
      {usePhoto ? (
        <img
          src={spec.backgroundUrl as string}
          width={1080}
          height={1350}
          style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1350, objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1350, backgroundImage: gradientFor(spec) }} />
      )}

      {/* scrim for legibility */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1080,
          height: 1350,
          backgroundImage:
            "linear-gradient(180deg, rgba(11,16,32,0.45) 0%, rgba(11,16,32,0) 30%, rgba(11,16,32,0.20) 55%, rgba(11,16,32,0.94) 100%)",
        }}
      />

      {/* content */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 1080,
          height: 1350,
          padding: 72,
        }}
      >
        {/* top row */}
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
            <img src={LOGO_URI} width={92} height={92} style={{ width: 92, height: 92 }} />
            <span style={{ fontFamily: "Anton", fontSize: 46, textTransform: "uppercase", letterSpacing: 1, marginLeft: 18 }}>
              Forge
            </span>
            <span style={{ fontFamily: "Anton", fontSize: 46, textTransform: "uppercase", letterSpacing: 1, color: ACCENT }}>
              Buzz
            </span>
          </div>
          <div
            style={{
              display: "flex",
              backgroundImage: SIGNAL,
              color: "#071022",
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: 2,
              textTransform: "uppercase",
              padding: "12px 24px",
              borderRadius: 999,
            }}
          >
            {spec.category}
          </div>
        </div>

        {/* bottom block */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {spec.template === "fact" && spec.stat ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "Anton", fontSize: 200, lineHeight: 0.88, color: ACCENT, textTransform: "uppercase" }}>
                {spec.stat}
              </span>
              <span style={{ fontFamily: "Anton", fontSize: 52, lineHeight: 1.0, textTransform: "uppercase", marginTop: 8 }}>
                {spec.headline}
              </span>
            </div>
          ) : (
            <span style={{ fontFamily: "Anton", fontSize: hSize, lineHeight: 0.95, textTransform: "uppercase" }}>
              {spec.headline}
            </span>
          )}
          {spec.source ? (
            <span style={{ fontFamily: "Manrope", fontSize: 26, color: MUTED, marginTop: 22 }}>
              via {spec.source}
            </span>
          ) : null}
        </div>
      </div>

      {/* watermark */}
      <div style={{ position: "absolute", bottom: 40, left: 0, width: 1080, display: "flex", justifyContent: "center" }}>
        <span style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 26, letterSpacing: 6, textTransform: "uppercase", color: "rgba(237,241,250,0.72)" }}>
          @forgee.buzz
        </span>
      </div>
    </div>
  );
}

/** Render a card to PNG bytes (1080x1350). */
export async function renderCardPng(spec: CardSpec): Promise<Buffer> {
  const res = new ImageResponse(CardElement(spec), {
    width: 1080,
    height: 1350,
    fonts: FONTS,
  });
  return Buffer.from(await res.arrayBuffer());
}

// --- Reel cover (9:16) ---------------------------------------------
// The video body is stock footage, so the cover carries the brand: it's the
// thumbnail people see in the grid and before the reel plays.
function reelHeadlineSize(len: number): number {
  if (len <= 28) return 104;
  if (len <= 50) return 84;
  if (len <= 76) return 66;
  return 54;
}

function ReelCover(spec: CardSpec) {
  const hSize = reelHeadlineSize(spec.headline.length);
  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        backgroundColor: INK,
        backgroundImage: "linear-gradient(160deg, #142446 0%, #070b16 92%)",
        color: TEXT,
        fontFamily: "Manrope",
        padding: 84,
      }}
    >
      {/* top row: logo + category */}
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          <img src={LOGO_URI} width={96} height={96} style={{ width: 96, height: 96 }} />
          <span style={{ fontFamily: "Anton", fontSize: 50, textTransform: "uppercase", letterSpacing: 1, marginLeft: 18 }}>Forge</span>
          <span style={{ fontFamily: "Anton", fontSize: 50, textTransform: "uppercase", letterSpacing: 1, color: ACCENT }}>Buzz</span>
        </div>
        <div
          style={{
            display: "flex",
            backgroundImage: SIGNAL,
            color: "#071022",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: 2,
            textTransform: "uppercase",
            padding: "12px 26px",
            borderRadius: 999,
          }}
        >
          {spec.category}
        </div>
      </div>

      {/* centre: play chip + headline */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 40 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 96,
              height: 96,
              borderRadius: 999,
              backgroundImage: SIGNAL,
              color: "#071022",
              fontSize: 46,
            }}
          >
            ▶
          </div>
          <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 30, letterSpacing: 6, textTransform: "uppercase", color: "rgba(237,241,250,0.8)", marginLeft: 24 }}>
            Watch
          </span>
        </div>
        <span style={{ fontFamily: "Anton", fontSize: hSize, lineHeight: 0.96, textTransform: "uppercase" }}>
          {spec.headline}
        </span>
        {spec.source ? (
          <span style={{ fontFamily: "Manrope", fontSize: 28, color: MUTED, marginTop: 26 }}>via {spec.source}</span>
        ) : null}
      </div>

      {/* watermark */}
      <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        <span style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: "rgba(237,241,250,0.72)" }}>
          @forgee.buzz
        </span>
      </div>
    </div>
  );
}

/** Render a reel cover / thumbnail to PNG bytes (1080x1920). */
export async function renderReelCoverPng(spec: CardSpec): Promise<Buffer> {
  const res = new ImageResponse(ReelCover(spec), {
    width: 1080,
    height: 1920,
    fonts: FONTS,
  });
  return Buffer.from(await res.arrayBuffer());
}
