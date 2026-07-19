import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";
import { authorized } from "@/lib/auth";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const patch = (await req.json()) as Partial<Settings>;
    const next = await updateSettings(patch);
    return NextResponse.json(next);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
