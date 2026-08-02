// Curated calming, royalty-free (CC0 / public-domain) background tracks for
// reels. The audio files are hosted in the Supabase bucket under `music/`, so
// they load fast and stay under our control. One is picked at random per reel.
//
// To add or change tracks: upload the mp3 to the bucket's `music/` folder and
// add its filename here. Keep everything CC0 / public domain to avoid copyright
// issues on the brand's accounts.

import { config } from "./config";

// Filenames present in `<bucket>/music/`. Empty = reels post without music.
// All six are CC0 (public domain), a calming mix of ambient, soft piano and
// lo-fi (sourced from Internet Archive item `cloud-music-4`, re-hosted here).
const TRACKS: string[] = [
  "ambient-1.mp3",
  "ambient-2.mp3",
  "piano-1.mp3",
  "piano-2.mp3",
  "lofi-1.mp3",
  "lofi-2.mp3",
];

/** Public URL of a random calming track, or null if none are configured. */
export function pickMusicUrl(): string | null {
  if (!TRACKS.length || !config.supabase.on) return null;
  const name = TRACKS[Math.floor(Math.random() * TRACKS.length)];
  const base = config.supabase.url.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${config.supabase.bucket}/music/${encodeURIComponent(name)}`;
}
