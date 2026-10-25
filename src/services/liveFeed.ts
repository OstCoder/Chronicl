import { fetchLiveNews, type LiveNewsArticle } from './gdelt'
import { fetchLiveGnewsArticles } from './gnews'
import { TOPIC_GROUPS } from '../data/topicGroups'
import type { ArticleGroup, StoryCategory } from '../types'

/**
 * Live feed services — the single fetch layer the pipeline store uses,
 * built as a TWO-PHASE pipeline so first paint is FAST:
 *
 *   Phase 1 — fetchAllTopicsFeed(): the primary sweep only — one GDELT
 *      request (all categories OR-combined into a single query, since
 *      GDELT rate-limits to ~1 req / 5s) plus GNews's five topic calls in
 *      parallel (no per-second cap). Resolves the moment both land and is
 *      handed to the store immediately, so Groq grouping starts on the
 *      real payload right away instead of waiting behind slow patches.
 *   Phase 2 — enrichAllTopicsFeed(): the SLOW recovery work, deliberately
 *      OFF the critical path: the GDELT rate-limit re-dial (one bounded
 *      wait) and the per-category headline-floor top-ups. The store runs
 *      this in the background after first paint; it appends articles and
 *      the store triggers ONE catch-up re-group if enrichment added any.
 *
 *   2. fetchCombinedFeed(query): search/verbatim queries (same two
 *      sources, one query, one merged list). Used when the user types a
 *      search that replaces the topic feed until cleared.
 *
 * Failure model is per-source (topics can end up thin if one keyword set
 * misses): one source failing never empties the page, and failures are
 * surfaced as honest notes instead of blank error states — which is
 * exactly what the enrichment phase then heals, without the user seeing
 * an empty filter in the meantime.
 */

/** The Groq middleware's article cap (see vite.config.ts). */
export const COMBINED_FEED_CAP = 75

/**
 * Headline floor PER FILTER category: 5 filters x 5 = the 25+ the 'All
 * topics' grid is expected to show. Two stages enforce it in
 * fetchAllTopicsFeed: union-tagged absorption prefers categories that are
 * still short, and a per-topic GDELT top-up runs for categories that end
 * up below the floor even then (GNews topic-call failures used to starve
 * whole filters down to zero headlines).
 */
export const MIN_HEADLINES_PER_CATEGORY = 5

export type SourceHealth = 'ok' | 'failed'

/** A live article tagged with the filter category it was matched to. */
export interface TaggedArticle extends LiveNewsArticle {
  topicCategory: StoryCategory
}

export interface AllTopicsFeed {
  /** Merged, deduped, newest-first, capped at the Groq payload limit. */
  articles: TaggedArticle[]
  /** Headline totals per category after tagging, for honest notes. */
  fetchedPerCategory: Partial<Record<StoryCategory, number>>
  sourceStatus: { gdelt: SourceHealth; gnews: SourceHealth }
  /** Human-readable failure reasons, one per source that failed. */
  errors: string[]
  /** What the app did automatically so the user doesn't have to care. */
  autoBalanced: string[]
  /**
   * TRUE only when the primary sweep's ONE GDELT union call failed: the
   * enrichment phase owns the rate-limit-aware re-dial, so phase 1 never
   * blocks on GDELT's lockout. Cleared once the re-dial has run (either
   * way) or when the feed comes back from a persisted cache.
   */
  pendingGdeltRetry: boolean
}

export interface CombinedFeed {
  articles: LiveNewsArticle[]
  sourceStatus: { gdelt: SourceHealth; gnews: SourceHealth }
  /** Human-readable reasons for failures, for the honest UI note. */
  errors: string[]
}

/** URL -> hostname (lowercase), or the URL itself when it can't parse. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

/** Same article on the same site twice = keep the first seen. */
function dedupeKey(article: LiveNewsArticle): string {
  return `${hostnameOf(article.url)}|${article.title.toLowerCase().slice(0, 80)}`
}

/**
 * Category keywords, derived from each topic's GDELT query so the queries
 * stay the single source of truth — and they must mirror GDELT's own
 * boolean semantics: a quoted phrase ('"data center"') matches ATOMICALLY,
 * unquoted words match individually. Splitting the whole query naively on
 * spaces once MISTAGGED headlines: '"data center" virginia' collapsed to
 * keywords ['data', 'center'], so any headline containing the lone word
 * "data" (a poll's numbers, a school report) got filed under Local
 * Development. Splitting on quotes instead keeps phrases whole and drops
 * the ubiquitous unqualified terms ('virginia', 'va') that match every
 * headline in this app's scope.
 */
const TOPIC_KEYWORDS: { category: StoryCategory; keywords: string[] }[] = TOPIC_GROUPS.map(
  (topic) => ({
    category: topic.category,
    keywords: topic.gdeltQuery.split('"').flatMap((segment, index) => {
      const text = segment.trim().toLowerCase()
      // Odd segments sat inside quotes: one atomic phrase.
      if (index % 2 === 1) {
        return text && text !== 'virginia' && text !== 'va' ? [text] : []
      }
      // Even segments are unquoted words: one keyword each.
      return text
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term && term !== 'virginia' && term !== 'va')
    }),
  }),
)

/** First category whose keywords appear in the title; falls back to null. */
function categorize(title: string): StoryCategory | null {
  const lower = title.toLowerCase()
  for (const { category, keywords } of TOPIC_KEYWORDS) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return category
    }
  }
  return null
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

/**
 * Run ONE promise and always resolve to a settled result — used by the
 * per-topic GNews retry so retry outcomes keep the same shape as the
 * original allSettled outcomes they may replace.
 */
async function settledRetry(
  run: () => Promise<LiveNewsArticle[]>,
): Promise<PromiseSettledResult<LiveNewsArticle[]>> {
  try {
    return { status: 'fulfilled', value: await run() }
  } catch (reason: unknown) {
    return { status: 'rejected', reason }
  }
}

/** The GDELT OR-union of every topic query (same string for both phases). */
function gdeltUnionQuery(): string {
  return TOPIC_GROUPS.map(
    (topic) =>
      topic.gdeltQuery
        .split(' ')
        .map((term) => term.replace(/"/g, '').trim())
        .filter((term) => term && term !== 'virginia')
        .map((term) => `"${term}"`)
        .join(' OR '),
  ).join(' OR ')
}

/** One bounded wait before the enrichment phase re-dials a locked-out GDELT. */
const GDELT_RETRY_WAIT_MS = 20_000

/**
 * PHASE 1 — the primary sweep. Resolves as soon as the parallel sources
 * land: ONE GDELT union request + all five GNews topic calls. NO rate-limit
 * recovery, NO floor top-ups — both live in enrichAllTopicsFeed so nothing
 * slow can delay the first storylines. Never rejects: source failures stay
 * inside the returned feed for the honest notes.
 */
export async function fetchAllTopicsFeed(signal?: AbortSignal): Promise<AllTopicsFeed> {
  const errors: string[] = []
  const autoBalanced: string[] = []
  const sourceStatus: { gdelt: SourceHealth; gnews: SourceHealth } = {
    gdelt: 'ok',
    gnews: 'ok',
  }

  // Both wires start at the same instant: GNews's five topic queries in
  // parallel AND the single GDELT union request (one rate-limit slot
  // instead of five sequential ones, which used to take ~30s).
  const [gnewsOutcomes, gdeltOutcomes] = await Promise.all([
    Promise.allSettled(
      TOPIC_GROUPS.map((topic) =>
        fetchLiveGnewsArticles(topic.gdeltQuery, { maxRecords: 12, signal }),
      ),
    ),
    Promise.allSettled([fetchLiveNews(gdeltUnionQuery(), { maxRecords: 75, signal })]),
  ])

  // ONE quiet retry for topic calls that failed: transient network/5xx
  // errors recover without user action (a daily-quota 429 keeps its error
  // label — retrying immediately cannot un-exhaust the day).
  // settledRetry keeps every entry the SAME PromiseSettledResult shape.
  const gnewsRetried = await Promise.all(
    gnewsOutcomes.map((outcome, index) =>
      outcome.status === 'fulfilled'
        ? Promise.resolve(outcome)
        : settledRetry(() =>
            fetchLiveGnewsArticles(TOPIC_GROUPS[index].gdeltQuery, {
              maxRecords: 12,
              signal,
            }),
          ),
    ),
  )
  const gnewsFinal = gnewsRetried.map((settled, index) =>
    settled.status === 'fulfilled' ? settled : gnewsOutcomes[index],
  )

  const gdeltOut = gdeltOutcomes[0]

  // Tag and merge client-side. GNews first (they arrived per-topic), then
  // the GDELT union absorbed into still-short categories first, so every
  // filter shows something even before the enrichment phase runs.
  const tagged: TaggedArticle[] = []
  const seen = new Set<string>()
  const fetchedPerCategory: AllTopicsFeed['fetchedPerCategory'] = {}
  for (const topic of TOPIC_GROUPS) {
    fetchedPerCategory[topic.category] = 0
  }

  const absorb = (article: LiveNewsArticle, category: StoryCategory | null): boolean => {
    if (tagged.length >= COMBINED_FEED_CAP) {
      return false
    }
    const key = dedupeKey(article)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    tagged.push({ ...article, topicCategory: category ?? 'Community' })
    return true
  }

  TOPIC_GROUPS.forEach((topic, index) => {
    const outcome = gnewsFinal[index]
    if (outcome.status === 'fulfilled') {
      for (const article of outcome.value) {
        absorb(article, topic.category)
        fetchedPerCategory[topic.category] = (fetchedPerCategory[topic.category] ?? 0) + 1
      }
    } else {
      sourceStatus.gnews = 'failed'
      const cause = outcome.reason instanceof Error ? outcome.reason.message : 'unknown error'
      errors.push(`GNews (${topic.category}): ${cause}`)
    }
  })

  if (gdeltOut.status === 'fulfilled') {
    let matched = 0
    let fallback = 0
    for (const article of gdeltOut.value) {
      // ONE categorize call per headline (previously called twice — once
      // for the chip, once for the matched/fallback tally — the second
      // call also skipped articles the cap/dedupe had already absorbed).
      const matchedCategory = categorize(article.title)
      const category = matchedCategory ?? 'Community'
      // Only tally what actually entered the payload (the cap or a dedupe
      // hit can silently drop a headline; counting it anyway inflated the
      // per-category totals behind the honest notes).
      if (!absorb(article, category)) {
        continue
      }
      fetchedPerCategory[category] = (fetchedPerCategory[category] ?? 0) + 1
      if (matchedCategory === null) {
        fallback += 1
      } else {
        matched += 1
      }
    }
    autoBalanced.push(`GDELT union fetch: ${matched} keyword-matched, ${fallback} general (Community).`)
  } else {
    sourceStatus.gdelt = 'failed'
    const cause = gdeltOut.reason instanceof Error ? gdeltOut.reason.message : 'unknown error'
    errors.push(`GDELT: ${cause}`)
  }

  tagged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  return {
    articles: tagged,
    fetchedPerCategory,
    sourceStatus,
    errors,
    autoBalanced,
    pendingGdeltRetry: gdeltOut.status === 'rejected',
  }
}

/**
 * PHASE 2 — background enrichment of a phase-1 feed. Two slow recovery
 * jobs, in one place, BOTH off the first-paint critical path:
 *   1. the GDELT union re-dial when the primary call was rate-limited
 *      (bounded single wait, single re-dial, honest failure otherwise);
 *   2. headline-floor top-ups for categories still under the floor after
 *      the primary sweep (sequential GDELT taps, one per category).
 * Returns a NEW feed object (pure copy, never mutates the input) with the
 * appended articles; the store replaces its state and re-groups once.
 */
export async function enrichAllTopicsFeed(
  feed: AllTopicsFeed,
  signal?: AbortSignal,
): Promise<AllTopicsFeed> {
  const next: AllTopicsFeed = {
    ...feed,
    articles: [...feed.articles],
    fetchedPerCategory: { ...feed.fetchedPerCategory },
    sourceStatus: { ...feed.sourceStatus },
    errors: [...feed.errors],
    autoBalanced: [...feed.autoBalanced],
  }
  const seen = new Set<string>()
  for (const article of feed.articles) {
    seen.add(dedupeKey(article))
  }

  const absorb = (article: LiveNewsArticle, category: StoryCategory): boolean => {
    if (next.articles.length >= COMBINED_FEED_CAP) {
      return false
    }
    const key = dedupeKey(article)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    next.articles.push({ ...article, topicCategory: category })
    next.fetchedPerCategory[category] = (next.fetchedPerCategory[category] ?? 0) + 1
    return true
  }

  const countByCategory = (category: StoryCategory): number =>
    next.articles.filter((article) => article.topicCategory === category).length

  // ---- 1. GDELT union re-dial (only when the primary call failed) ----
  if (feed.pendingGdeltRetry) {
    try {
      // Wait ONCE, bounded — the backlog from a locked-out IP usually
      // clears inside this window. Aborts propagate to the store.
      await sleep(GDELT_RETRY_WAIT_MS, signal)
      const retried = await fetchLiveNews(gdeltUnionQuery(), {
        maxRecords: 60,
        signal,
      })
      let absorbed = 0
      for (const article of retried) {
        const category = categorize(article.title) ?? 'Community'
        if (absorb(article, category)) {
          absorbed += 1
        }
      }
      next.pendingGdeltRetry = false
      next.sourceStatus.gdelt = 'ok'
      next.errors = next.errors.filter((entry) => !entry.startsWith('GDELT:'))
      next.autoBalanced.push(`GDELT union re-dial: absorbed ${absorbed} headlines.`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error // let the store recognize a superseded run
      }
      // The re-dial failed too: drop the flag for good (no infinite
      // retry loops) and keep the original honest error note.
      next.pendingGdeltRetry = false
    }
  }

  // ---- 2. Floor top-ups for every still-short category ----
  for (const topic of TOPIC_GROUPS) {
    const category = topic.category
    if (countByCategory(category) >= MIN_HEADLINES_PER_CATEGORY) {
      continue
    }
    try {
      const extras = await fetchLiveNews(topic.gdeltQuery, { maxRecords: 10, signal })
      for (const article of extras) {
        if (countByCategory(category) >= MIN_HEADLINES_PER_CATEGORY) {
          break
        }
        absorb(article, category)
      }
      next.autoBalanced.push(`Headline floor top-up for ${category}: one extra GDELT topic query.`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      const cause = error instanceof Error ? error.message : 'unknown error'
      next.errors.push(`GDELT top-up (${category}): ${cause}`)
    }
  }

  // NO full re-sort here. Enriched articles are APPENDED to keep the
  // phase-1 ordering intact: group.articleIds are 1-based positions into
  // the payload the grouping ran on, and every consumer (story-page member
  // lists, timeline source refs, card images) resolves them as
  // articles[id - 1]. Re-sorting would silently repoint those ids at the
  // wrong articles; if the catch-up regroup then fails, that mismatch is
  // PERSISTED (pipeline status stays 'ready') and a TTL cache-hit never
  // re-runs the grouping. Appended extras may be out of newest-first
  // order — ArticleList sorts a copy itself and the card grid iterates
  // groups, so no UI renders the raw feed order.
  return next
}

export async function fetchCombinedFeed(query: string, signal?: AbortSignal): Promise<CombinedFeed> {
  const errors: string[] = []
  const sourceStatus: CombinedFeed['sourceStatus'] = { gdelt: 'ok', gnews: 'ok' }

  const [gdelt, gnews] = await Promise.allSettled([
    fetchLiveNews(query, { maxRecords: 15, signal }),
    fetchLiveGnewsArticles(query, { maxRecords: 10, signal }),
  ])

  const seen = new Set<string>()
  const merged: LiveNewsArticle[] = []

  const collect = (outcome: PromiseSettledResult<LiveNewsArticle[]>, name: 'gdelt' | 'gnews') => {
    if (outcome.status === 'fulfilled') {
      for (const article of outcome.value) {
        const key = dedupeKey(article)
        if (!seen.has(key) && merged.length < COMBINED_FEED_CAP) {
          seen.add(key)
          merged.push(article)
        }
      }
    } else {
      sourceStatus[name] = 'failed'
      const cause = outcome.reason instanceof Error ? outcome.reason.message : 'unknown error'
      errors.push(`${name}: ${cause}`)
    }
  }
  collect(gdelt, 'gdelt')
  collect(gnews, 'gnews')

  merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  return { articles: merged, sourceStatus, errors }
}

/**
 * Merge a filter top-up's headlines into an already-ready feed (pure copy).
 * Used by the store's ensureCategoryHeadlines: when a topic filter would
 * render ZERO headlines (the stored snapshot can simply hold none for a
 * category), the store dials that filter's GDELT query directly and the
 * result lands here. Same merge rules as the other pipelines:
 *   - dedupe against the FULL feed (host + title prefix),
 *   - respect COMBINED_FEED_CAP,
 *   - append at the END, never re-sort — group.articleIds are 1-based
 *     positions into the payload and every consumer resolves them
 *     positionally (same rule as enrichAllTopicsFeed).
 * Returns { feed, added }: feed unchanged when nothing new landed.
 */
export function appendCategoryArticles(
  feed: AllTopicsFeed,
  category: StoryCategory,
  articles: LiveNewsArticle[],
): { feed: AllTopicsFeed; added: number } {
  const seen = new Set<string>()
  for (const article of feed.articles) {
    seen.add(dedupeKey(article))
  }
  const appended: TaggedArticle[] = []
  for (const article of articles) {
    if (feed.articles.length + appended.length >= COMBINED_FEED_CAP) {
      break
    }
    const key = dedupeKey(article)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    appended.push({ ...article, topicCategory: category })
  }
  const added = appended.length
  if (added === 0) {
    return { feed, added: 0 }
  }
  const fetchedPerCategory = { ...feed.fetchedPerCategory }
  fetchedPerCategory[category] = (fetchedPerCategory[category] ?? 0) + added
  return {
    feed: {
      ...feed,
      articles: [...feed.articles, ...appended],
      fetchedPerCategory,
    },
    added,
  }
}

/**
 * The tier-3 UNGROUPED storyline for one topic category: a synthesized
 * one-card grouping over that category's own payload headlines, shown
 * when the AI grouping has not produced/passed a storyline for it — so a
 * filter is never blank.
 *
 * Shared by BOTH views so the shapes stay identical:
 *   - LiveStoriesSection renders it in the feed (tier 3), and
 *   - LiveStoryPage rebuilds it for the deep-link/refresh recovery of a
 *     synthesized card (which points at /live-story/synthesized?cat=...
 *     — NOT at a numeric group index, because this group is NOT a member
 *     of the cached `groups` array and a numeric link would hit a stale
 *     index or /live-story/-1 and render "link expired").
 *
 * articleIds follow the same 1-based payload indexing as AI groupings;
 * NULL when the payload holds no headline for the category.
 */
export function ungroupedStorylineFor(
  category: StoryCategory,
  articles: readonly TaggedArticle[],
): ArticleGroup | null {
  const articleIds = articles
    .map((article, index) => (article.topicCategory === category ? index + 1 : 0))
    .filter((id) => id > 0)
  if (articleIds.length === 0) {
    return null
  }
  const latest = articles[articleIds[0] - 1]
  return {
    title: latest.title,
    topic: category,
    summary:
      `${articleIds.length} ${category.toLowerCase()} headline${articleIds.length === 1 ? '' : 's'} in this load — shown ungrouped because the AI storyline grouping has not produced one here yet.`,
    articleIds,
    keyPoints: [],
    openQuestions: [],
    caseClosed: false,
    timeline: [],
  }
}