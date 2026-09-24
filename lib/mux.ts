// Build the finished reel with the bundled ffmpeg binary: burn the joke onto
// the stock clip, mix the music under it, and grab a cover frame.
//
// This replaced the old "copy the video stream, add audio" version. Burning
// text on forces a re-encode, so everything here is tuned for speed rather
// than quality: `ultrafast`, a hard 15s cap, and a single filter pass. Any
// failure throws, so the caller can fall back and never lose the day's reel.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);

/** Reels are capped short: it keeps the encode inside the serverless time
 *  budget, and short loops perform better anyway. */
const MAX_REEL_SECONDS = 15;

export interface BuiltReel {
  mp4: Buffer;
  /** A real frame from the finished video — so the grid thumbnail shows the
   *  actual meme, not a separate designed card. */
  cover: Buffer;
}

/** Burn `overlayPng` (1080x1920, transparent) onto the clip, mix `musicBuf`
 *  underneath, and return the mp4 plus a cover frame. Throws on failure. */
export async function buildReel(
  videoBuf: Buffer,
  musicBuf: Buffer | null,
  overlayPng: Buffer,
  durationSec: number,
): Promise<BuiltReel> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not available");
  const dir = os.tmpdir();
  const tag = randomBytes(6).toString("hex");
  const vIn = path.join(dir, `v-${tag}.mp4`);
  const aIn = path.join(dir, `a-${tag}.mp3`);
  const oIn = path.join(dir, `o-${tag}.png`);
  const out = path.join(dir, `out-${tag}.mp4`);
  const cover = path.join(dir, `cover-${tag}.png`);

  // Never exceed the clip's own length: the music is looped infinitely, so a
  // -t longer than the footage would tail off into frozen or black frames.
  // `-shortest` below is the real guarantee; this is the upper bound.
  const dur = Math.min(MAX_REEL_SECONDS, Math.max(1, Math.round(durationSec) || 12));

  try {
    await fs.writeFile(vIn, videoBuf);
    await fs.writeFile(oIn, overlayPng);
    if (musicBuf) await fs.writeFile(aIn, musicBuf);
    // Tracing can drop the executable bit off the bundled binary; restore it.
    try { await fs.chmod(ffmpegPath, 0o755); } catch { /* best effort */ }

    // Inputs: [0] music (looped) or silence, [1] the clip, [2] the text overlay.
    const inputs = musicBuf
      ? ["-stream_loop", "-1", "-i", aIn]
      : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];

    await run(
      ffmpegPath,
      [
        "-y",
        ...inputs,
        "-i", vIn,
        "-i", oIn,
        // Fill 1080x1920 whatever the source aspect, then lay the text on top.
        "-filter_complex",
        "[1:v]scale=1080:1920:force_original_aspect_ratio=increase," +
          "crop=1080:1920,setsar=1[bg];[bg][2:v]overlay=0:0[v]",
        "-map", "[v]",
        "-map", "0:a:0",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac", "-b:a", "128k",
        "-af", "volume=0.7,afade=t=in:st=0:d=1.5",
        "-t", String(dur),
        // End with the video stream, not the infinitely-looped music.
        "-shortest",
        "-movflags", "+faststart",
        out,
      ],
      { timeout: 40_000, maxBuffer: 1 << 26 },
    );

    // Cover frame from the finished video, so it matches exactly what plays.
    await run(
      ffmpegPath,
      ["-y", "-ss", "0.5", "-i", out, "-frames:v", "1", "-q:v", "2", cover],
      { timeout: 12_000, maxBuffer: 1 << 26 },
    );

    return { mp4: await fs.readFile(out), cover: await fs.readFile(cover) };
  } finally {
    for (const f of [vIn, aIn, oIn, out, cover]) {
      try { await fs.unlink(f); } catch { /* ignore */ }
    }
  }
}
