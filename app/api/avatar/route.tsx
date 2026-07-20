import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full-bleed profile avatar (1080x1080): the ForgeBuzz spark centered on the
// Signal-Blue gradient. Full-bleed so Instagram/Facebook circle-cropping looks
// clean. Try /api/avatar or /api/avatar?size=512
const SPARK =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
  `<path d="M60 22 C 62 48 72 58 98 60 C 72 62 62 72 60 98 C 58 72 48 62 22 60 C 48 58 58 48 60 22 Z" fill="#0B1020"/>` +
  `</svg>`;
const URI = `data:image/svg+xml;base64,${Buffer.from(SPARK).toString("base64")}`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const size = Math.max(128, Math.min(1080, Number(searchParams.get("size")) || 1080));
  const mark = Math.round(size * 0.58);
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: "linear-gradient(135deg, #3E86FF 0%, #63C6F5 100%)",
        }}
      >
        <img src={URI} width={mark} height={mark} style={{ width: mark, height: mark }} />
      </div>
    ),
    { width: size, height: size },
  );
}
