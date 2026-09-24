#!/usr/bin/env node
/**
 * One-off switchover for the news -> memes pivot.
 *
 * Deletes every UNPOSTED (status = 'queued') row so no stale news headline
 * goes out after the change. Posts already published are left alone, and
 * nothing is touched on Instagram or Facebook — this only clears ForgeBuzz's
 * own queue table.
 *
 * Usage:
 *   node scripts/flush-news-queue.mjs          # preview only, deletes nothing
 *   node scripts/flush-news-queue.mjs --yes    # actually delete
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.join(HERE, "..", ".env.local");

function loadEnv(file) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(ENV), ...process.env };
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (checked .env.local and the environment).");
  process.exit(1);
}

const apply = process.argv.includes("--yes");
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: queued, error } = await db
  .from("posts")
  .select("id, created_at, category, headline")
  .eq("status", "queued")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Could not read the queue:", error.message);
  process.exit(1);
}

if (!queued?.length) {
  console.log("Queue is already empty. Nothing to do.");
  process.exit(0);
}

console.log(`${queued.length} unposted item${queued.length === 1 ? "" : "s"} in the queue:\n`);
for (const r of queued) {
  console.log(`  [${r.category}] ${String(r.headline).slice(0, 72)}`);
}

if (!apply) {
  console.log(`\nPreview only — nothing deleted. Re-run with --yes to clear these.`);
  process.exit(0);
}

const { error: delErr } = await db.from("posts").delete().eq("status", "queued");
if (delErr) {
  console.error("Delete failed:", delErr.message);
  process.exit(1);
}
console.log(`\nCleared ${queued.length} queued item${queued.length === 1 ? "" : "s"}.`);
console.log("Posted history and your live IG/FB feeds are untouched.");
