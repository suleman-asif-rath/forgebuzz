import { NextResponse } from "next/server";
import { runReel } from "@/lib/pipeline";
import { authorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hit hourly by the reel cron; runReel self-gates to the dashboard's reel hour
// and to one reel per day. `?force=1` bypasses both gates for a manual run.
async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const summary = await runReel(force);
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[reel] failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
