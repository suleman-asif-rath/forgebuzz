import { NextResponse } from "next/server";
import { runPublish } from "@/lib/pipeline";
import { authorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runPublish();
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[publish] failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
