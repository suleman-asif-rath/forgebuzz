// Persistence layer with two interchangeable backends:
//   - Supabase (production): Postgres tables + Storage bucket.
//   - Local files (dev fallback): data/*.json + public/generated/*.png.
// The rest of the app only sees the Store interface below.

import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { PostRow, Settings } from "./types";

export interface Store {
  saveImage(id: string, png: Buffer): Promise<{ imagePath: string; imageUrl: string }>;
  saveVideo(id: string, mp4: Buffer): Promise<{ videoPath: string; videoUrl: string }>;
  getUsedFingerprints(): Promise<Set<string>>;
  markTopicUsed(fp: string): Promise<void>;
  enqueue(rows: PostRow[]): Promise<void>;
  listRecent(limit: number): Promise<PostRow[]>;
  getDue(nowISO: string): Promise<PostRow[]>;
  markPosted(id: string, ids: { fbId?: string | null; igId?: string | null }): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  deletePost(id: string): Promise<void>;
  getSettings(): Promise<Partial<Settings> | null>;
  saveSettings(settings: Settings): Promise<void>;
  // Runtime secrets (e.g. the Meta token) so they can be rotated without a
  // redeploy. Stored in the settings table under id='secrets'.
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
}

// ---------------------------------------------------------------- file store
const DATA_DIR = path.join(process.cwd(), "data");
const PUB_DIR = path.join(process.cwd(), "public", "generated");
const QUEUE = path.join(DATA_DIR, "queue.json");
const USED = path.join(DATA_DIR, "used.json");
const SETTINGS = path.join(DATA_DIR, "settings.json");
const SECRETS = path.join(DATA_DIR, "secrets.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

class FileStore implements Store {
  async saveImage(id: string, png: Buffer) {
    await fs.mkdir(PUB_DIR, { recursive: true });
    await fs.writeFile(path.join(PUB_DIR, `${id}.png`), png);
    const imagePath = `/generated/${id}.png`;
    return { imagePath, imageUrl: `${config.baseUrl}${imagePath}` };
  }
  async saveVideo(id: string, mp4: Buffer) {
    await fs.mkdir(PUB_DIR, { recursive: true });
    await fs.writeFile(path.join(PUB_DIR, `${id}.mp4`), mp4);
    const videoPath = `/generated/${id}.mp4`;
    return { videoPath, videoUrl: `${config.baseUrl}${videoPath}` };
  }
  async getUsedFingerprints() {
    return new Set(await readJson<string[]>(USED, []));
  }
  async markTopicUsed(fp: string) {
    const used = await readJson<string[]>(USED, []);
    if (!used.includes(fp)) {
      used.push(fp);
      await writeJson(USED, used.slice(-2000)); // cap history
    }
  }
  async enqueue(rows: PostRow[]) {
    const q = await readJson<PostRow[]>(QUEUE, []);
    await writeJson(QUEUE, [...rows, ...q].slice(0, 500));
  }
  async listRecent(limit: number) {
    const q = await readJson<PostRow[]>(QUEUE, []);
    return q
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }
  async getDue(nowISO: string) {
    const q = await readJson<PostRow[]>(QUEUE, []);
    return q.filter((r) => r.status === "queued" && r.scheduledFor <= nowISO);
  }
  private async patch(id: string, fn: (r: PostRow) => void) {
    const q = await readJson<PostRow[]>(QUEUE, []);
    const row = q.find((r) => r.id === id);
    if (row) {
      fn(row);
      await writeJson(QUEUE, q);
    }
  }
  async markPosted(id: string, ids: { fbId?: string | null; igId?: string | null }) {
    await this.patch(id, (r) => {
      r.status = "posted";
      r.fbId = ids.fbId ?? null;
      r.igId = ids.igId ?? null;
      r.error = null;
    });
  }
  async markFailed(id: string, error: string) {
    await this.patch(id, (r) => {
      r.status = "failed";
      r.error = error;
    });
  }
  async deletePost(id: string) {
    const q = await readJson<PostRow[]>(QUEUE, []);
    await writeJson(QUEUE, q.filter((r) => r.id !== id));
  }
  async getSettings() {
    return readJson<Partial<Settings> | null>(SETTINGS, null);
  }
  async saveSettings(settings: Settings) {
    await writeJson(SETTINGS, settings);
  }
  async getSecret(key: string) {
    const s = await readJson<Record<string, string>>(SECRETS, {});
    return s[key] ?? null;
  }
  async setSecret(key: string, value: string) {
    const s = await readJson<Record<string, string>>(SECRETS, {});
    s[key] = value;
    await writeJson(SECRETS, s);
  }
}

// ------------------------------------------------------------ supabase store
class SupabaseStore implements Store {
  private client: any;
  private async db() {
    if (!this.client) {
      const { createClient } = await import("@supabase/supabase-js");
      this.client = createClient(config.supabase.url, config.supabase.key, {
        auth: { persistSession: false },
      });
    }
    return this.client;
  }
  async saveImage(id: string, png: Buffer) {
    const db = await this.db();
    const key = `cards/${id}.png`;
    const { error } = await db.storage
      .from(config.supabase.bucket)
      .upload(key, png, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`storage upload: ${error.message}`);
    const { data } = db.storage.from(config.supabase.bucket).getPublicUrl(key);
    return { imagePath: key, imageUrl: data.publicUrl as string };
  }
  async saveVideo(id: string, mp4: Buffer) {
    const db = await this.db();
    const key = `reels/${id}.mp4`;
    const { error } = await db.storage
      .from(config.supabase.bucket)
      .upload(key, mp4, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`video upload: ${error.message}`);
    const { data } = db.storage.from(config.supabase.bucket).getPublicUrl(key);
    return { videoPath: key, videoUrl: data.publicUrl as string };
  }
  async getUsedFingerprints() {
    const db = await this.db();
    const { data } = await db.from("used_topics").select("fingerprint");
    return new Set<string>((data ?? []).map((r: any) => String(r.fingerprint)));
  }
  async markTopicUsed(fp: string) {
    const db = await this.db();
    await db.from("used_topics").upsert({ fingerprint: fp }, { onConflict: "fingerprint" });
  }
  async enqueue(rows: PostRow[]) {
    const db = await this.db();
    const { error } = await db.from("posts").insert(rows.map(toDb));
    if (error) throw new Error(`enqueue: ${error.message}`);
  }
  async listRecent(limit: number) {
    const db = await this.db();
    const { data } = await db
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map(fromDb);
  }
  async getDue(nowISO: string) {
    const db = await this.db();
    const { data } = await db
      .from("posts")
      .select("*")
      .eq("status", "queued")
      .lte("scheduled_for", nowISO);
    return (data ?? []).map(fromDb);
  }
  async markPosted(id: string, ids: { fbId?: string | null; igId?: string | null }) {
    const db = await this.db();
    await db
      .from("posts")
      .update({ status: "posted", fb_id: ids.fbId ?? null, ig_id: ids.igId ?? null, error: null })
      .eq("id", id);
  }
  async markFailed(id: string, error: string) {
    const db = await this.db();
    await db.from("posts").update({ status: "failed", error }).eq("id", id);
  }
  async deletePost(id: string) {
    const db = await this.db();
    await db.from("posts").delete().eq("id", id);
  }
  async getSettings() {
    const db = await this.db();
    const { data } = await db.from("settings").select("data").eq("id", "default").maybeSingle();
    return (data?.data as Partial<Settings> | undefined) ?? null;
  }
  async saveSettings(settings: Settings) {
    const db = await this.db();
    const { error } = await db
      .from("settings")
      .upsert({ id: "default", data: settings, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(`saveSettings: ${error.message}`);
  }
  async getSecret(key: string) {
    const db = await this.db();
    const { data } = await db.from("settings").select("data").eq("id", "secrets").maybeSingle();
    const obj = (data?.data as Record<string, string> | undefined) || {};
    return obj[key] ?? null;
  }
  async setSecret(key: string, value: string) {
    const db = await this.db();
    const { data } = await db.from("settings").select("data").eq("id", "secrets").maybeSingle();
    const obj = (data?.data as Record<string, string> | undefined) || {};
    obj[key] = value;
    const { error } = await db
      .from("settings")
      .upsert({ id: "secrets", data: obj, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(`setSecret: ${error.message}`);
  }
}

// snake_case <-> camelCase mapping for the posts table.
function toDb(r: PostRow) {
  return {
    id: r.id,
    created_at: r.createdAt,
    scheduled_for: r.scheduledFor,
    status: r.status,
    media_type: r.mediaType ?? "image",
    category: r.category,
    template: r.template,
    headline: r.headline,
    caption: r.caption,
    hashtags: r.hashtags,
    source: r.source,
    source_url: r.sourceUrl,
    topic_fingerprint: r.topicFingerprint,
    image_path: r.imagePath,
    image_url: r.imageUrl,
    video_url: r.videoUrl ?? null,
    fb_id: r.fbId ?? null,
    ig_id: r.igId ?? null,
    error: r.error ?? null,
  };
}
function fromDb(r: any): PostRow {
  return {
    id: r.id,
    createdAt: r.created_at,
    scheduledFor: r.scheduled_for,
    status: r.status,
    mediaType: (r.media_type as "image" | "reel") ?? "image",
    category: r.category,
    template: r.template,
    headline: r.headline,
    caption: r.caption,
    hashtags: r.hashtags ?? [],
    source: r.source,
    sourceUrl: r.source_url,
    topicFingerprint: r.topic_fingerprint,
    imagePath: r.image_path,
    imageUrl: r.image_url,
    videoUrl: r.video_url ?? null,
    fbId: r.fb_id,
    igId: r.ig_id,
    error: r.error,
  };
}

let _store: Store | null = null;
export function getStore(): Store {
  if (!_store) _store = config.supabase.on ? new SupabaseStore() : new FileStore();
  return _store;
}
