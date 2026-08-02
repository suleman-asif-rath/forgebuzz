-- ForgeBuzz Supabase schema.
-- Run this in the Supabase SQL editor once, then create a PUBLIC storage
-- bucket named "forgebuzz" (Storage -> New bucket -> Public).

create table if not exists posts (
  id text primary key,
  created_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  status text not null default 'queued',      -- queued | posted | failed
  media_type text not null default 'image',    -- image | reel
  category text not null,
  template text not null,                      -- headline | fact | question
  headline text not null,
  caption text not null,
  hashtags text[] not null default '{}',
  source text not null,
  source_url text not null,
  topic_fingerprint text not null,
  image_path text not null,
  image_url text not null,
  video_url text,                              -- reels only: the mp4 Meta fetches
  fb_id text,
  ig_id text,
  error text
);

create index if not exists posts_status_due_idx on posts (status, scheduled_for);
create index if not exists posts_created_idx on posts (created_at desc);

-- Migration for an existing posts table (safe to run repeatedly).
alter table posts add column if not exists media_type text not null default 'image';
alter table posts add column if not exists video_url text;

create table if not exists used_topics (
  fingerprint text primary key,
  used_at timestamptz not null default now()
);

-- Dashboard settings (single row, id = 'default'). Stored as JSON so new
-- options can be added without a migration.
create table if not exists settings (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- The app connects with the SERVICE key (server-side only), which bypasses
-- Row Level Security, so no policies are required for the pipeline itself.
-- Keep the service key secret (Vercel env var only). If you later add a
-- public dashboard, add RLS policies before exposing the anon key.
