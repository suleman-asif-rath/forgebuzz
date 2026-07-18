import { NextResponse } from "next/server";
import { runGenerate } from "@/lib/pipeline";
import { authorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runGenerate();
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[generate] failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle; // convenient for manual runs in a browser (dev)
