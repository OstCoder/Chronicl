import { createClient } from '@supabase/supabase-js'
import { COMBINED_FEED_CAP, type AllTopicsFeed } from './liveFeed'
import { TOPIC_GROUPS } from '../data/topicGroups'
import type { StoryCategory } from '../types'
import type { TaggedArticle } from './liveFeed'

/**
 * The STORED SNAPSHOT feed — what topics look like when the daily
 * `ingest-morning` Edge Function has already written the past 7 days of
 * deduped headlines into Supabase (public.daily_headlines).
 *
 * HOW IT FITS THE PIPELINE:
 *   Every morning (cron): the Edge Function fetches GDELT + GNews, dedupes
 *   and upserts rows into Supabase — honoring the contract that an
 *   identical headline is NOT re-copied, and a changed one is kept in its
 *   UPDATED version (first_seen preserved, updated_at bumped).
 *   Every app visit: fetchStoredTopicsFeed() loads the snapshot rows and
 *   maps them into the exact AllTopicsFeed shape the store and UI already
 *   consume, so Groq grouping (still in-browser) and rendering work
 *   unchanged while NO live GDELT/GNews request runs at visit time. The
 *   snapshot only changes when the morning job writes new or updated
 *   rows — the "newly updated or new information from the past 7 days"
 *   the reader gets at every login.
 *   When Supabase is NOT configured (missing VITE_SUPABASE_* keys), the
 *   store falls back to the original live pipeline (fetchAllTopicsFeed).
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** TRUE when both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set. */
export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = supabaseReady
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      // Read-only snapshot access: no user sessions to persist (there is
      // no login by design — the anon key's RLS policy only allows SELECT).
      auth: { persistSession: false },
    })
  : null

/** The only table the anon key can read (migration 0001's RLS policy). */
const HEADLINE_TABLE = 'daily_headlines'

interface StoredHeadlineRow {
  dedupe_key: string
  category: string
  origin: string
  source_domain: string
  title: string
  url: string
  published_at: string
  image: string | null
  payload: { language?: string | null; sourceCountry?: string | null } | null
  first_seen: string
  updated_at: string
}

const VALID_CATEGORIES: ReadonlySet<StoryCategory> = new Set(
  TOPIC_GROUPS.map((group) => group.category),
)

/**
 * Read the stored snapshot (past 7 days) into the pipeline's feed shape.
 * Same post-conditions as fetchAllTopicsFeed: deduped rows, newest FIRST,
 * capped, per-category counts filled — Groq grouping can consume it as-is.
 */
export async function fetchStoredTopicsFeed(signal?: AbortSignal): Promise<AllTopicsFeed> {
  const autoBalanced: string[] = []
  const errors: string[] = []

  if (!supabase) {
    // Typesafety net: the caller only routes here when supabaseReady is
    // true; this branch renders as an honest error note, never a crash.
    return {
      articles: [],
      fetchedPerCategory: {},
      sourceStatus: { gdelt: 'failed', gnews: 'failed' },
      errors: ['Supabase env vars missing — stored snapshot read impossible.'],
      autoBalanced,
      pendingGdeltRetry: false,
    }
  }

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const builder = supabase
    .from(HEADLINE_TABLE)
    .select(
      'dedupe_key, category, origin, source_domain, title, url, published_at, image, payload, first_seen, updated_at',
    )
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(300)
  // supabase-js's abortSignal() requires a signal, not undefined: chain it
  // only when the caller actually aborted against a controller.
  const { data, error } = signal ? await builder.abortSignal(signal) : await builder

  if (error) {
    throw new Error(`Stored snapshot read failed: ${error.message}`, { cause: error })
  }

  const rows = (data ?? []) as StoredHeadlineRow[]

  // Postgres dates arrive as 'YYYY-MM-DD'. Rows outside the app's five
  // filters are skipped defensively (RLS exposes the whole table; the
  // ingest writes only these five categories).
  const tagged: TaggedArticle[] = []
  for (const row of rows) {
    if (!VALID_CATEGORIES.has(row.category as StoryCategory)) {
      continue
    }
    const payload = row.payload ?? {}
    tagged.push({
      // dedupe_key IS the stable id (host + lowercased title prefix): two
      // ingests of the same story can never produce different ids, so the
      // "same story, updated" row replaces its older self in place.
      id: row.dedupe_key,
      title: row.title,
      source: row.source_domain,
      url: row.url,
      publishedAt: row.published_at,
      language: (payload.language as string | undefined) ?? 'Unknown',
      sourceCountry: (payload.sourceCountry as string | undefined) ?? 'Unknown',
      ...(typeof row.image === 'string' && /^https?:\/\//i.test(row.image)
        ? { image: row.image }
        : {}),
      topicCategory: row.category as StoryCategory,
    })
  }

  // Same payload semantics as the live pipeline: storage guarantees dedupe
  // (dedupe_key unique), order = newest first, same cap so the Groq
  // grouping payload stays within its limit.
  tagged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const articles = tagged.slice(0, COMBINED_FEED_CAP)

  const fetchedPerCategory: AllTopicsFeed['fetchedPerCategory'] = {}
  for (const topic of TOPIC_GROUPS) {
    fetchedPerCategory[topic.category] = 0
  }
  for (const article of articles) {
    fetchedPerCategory[article.topicCategory] =
      (fetchedPerCategory[article.topicCategory] ?? 0) + 1
  }

  // From ALL rows read (not the capped slice): the cap can legitimately cut
  // one origin out of `articles` even though that origin contributed rows.
  const sourceStatus: AllTopicsFeed['sourceStatus'] = { gdelt: 'ok', gnews: 'ok' }
  dedupeOriginHealth(rows, sourceStatus)

  // Worth surfacing: the freshest ingest touching the snapshot, so the
  // reader can see how "today" the stored headlines actually are.
  const lastUpdate = rows.reduce<string>((latest, row) => {
    return row.updated_at > latest ? row.updated_at : latest
  }, '')
  autoBalanced.push(
    `Stored snapshot: ${articles.length} headlines read from Supabase${
      lastUpdate ? ` (latest story update ${lastUpdate.slice(0, 10)})` : ''
    }.`,
  )

  return {
    articles,
    fetchedPerCategory,
    sourceStatus,
    errors,
    autoBalanced,
    pendingGdeltRetry: false, // nothing to re-dial: no live fetch happened
  }
}

/**
 * The stored rows carry the origin ('gdelt' | 'gnews') of each headline;
 * dedupe means a source can be legitimately absent from a slim snapshot —
 * missing origins surface as the SAME failed-source honest notes the live
 * pipeline produces, instead of hiding the blank source.
 *
 * Health comes from the ROW's origin COLUMN, not the article id: a stored
 * id is the dedupe key ('host|title'), which never starts with 'gdelt'/'gnews'
 * — testing the id prefix marked BOTH sources failed on every snapshot read.
 */
function dedupeOriginHealth(
  rows: StoredHeadlineRow[],
  status: AllTopicsFeed['sourceStatus'],
): void {
  status.gdelt = rows.some((row) => row.origin === 'gdelt') ? 'ok' : 'failed'
  status.gnews = rows.some((row) => row.origin === 'gnews') ? 'ok' : 'failed'
}
