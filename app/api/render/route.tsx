import { renderMemePng, renderMemeOverlayPng } from "@/lib/render";
import { findBackground } from "@/lib/pexels";
import type { MemeSpec } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live preview of a meme. Try:
//   /api/render
//   /api/render?top=WHEN%20YOU%20SET%205%20ALARMS&bottom=AND%20WAKE%20UP%20AT%20NOON&photo=tired%20cat
//   /api/render?top=MY%20TOXIC%20TRAIT&bottom=OPENING%20THE%20FRIDGE%20AGAIN&overlay=1
//
// `photo=<keyword>` pulls a real stock photo so you can see the outline over a
// busy image. `overlay=1` returns the transparent reel overlay instead.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("photo");

  const spec: MemeSpec = {
    topText: (searchParams.get("top") ?? "WHEN YOU SET 5 ALARMS").toUpperCase(),
    bottomText: (searchParams.get("bottom") ?? "AND WAKE UP AT NOON").toUpperCase(),
    photoUrl: keyword ? await findBackground(keyword) : null,
  };

  const png = searchParams.get("overlay") === "1"
    ? await renderMemeOverlayPng(spec)
    : await renderMemePng(spec);

  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
