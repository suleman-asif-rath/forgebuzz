import { config } from "./config";

/** Find a portrait background photo for a keyword. Tries Pexels first, then
 *  Pixabay. Returns a public image URL, or null (renderer falls back to a
 *  branded gradient). */
async function fromPexels(keyword: string): Promise<string | null> {
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
    const pick = photos[Math.floor(Math.random() * Math.min(6, photos.length))];
    return pick?.src?.portrait || pick?.src?.large || null;
  } catch (e) {
    console.warn(`[pexels] ${(e as Error).message}`);
    return null;
  }
}

async function fromPixabay(keyword: string): Promise<string | null> {
  if (!config.pixabay.on) return null;
  try {
    const url =
      `https://pixabay.com/api/?key=${config.pixabay.key}&q=${encodeURIComponent(keyword)}` +
      `&image_type=photo&orientation=vertical&safesearch=true&per_page=12`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`pixabay ${res.status}`);
    const j = await res.json();
    const hits = j?.hits ?? [];
    if (!hits.length) return null;
    const pick = hits[Math.floor(Math.random() * Math.min(6, hits.length))];
    return pick?.largeImageURL || pick?.webformatURL || null;
  } catch (e) {
    console.warn(`[pixabay] ${(e as Error).message}`);
    return null;
  }
}

export async function findBackground(keyword: string): Promise<string | null> {
  return (await fromPexels(keyword)) || (await fromPixabay(keyword));
}
