-- Chronicl daily snapshot: deduped raw headlines per topic filter.
--
-- Written by the `ingest-morning` Edge Function (service role) each
-- morning; read by the browser with the anon key (read-only, RLS).
--
-- Upsert contract (see the Edge Function's UPDATE ... WHERE hash differs):
--   - same dedupe_key + same content_hash  -> row UNTOUCHED (not re-copied)
--   - same dedupe_key + different hash      -> content updated, updated_at
--     bumped, and the row's last_seen date brought up to the ingest day;
--     first_seen is kept (when the story first landed on Chronicl)
--   - rows older than 14 days pruned by each run (the app only reads the
--     past 7 days; pruning has margin so a skipped morning can't empty it)

create table if not exists public.daily_headlines (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  category text not null,
  origin text not null,
  source_domain text not null,
  title text not null,
  url text not null,
  published_at date not null,
  image text,
  payload jsonb not null default '{}'::jsonb,
  content_hash text not null,
  first_seen date not null default current_date,
  last_seen date not null default current_date,
  updated_at timestamptz not null default now()
);

create index if not exists daily_headlines_category_published_idx
  on public.daily_headlines (category, published_at desc);

create index if not exists daily_headlines_last_seen_idx
  on public.daily_headlines (last_seen);

-- Read-only for the anon key. Writes happen ONLY through the ingest Edge
-- Function, which authenticates with the service role (which bypasses RLS).
alter table public.daily_headlines enable row level security;

drop policy if exists "anon reads daily headlines" on public.daily_headlines;
create policy "anon reads daily headlines"
  on public.daily_headlines
  for select
  to anon
  using (true);
