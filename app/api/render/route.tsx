import { renderCardPng } from "@/lib/render";
import type { CardSpec, TemplateKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live preview of a card. Try:
//   /api/render
//   /api/render?template=fact&stat=8%20MIN&headline=is%20how%20long%20sunlight%20takes%20to%20reach%20Earth&category=DID%20YOU%20KNOW
//   /api/render?template=question&headline=Would%20you%20take%20a%20one-way%20trip%20to%20Mars%3F
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const spec: CardSpec = {
    template: (searchParams.get("template") as TemplateKind) || "headline",
    category: (searchParams.get("category") || "TRENDING").toUpperCase(),
    headline:
      searchParams.get("headline") ||
      "NASA found water ice on the Moon's sunlit surface",
    stat: searchParams.get("stat") || undefined,
    source: searchParams.get("source") || "NASA",
    backgroundUrl: null,
  };
  const png = await renderCardPng(spec);
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
