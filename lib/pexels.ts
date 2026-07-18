import { config } from "./config";

/** Find a portrait background photo for a keyword. Returns a public image URL,
 *  or null when Pexels is off or nothing matches (renderer falls back to a
 *  branded gradient). */
export async function findBackground(keyword: string): Promise<string | null> {
  if (!config.pexels.on) return null;
  try {
    const url =
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}` +
      `&orientation=portrait&per_page=12`;
    const res = await fetch(url, {
      headers: { Authorization: config.pexels.key },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`pexels ${res.status}`);
    const j = await res.json();
    const photos = j?.photos ?? [];
    if (!photos.length) return null;
    // Pick from the top few for a little variety.
    const pick = photos[Math.floor(Math.random() * Math.min(6, photos.length))];
    return pick?.src?.portrait || pick?.src?.large || null;
  } catch (e) {
    console.warn(`[pexels] ${(e as Error).message}`);
    return null;
  }
}
