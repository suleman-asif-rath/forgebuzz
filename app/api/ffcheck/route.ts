import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import { authorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const run = promisify(execFile);

// Temporary diagnostic: confirms the bundled ffmpeg binary exists and runs in
// the serverless function. Remove once music mixing is verified.
async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const info: Record<string, unknown> = { path: ffmpegPath ?? null, exists: false, version: null, error: null };
  if (!ffmpegPath) {
    info.error = "ffmpeg-static returned no path";
    return NextResponse.json(info);
  }
  try {
    await fs.access(ffmpegPath);
    info.exists = true;
  } catch (e) {
    info.error = `access: ${(e as Error).message}`;
  }
  try {
    await fs.chmod(ffmpegPath, 0o755);
  } catch { /* best effort */ }
  try {
    const { stdout } = await run(ffmpegPath, ["-version"], { maxBuffer: 1 << 20 });
    info.version = stdout.split("\n")[0];
  } catch (e) {
    info.error = `${info.error ? info.error + " | " : ""}exec: ${(e as Error).message}`;
  }
  return NextResponse.json(info);
}

export const GET = handle;
export const POST = handle;
