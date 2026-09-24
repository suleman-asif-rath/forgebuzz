import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Facebook Page cover (1640x624; safe content centered for mobile cropping).
const INK = "#0B1020";
const TEXT = "#EDF1FA";
const ACCENT = "#FFA63D";
const MUTED = "#9AA3B6";

const FONT_DIR = path.join(process.cwd(), "brand", "fonts");
const fontFile = (f: string) => readFileSync(path.join(FONT_DIR, f));
const FONTS = [
  { name: "Anton", data: fontFile("anton.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Manrope", data: fontFile("manrope-700.woff"), weight: 700 as const, style: "normal" as const },
];

const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
  `<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">` +
  `<stop offset="0" stop-color="#FF3D71"/><stop offset="1" stop-color="#FFA63D"/></linearGradient></defs>` +
  `<rect x="8" y="8" width="104" height="104" rx="27" fill="url(#g)"/>` +
  `<path d="M60 22 C 62 48 72 58 98 60 C 72 62 62 72 60 98 C 58 72 48 62 22 60 C 48 58 58 48 60 22 Z" fill="#0B1020"/>` +
  `</svg>`;
const LOGO_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

export async function GET() {
  return new ImageResponse(
    (
      <div style={{ width: 1640, height: 624, display: "flex", position: "relative", backgroundColor: INK }}>
        <div
          style={{
            position: "absolute", top: 0, left: 0, width: 1640, height: 624,
            backgroundImage: "radial-gradient(48% 100% at 50% 8%, rgba(99,198,245,0.20), transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute", top: 0, left: 0, width: 1640, height: 624,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
            <img src={LOGO_URI} width={120} height={120} style={{ width: 120, height: 120, marginRight: 28 }} />
            <span style={{ fontFamily: "Anton", fontSize: 118, textTransform: "uppercase", letterSpacing: 1, color: TEXT }}>Forge</span>
            <span style={{ fontFamily: "Anton", fontSize: 118, textTransform: "uppercase", letterSpacing: 1, color: ACCENT }}>Buzz</span>
          </div>
          <span style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 36, color: MUTED, marginTop: 26, letterSpacing: 0.5 }}>
            Know it before it&apos;s everywhere.
          </span>
          <span style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 24, color: "rgba(237,241,250,0.55)", marginTop: 40, letterSpacing: 6, textTransform: "uppercase" }}>
            @forgee.buzz
          </span>
        </div>
      </div>
    ),
    { width: 1640, height: 624, fonts: FONTS },
  );
}
