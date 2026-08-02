// Mix a music track over a stock video clip using the bundled ffmpeg binary.
// The video stream is copied (no re-encode, so this is fast); only the audio is
// encoded. Any failure throws, so the caller can fall back to the silent clip
// and never lose the day's reel.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);

/** Return the clip with `musicBuf` mixed in as background audio (looped/trimmed
 *  to the clip length, gentle fade-in, softened volume). Throws on failure. */
export async function muxMusicOntoVideo(
  videoBuf: Buffer,
  musicBuf: Buffer,
  durationSec: number,
): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not available");
  const dir = os.tmpdir();
  const tag = randomBytes(6).toString("hex");
  const vIn = path.join(dir, `v-${tag}.mp4`);
  const aIn = path.join(dir, `a-${tag}.mp3`);
  const out = path.join(dir, `out-${tag}.mp4`);
  const dur = Math.max(3, Math.min(60, Math.round(durationSec) || 15));
  try {
    await fs.writeFile(vIn, videoBuf);
    await fs.writeFile(aIn, musicBuf);
    // Tracing can drop the executable bit off the bundled binary; restore it.
    try { await fs.chmod(ffmpegPath, 0o755); } catch { /* best effort */ }

    await run(
      ffmpegPath,
      [
        "-y",
        "-stream_loop", "-1", "-i", aIn, // loop the music to cover the clip
        "-i", vIn,
        "-map", "1:v:0", "-map", "0:a:0", // video from clip, audio from music
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        "-af", "volume=0.7,afade=t=in:st=0:d=1.5",
        "-t", String(dur),
        "-movflags", "+faststart",
        out,
      ],
      { timeout: 45_000, maxBuffer: 1 << 26 },
    );
    return await fs.readFile(out);
  } finally {
    for (const f of [vIn, aIn, out]) {
      try { await fs.unlink(f); } catch { /* ignore */ }
    }
  }
}
