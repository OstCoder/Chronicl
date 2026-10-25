// Chronicl daily ingestion edge function: `ingest-morning`.
//
// Runs on a schedule every morning (deploy commands at the bottom). For
// the topic filters (RAW headlines per filter — NO AI grouping in
// storage) it:
//   1. fetches the past 7 days from GNews (per-filter queries) and GDELT
//      (ONE union query),
//   1b. tops up any topic filter still under HEADLINES_PER_CATEGORY with
//      direct per-topic GDELT dials — so the SNAPSHOT ALONE satisfies every
//      topic filter and the browser never needs live top-up fetches at
//      visit time (each browser-side filter click stays an instant,
//      zero-request client-side filter),
//   2. tags headlines with the filter they belong to — the SAME phrase
//      matching as the browser pipeline (src/services/liveFeed.ts):
//      quoted phrases atomically, leftover union headlines unclaimed by
//      any filter land in 'Community' (mirrors the browser's fallback),
//   3. writes to `daily_headlines`, honoring the user's contract:
//        brand-new headline        -> INSERT
//        same key + same content   -> row UNTOUCHED (not copied again)
//        same key + changed content-> row UPDATED (first_seen preserved)
//   4. prunes rows not seen for 14+ days.
//
// Secrets: GNEWS_API_KEY (set via `supabase secrets set`). SUPABASE_URL
// and SUPABASE_SERVICE_ROLE_KEY are auto-injected by the Edge runtime.
// GROQ is intentionally NOT used here — grouping happens in the browser
// over the stored snapshot, exactly like the user requested.
//
// KEEP IN SYNC: FILTERS below must match src/data/topicGroups.ts, and
// HEADLINES_PER_CATEGORY must match MIN_HEADLINES_PER_CATEGORY in
// src/services/liveFeed.ts (same floor, both sides, one guarantee).

import { createClient } from 'jsr:@supabase/supabase-js@2'

interface TopicFilter {
  category: string
  gdeltQuery: string
}

const FILTERS: TopicFilter[] = [
  { category: 'Local Development', gdeltQuery: '"data center" virginia' },
  { category: 'Education', gdeltQuery: '"school board" virginia' },
  { category: 'Community', gdeltQuery: 'infrastructure virginia' },
  { category: 'Technology', gdeltQuery: 'technology virginia' },
  { category: 'Environment', gdeltQuery: 'environment virginia' },
]

const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc'
const GNEWS_ENDPOINT = 'https://gnews.io/api/v4/search'
/** GDELT allows ~1 request / 5s server-side; this job makes the union
 *  call plus (only when a filter fell short) up to one dial per filter. */
const LOOKBACK_DAYS = 7
const PRUNE_OLDER_THAN_DAYS = 14
/** Same cap the browser pipeline enforces, so both sides agree. */
const HEADLINE_CAP = 75
/**
 * Headline floor PER FILTER — mirrors MIN_HEADLINES_PER_CATEGORY in
 * src/services/liveFeed.ts. Every topic filter must find at least this
 * many headlines in the snapshot, or the browser has to fetch (the thing
 * this job exists to prevent). Met in two steps below: a direct per-topic
 * GDELT dial for deficient categories, then floor-first selection under
 * the cap so a flood in one category cannot starve another.
 */
const HEADLINES_PER_CATEGORY = 5

interface RawHeadline {
  title: string
  url: string
  sourceDomain: string
  publishedAt: string // 'YYYY-MM-DD'
  image?: string
  origin: 'gdelt' | 'gnews'
  category: string
  language?: string
  sourceCountry?: string
}

/** Mirror of liveFeed's dedupeKey: host + first 80 lowercase title chars. */
function dedupeKeyOf(headline: RawHeadline): string {
  let host = headline.sourceDomain.toLowerCase()
  try {
    host = new URL(headline.url).hostname.toLowerCase()
  } catch {
    // keep the provided domain
  }
  return `${host}|${headline.title.toLowerCase().slice(0, 80)}`
}

/** Title, link, date or image changing = the SAME story with an update. */
function contentOf(headline: RawHeadline): string {
  return [headline.title, headline.url, headline.publishedAt, headline.image ?? ''].join('|')
}

async function textHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Quoted phrases match atomically; unquoted words match individually —
 * the exact semantics that fixed the mis-tagging bug in the browser
 * (naive space-splitting made ANY 'data' headline 'Local Development').
 */
function queryKeywords(query: string): string[] {
  return query.split('"').flatMap((segment, index) => {
    const text = segment.trim().toLowerCase()
    if (index % 2 === 1) {
      return text && text !== 'virginia' && text !== 'va' ? [text] : []
    }
    return text
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term && term !== 'virginia' && term !== 'va')
  })
}

function categorize(title: string): string | null {
  const lower = title.toLowerCase()
  for (const filter of FILTERS) {
    if (queryKeywords(filter.gdeltQuery).some((keyword) => lower.includes(keyword))) {
      return filter.category
    }
  }
  return null
}

function isoDateOnly(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : ''
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

async function fetchGdelt(
  query: string,
  signal?: AbortSignal,
  maxRecords = 75,
): Promise<RawHeadline[]> {
  const url = new URL(GDELT_ENDPOINT)
  url.searchParams.set('query', query)
  url.searchParams.set('mode', 'artlist')
  url.searchParams.set('format', 'json')
  url.searchParams.set('maxrecords', String(maxRecords))
  url.searchParams.set('timespan', `${LOOKBACK_DAYS}d`)
  url.searchParams.set('sort', 'datedesc')

  const response = await fetch(url.toString(), { signal })
  if (!response.ok) {
    throw new Error(`GDELT failed with HTTP ${response.status}`)
  }
  const data = (await response.json()) as { articles?: unknown }
  const articles = Array.isArray(data.articles) ? data.articles : []
  const out: RawHeadline[] = []
  for (const article of articles) {
    const raw = article as {
      title?: unknown
      url?: unknown
      seendate?: unknown
      domain?: unknown
      socialimage?: unknown
      language?: unknown
      sourcecountry?: unknown
    }
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const link = typeof raw.url === 'string' ? raw.url.trim() : ''
    if (!title || !/^https?:\/\//i.test(link)) {
      continue
    }
    // Undated rows are unusable for a date-windowed snapshot: skip them
    // (the browser pipeline tolerates ''; storage cannot).
    const seen = typeof raw.seendate === 'string' ? raw.seendate.match(/^(\d{4})(\d{2})(\d{2})T/) : null
    if (!seen) {
      continue
    }
    let domain = typeof raw.domain === 'string' ? raw.domain.trim() : ''
    if (!domain) {
      try {
        domain = new URL(link).hostname
      } catch {
        continue
      }
    }
    out.push({
      title,
      url: link,
      sourceDomain: domain,
      publishedAt: `${seen[1]}-${seen[2]}-${seen[3]}`,
      image:
        typeof raw.socialimage === 'string' && /^https?:\/\//i.test(raw.socialimage)
          ? raw.socialimage
          : undefined,
      origin: 'gdelt',
      // Union headlines are tagged by content; unclaimed -> 'Community'
      // (mirrors the browser pipeline's fallback assignment).
      category: categorize(title) ?? 'Community',
      language: typeof raw.language === 'string' ? raw.language : undefined,
      sourceCountry: typeof raw.sourcecountry === 'string' ? raw.sourcecountry : undefined,
    })
  }
  return out
}

/**
 * One floor top-up dial, rate-limit aware: GDELT's rolling IP block can
 * 429 calls that sit inside the 5s window, so a 429 (and only a 429) gets
 * ONE bounded wait + retry before this gives up — the category simply
 * reports its unmet floor in the summary instead of failing the ingest.
 */
async function fetchGdeltTopUp(
  query: string,
  signal?: AbortSignal,
  maxRecords = 15,
): Promise<RawHeadline[]> {
  try {
    return await fetchGdelt(query, signal, maxRecords)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('HTTP 429')) {
      throw error
    }
    await sleep(20_000, signal)
    return fetchGdelt(query, signal, maxRecords)
  }
}

async function fetchGnews(
  query: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<RawHeadline[]> {
  const url = new URL(GNEWS_ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('max', '12')
  // Keep GNews's window aligned with the GDELT timespan (7 days back).
  url.searchParams.set(
    'from',
    new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10),
  )
  url.searchParams.set('apikey', apiKey)

  const response = await fetch(url.toString(), { signal })
  if (!response.ok) {
    throw new Error(`GNews failed with HTTP ${response.status}`)
  }
  const data = (await response.json()) as { articles?: unknown }
  const articles = Array.isArray(data.articles) ? data.articles : []
  const out: RawHeadline[] = []
  for (const article of articles) {
    const raw = article as {
      title?: unknown
      url?: unknown
      publishedAt?: unknown
      image?: unknown
      source?: { name?: unknown }
    }
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const link = typeof raw.url === 'string' ? raw.url.trim() : ''
    if (!title || !/^https?:\/\//i.test(link)) {
      continue
    }
    const date = isoDateOnly(raw.publishedAt)
    if (!date) {
      continue
    }
    const sourceName = typeof raw.source?.name === 'string' ? raw.source.name.trim() : ''
    let domain = sourceName
    if (!domain) {
      try {
        domain = new URL(link).hostname
      } catch {
        continue
      }
    }
    out.push({
      title,
      url: link,
      sourceDomain: domain,
      publishedAt: date,
      image:
        typeof raw.image === 'string' && /^https?:\/\//i.test(raw.image) ? raw.image : undefined,
      origin: 'gnews',
      // GNews candidates come from the filter's own query: direct tag.
      category: queryToCategory.get(query) ?? 'Community',
    })
  }
  return out
}

/** GDELT union of ALL filters — same construction as liveFeed's. */
function gdeltUnionQuery(): string {
  return FILTERS.map((filter) =>
    filter.gdeltQuery
      .split('"')
      .flatMap((segment, index) => {
        if (index % 2 === 1) {
          return segment.trim() && segment.trim() !== 'virginia'
            ? [`"${segment.trim()}"`]
            : []
        }
        return segment
          .split(/\s+/)
          .map((term) => term.trim())
          .filter((term) => term && term !== 'virginia')
          .map((term) => `"${term}"`)
      })
      .join(' OR '),
  ).join(' OR ')
}

const queryToCategory = new Map<string, string>(
  FILTERS.map((filter) => [filter.gdeltQuery, filter.category]),
)

async function runOnce(signal?: AbortSignal): Promise<Record<string, unknown>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const gnewsKey = Deno.env.get('GNEWS_API_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not available to this function.')
  }
  if (!gnewsKey) {
    throw new Error(
      'GNEWS_API_KEY secret is not set — run: supabase secrets set GNEWS_API_KEY=<key from .env.local>',
    )
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // ---- 1. Fetch: GNews per filter in parallel, GDELT union alongside.
  const errors: string[] = []
  const candidates = new Map<string, RawHeadline>() // dedupeKey -> headline

  const gnewsSettled = await Promise.allSettled(
    FILTERS.map((filter) => fetchGnews(filter.gdeltQuery, gnewsKey, signal)),
  )
  FILTERS.forEach((filter, index) => {
    const outcome = gnewsSettled[index]
    if (outcome.status === 'fulfilled') {
      for (const headline of outcome.value) {
        candidates.set(dedupeKeyOf(headline), headline) // first seen wins
      }
    } else {
      const cause = outcome.reason instanceof Error ? outcome.reason.message : 'unknown error'
      errors.push(`GNews (${filter.category}): ${cause}`)
    }
  })

  try {
    for (const headline of await fetchGdelt(gdeltUnionQuery(), signal)) {
      const key = dedupeKeyOf(headline)
      if (!candidates.has(key)) {
        candidates.set(key, headline)
      }
    }
  } catch (error) {
    errors.push(`GDELT: ${error instanceof Error ? error.message : 'unknown error'}`)
  }

  // ---- 1b. Headline FLOOR top-ups (mirror of the browser pipeline's
  // enrichment floor): any filter under HEADLINES_PER_CATEGORY gets ONE
  // direct dialing of its own topic query, so the snapshot fills every
  // filter and the app never needs live top-up fetches at visit time.
  // Dials are SEQUENTIAL with a 6.5s wait — GDELT's server-side rule is
  // ~1 request per 5s and the union call just consumed one window.
  const perCategoryCount = (): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const headline of candidates.values()) {
      counts.set(headline.category, (counts.get(headline.category) ?? 0) + 1)
    }
    return counts
  }
  const floorTopups: string[] = []
  for (const filter of FILTERS) {
    if ((perCategoryCount().get(filter.category) ?? 0) >= HEADLINES_PER_CATEGORY) {
      continue
    }
    try {
      await sleep(6_500, signal)
      const extras = await fetchGdeltTopUp(filter.gdeltQuery, signal)
      let absorbed = 0
      for (const headline of extras) {
        if ((perCategoryCount().get(filter.category) ?? 0) >= HEADLINES_PER_CATEGORY) {
          break
        }
        const key = dedupeKeyOf(headline)
        if (!candidates.has(key)) {
          candidates.set(key, headline)
          absorbed += 1
        }
      }
      floorTopups.push(`${filter.category}: +${absorbed} via direct topic dial`)
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'unknown error'
      errors.push(`Floor top-up (${filter.category}): ${cause}`)
    }
  }

  // ---- 1c. Selection under the cap, FLOORS FIRST: a flood in one
  // category cannot starve another filter. Fill each category to its
  // floor with its NEWEST headlines, then fill the remaining cap slots
  // globally newest-first. Without this, a 75-headline Technology day
  // swallowed the whole cap and pushed Environment out of the payload.
  const selected: RawHeadline[] = []
  const taken = new Set<string>()
  for (const filter of FILTERS) {
    const inCategory = [...candidates.entries()]
      .filter(([, headline]) => headline.category === filter.category)
      .sort((a, b) => b[1].publishedAt.localeCompare(a[1].publishedAt))
    for (
      let i = 0;
      i < HEADLINES_PER_CATEGORY && i < inCategory.length;
      i++
    ) {
      selected.push(inCategory[i][1])
      taken.add(inCategory[i][0])
    }
  }
  const rest = [...candidates.entries()]
    .filter(([key]) => !taken.has(key))
    .sort((a, b) => b[1].publishedAt.localeCompare(a[1].publishedAt))
  for (const [key, headline] of rest) {
    if (selected.length >= HEADLINE_CAP) {
      break
    }
    selected.push(headline)
    taken.add(key)
  }
  const limited = selected

  // Floor report: what each filter ACTUALLY got (honest unmet floors —
  // sources can genuinely have none), so the summary tells the truth.
  const floorReport: Record<string, string> = {}
  const selectedByCategory = new Map<string, number>()
  for (const headline of limited) {
    selectedByCategory.set(headline.category, (selectedByCategory.get(headline.category) ?? 0) + 1)
  }
  for (const filter of FILTERS) {
    const count = selectedByCategory.get(filter.category) ?? 0
    floorReport[filter.category] = `${count}/${HEADLINES_PER_CATEGORY}${
      count >= HEADLINES_PER_CATEGORY ? '' : ' (UNMET after topic dial)'
    }`
    if (count < HEADLINES_PER_CATEGORY) {
      errors.push(
        `Headline floor (${filter.category}): ${count} of ${HEADLINES_PER_CATEGORY} — the browser may need its live top-up for this filter.`,
      )
    }
  }

  // ---- 2. Diff against what storage already has.
  const keys = limited.map((headline) => dedupeKeyOf(headline))
  const existing = new Map<string, string>() // dedupe_key -> content_hash
  if (keys.length > 0) {
    const { data, error: selectError } = await supabase
      .from('daily_headlines')
      .select('dedupe_key, content_hash')
      .in('dedupe_key', keys)
    if (selectError) {
      throw new Error(`Snapshot read failed: ${selectError.message}`)
    }
    for (const row of (data ?? []) as { dedupe_key: string; content_hash: string }[]) {
      existing.set(row.dedupe_key, row.content_hash)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  const toInsert = [] as Record<string, unknown>[]
  const updatedKeys: string[] = [] // same key, changed content
  let unchanged = 0
  for (const headline of limited) {
    const key = dedupeKeyOf(headline)
    const hash = await textHash(contentOf(headline))
    const previousHash = existing.get(key)
    if (previousHash === undefined) {
      toInsert.push({
        dedupe_key: key,
        category: headline.category,
        origin: headline.origin,
        source_domain: headline.sourceDomain,
        title: headline.title,
        url: headline.url,
        published_at: headline.publishedAt,
        image: headline.image ?? null,
        payload: {
          language: headline.language ?? null,
          sourceCountry: headline.sourceCountry ?? null,
        },
        content_hash: hash,
        // first_seen default = current_date; last_seen = today.
        last_seen: today,
      })
    } else if (previousHash !== hash) {
      updatedKeys.push(key)
      // Content changed = the same story with an update: rewrite the row,
      // preserving first_seen (only in the SET list, never overwritten).
      const { error: updateError } = await supabase
        .from('daily_headlines')
        .update({
          category: headline.category,
          origin: headline.origin,
          source_domain: headline.sourceDomain,
          title: headline.title,
          url: headline.url,
          published_at: headline.publishedAt,
          image: headline.image ?? null,
          payload: {
            language: headline.language ?? null,
            sourceCountry: headline.sourceCountry ?? null,
          },
          content_hash: hash,
          last_seen: today,
          updated_at: new Date().toISOString(),
        })
        .eq('dedupe_key', key)
      if (updateError) {
        throw new Error(`Update failed for ${key}: ${updateError.message}`)
      }
    } else {
      unchanged += 1 // identical snapshot: row untouched, not copied
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('daily_headlines')
      .insert(toInsert)
    if (insertError) {
      throw new Error(`Insert failed: ${insertError.message}`)
    }
  }

  // ---- 3. Prune rows not seen for 14+ days.
  const cutoff = new Date(Date.now() - PRUNE_OLDER_THAN_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const { error: pruneError } = await supabase
    .from('daily_headlines')
    .delete()
    .lt('last_seen', cutoff)
  if (pruneError) {
    throw new Error(`Prune failed: ${pruneError.message}`)
  }

  return {
    ingest_day: today,
    fetched_candidates: limited.length,
    inserted: toInsert.length,
    updated: updatedKeys.length,
    unchanged, // same headline, same content -> not re-copied
    fetched_by_category: Object.fromEntries(selectedByCategory),
    floor_by_category: floorReport,
    floor_topups: floorTopups,
    errors,
  }
}

Deno.serve(async () => {
  try {
    const summary = await runOnce()
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})

// DEPLOY + SCHEDULE (repo root, Supabase CLI logged in):
//   npx supabase db push                                 # applies migrations/0001
//   npx supabase link --project-ref <YOUR_PROJECT_REF>
//   npx supabase secrets set GNEWS_API_KEY=<key from .env.local>
//   npx supabase functions deploy ingest-morning
//   npx supabase functions schedule ingest-morning "0 10 * * *"  # 06:00 EDT; adjust TZ/DST
// Test manually once: npx supabase functions invoke ingest-morning
//   -> expect { fetched_candidates > 0, inserted >= 0, updated, unchanged }
//   then check the daily_headlines table; run again -> unchanged == prior count.
