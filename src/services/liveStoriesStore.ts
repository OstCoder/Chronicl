import {
  enrichAllTopicsFeed,
  fetchAllTopicsFeed,
  type AllTopicsFeed,
  type CombinedFeed,
} from './liveFeed'

/** Anything the store hands to the UI for one pipeline key. */
type FeedBundle = AllTopicsFeed | CombinedFeed
import { groupArticles, GroqRateLimitError, type GroqArticleInput } from './groq'
import type { ArticleGroup } from '../types'
import type { TaggedArticle } from './liveFeed'
import { SESSION_TTL_MS } from '../utils/session'
import { fetchStoredTopicsFeed, supabaseReady } from './storedFeed'

/**
 * Session-level store for the daily-snapshot pipeline.
 *
 * ONE pipeline, cached per key (and persisted to localStorage, so hard
 * refreshes cost zero while the TTL holds):
 *
 *   key 'all' -> EVERY topic category in one bulk load + ONE Groq
 *                grouping over the payload. The SOURCE of that payload:
 *                the Supabase daily snapshot when configured (written by
 *                the ingest-morning Edge Function — same/unchanged rows
 *                are NOT re-copied, updated ones replaced in place), or
 *                the live GDELT+GNews fetch as fallback. The sidebar
 *                topic buttons afterwards are INSTANT client-side filters
 *                over this dataset.
 *
 * React reads this via useSyncExternalStore (hooks/useLiveStories). Store
 * updates happen only in stage callbacks — effects never set state.
 */

export type LiveStoryStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'
export type GroupingStatus = 'loading' | 'success' | 'error' | 'rateLimited'

export interface PipelineState {
  key: string
  status: LiveStoryStatus
  feed: FeedBundle | null
  groups: ArticleGroup[]
  grouping?: { status: GroupingStatus; error?: string }
  updatedAt: number
}

/**
 * The pipeline cache lives for the WHOLE viewer session (6 hours, same
 * limit the auth-free session gate uses), NOT a few minutes: headlines
 * must stay the same across refreshes, filter clicks and return visits.
 * A short TTL mid-session meant any 10-minute gap threw the dataset away
 * and re-fetched + re-grouped from live sources — making the feed look
 * like it "reloaded" with different headlines every time.
 */
const TTL_MS = SESSION_TTL_MS
// v6: the feed shape changed for the two-phase pipeline (pendingGdeltRetry
// flag + simplified union absorption), so v5 cached feeds are refused and
// the (fast) phase-1 load re-runs once on next visit.
const SESSION_KEY = 'civictrace:live-stories:v6'

export const ALL_KEY = 'all'

// localStorage, NOT sessionStorage: it flushes synchronously and reliably
// (verified live: sessionStorage did NOT survive a relaunch, so a "hard
// refresh" kept re-running the whole pipeline). Staleness is impossible:
// rehydrate() only accepts entries still inside the TTL window.
const listeners = new Set<() => void>()
const states = new Map<string, PipelineState>()
let activeKey = ''
let snapshot: { states: Map<string, PipelineState>; activeKey: string } = {
  states: new Map(),
  activeKey: '',
}
let feedRunToken = 0
let groupingRunToken = 0
let inFlightFeed: { key: string; controller: AbortController } | null = null
const inFlightGrouping = new Set<string>()
/**
 * Keys restored from persistence with grouping still 'loading' (the page
 * closed while the AI grouping ran). Their CACHED FEED is perfectly good
 * — only the grouping never finished — so instead of throwing the whole
 * dataset away on the next visit (which re-fetched live sources and
 * shuffled the headlines), we restore the snapshot and re-run ONLY the
 * grouping over the same cached articles.
 */
const regroupOnRestore = new Set<string>()
/** Phase-2 enrichments currently running (one per key at a time). */
const inFlightEnrichment = new Set<string>()
/** Enrichment landed while grouping was running: regroup once on success. */
const regroupPending = new Set<string>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  snapshot = { states: new Map(states), activeKey }
  persist()
  for (const listener of listeners) {
    listener()
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function persist(): void {
  try {
    const now = Date.now()
    const entries = [...states.entries()]
      .filter(([, state]) => now - state.updatedAt < TTL_MS && state.status !== 'loading')
      .map(([key, state]) => ({ k: key, s: state }))
    localStorage.setItem(SESSION_KEY, JSON.stringify({ v: 2, entries }))
  } catch {
    // Storage unavailable (private mode/quota): the in-memory cache still
    // works for this session; rehydration simply starts empty next time.
  }
}

function rehydrate(): void {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) {
      return
    }
    const parsed = JSON.parse(raw) as {
      v?: number
      entries?: { k?: unknown; s?: PipelineState }[]
    }
    if (parsed.v !== 2 || !Array.isArray(parsed.entries)) {
      return
    }
    const now = Date.now()
    for (const entry of parsed.entries) {
      if (
        typeof entry?.k === 'string' &&
        entry.k !== '' &&
        entry.s &&
        typeof entry.s.updatedAt === 'number' &&
        now - entry.s.updatedAt < TTL_MS
      ) {
        if (entry.s.grouping?.status === 'loading') {
          // Keep the restored feed (same headlines as the interrupted
          // visit) and queue a grouping-only catch-up on the next
          // ensure() hit — do NOT drop the entry and re-fetch everything.
          states.set(entry.k, entry.s)
          regroupOnRestore.add(entry.k)
          continue
        }
        states.set(entry.k, entry.s)
      }
    }
  } catch {
    // Malformed cache: start clean rather than poisoning the session.
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

function feedsToPayload(
  articles: (TaggedArticle | import('./gdelt').LiveNewsArticle)[],
): GroqArticleInput[] {
  return articles.map((article, index) => ({
    id: index + 1,
    publisher: article.source,
    title: article.title,
    date: article.publishedAt,
  }))
}

/** Starts (or continues) the pipeline for ONE cache key. */
function ensure(key: string, force = false): void {
  activeKey = key
  if (key === '' || (inFlightFeed?.key === key && !force)) {
    notify()
    return
  }

  const existing = states.get(key)
  const withinTtl =
    existing !== undefined &&
    Date.now() - existing.updatedAt < TTL_MS &&
    existing.status !== 'loading'

  if (withinTtl && !force) {
    notify() // cache hit: nothing to run
    // Restored mid-grouping snapshot: the cached feed already stands, so
    // only the AI grouping needs one catch-up run over the SAME articles
    // (no re-fetch — that would shuffle the headlines the user saw).
    if (regroupOnRestore.has(key) && !inFlightGrouping.has(key)) {
      regroupOnRestore.delete(key)
      const restored = states.get(key)
      if (restored?.feed) {
        void runGrouping(key, restored.feed)
      }
    }
    return
  }
  if (force && inFlightFeed && inFlightFeed.key === key) {
    inFlightFeed.controller.abort()
  }

  const myToken = ++feedRunToken
  states.set(key, {
    key,
    status: 'loading',
    feed: null,
    groups: [],
    updatedAt: Date.now(),
  })
  notify()

  const controller = new AbortController()
  inFlightFeed = { key, controller }

  // The pipeline is DUAL-SOURCED, snapshot-first with a graceful fallback:
  //   - Supabase configured -> read the DAILY SNAPSHOT (written each
  //     morning by the ingest Edge Function). No live GDELT/GNews traffic
  //     at visit time; the snapshot only changes when the morning job
  //     stored new or updated rows. Groq grouping still runs IN the
  //     browser over the stored rows (raw headlines per filter — no AI
  //     grouping in storage).
  //   - Snapshot read FAILS (migration not applied yet, project paused,
  //     transient network) -> ONE live fetch instead, with the reason
  //     surfaced in the feed's honest notes — the app is never dead just
  //     because storage is behind. Enrichment runs for that visit too.
  //   - Not configured at all -> the original live pipeline (same session
  //     fetch + same grouping), which is also the shape both paths return.
  // Only the bulk 'all' key exists (topic filters are client-side, and
  // the standalone search feature was removed by product decision).
  const storedPipeline = supabaseReady
  // Set (with the honesty note to surface) when this visit fell back to the
  // live pipeline — either because the snapshot READ failed, or because it
  // succeeded but returned ZERO rows (fresh migration, morning ingest not
  // run yet). The empty case used to dead-end the feed at 'empty' with the
  // sources perfectly reachable; now it heals the same way a failed read does.
  let liveFallbackNote: string | null = null
  const stage = (
    storedPipeline
      ? fetchStoredTopicsFeed()
          .catch((snapshotError: unknown) => {
            liveFallbackNote =
              'Daily snapshot was unavailable — this visit used a live fetch. The morning ingest will restore the stored snapshot.'
            const reason =
              snapshotError instanceof Error ? snapshotError.message : 'unknown error'
            console.warn(
              '[liveStoriesStore] snapshot read failed, falling back to live fetch:',
              reason,
            )
            return fetchAllTopicsFeed(controller.signal)
          })
          .then((snapshot: AllTopicsFeed) => {
            // Snapshot read succeeded but holds nothing to group: same live
            // fallback, with its own honest note.
            if (snapshot.articles.length === 0) {
              liveFallbackNote =
                'The stored snapshot was empty (the morning ingest has not written rows yet) — this visit used a live fetch.'
              return fetchAllTopicsFeed(controller.signal)
            }
            return snapshot
          })
      : fetchAllTopicsFeed(controller.signal)
  ).then(
    (feed: AllTopicsFeed) => ({
      feed: {
        ...feed,
        ...(liveFallbackNote
          ? {
              autoBalanced: [
                ...(feed as AllTopicsFeed).autoBalanced,
                liveFallbackNote,
              ],
            }
          : {}),
      } as AllTopicsFeed,
      hasArticles: feed.articles.length > 0,
    }),
  )

  stage
    .then(({ feed, hasArticles }) => {
      if (feedRunToken !== myToken || activeKey !== key) {
        return // superseded
      }
      inFlightFeed = null
      states.set(key, {
        key,
        status: hasArticles ? 'ready' : 'empty',
        feed,
        groups: [],
        updatedAt: Date.now(),
      })
      notify()
      if (hasArticles) {
        // Grouping starts IMMEDIATELY on the (stored, fallback-live, or
        // phase-1) payload. The BOOKEND enrichment phase (GDELT re-dial +
        // floor top-ups) belongs to LIVE flows only: the stored snapshot
        // is already the morning job's result, and re-touching live
        // sources would blur exactly the stability it exists for.
        runGrouping(key, feed)
        if (!storedPipeline || liveFallbackNote !== null) {
          void runEnrichment(key, feed, controller.signal)
        }
      }
    })
    .catch((error: unknown) => {
      inFlightFeed = null
      if (error instanceof DOMException && error.name === 'AbortError') {
        return // superseded
      }
      if (feedRunToken !== myToken || activeKey !== key) {
        return
      }
      states.set(key, {
        key,
        status: 'error',
        feed: {
          articles: [],
          sourceStatus: { gdelt: 'failed', gnews: 'failed' },
          errors: [error instanceof Error ? error.message : 'Unknown error.'],
        },
        groups: [],
        updatedAt: Date.now(),
      })
      notify()
    })
}

/** Narrow the FeedBundle union: only the bulk feed supports enrichment. */
function isAllTopicsFeed(feed: FeedBundle): feed is AllTopicsFeed {
  return 'autoBalanced' in feed
}

/**
 * Stage 2 (BACKGROUND): enrichment of a ready phase-1 feed — the GDELT
 * re-dial + headline-floor top-ups that used to BLOCK first paint. Never
 * rejects outward: an enrichment failure leaves the ready state (and its
 * cards) untouched. When new articles land, the feed is swapped in and
 * ONE catch-up regroup is requested via runGrouping's pending chain.
 */
function runEnrichment(key: string, feed: AllTopicsFeed, signal?: AbortSignal): void {
  if (inFlightEnrichment.has(key)) {
    return
  }
  inFlightEnrichment.add(key)
  enrichAllTopicsFeed(feed, signal)
    .then((enriched) => {
      inFlightEnrichment.delete(key)
      const current = states.get(key)
      // Superseded checks: a forced refresh re-enters 'loading' with a new
      // feed object, so an out-of-date enrichment result is discarded.
      if (!current || current.status !== 'ready' || current.feed !== feed) {
        return
      }
      const added = enriched.articles.length - feed.articles.length
      states.set(key, { ...current, feed: enriched, updatedAt: Date.now() })
      notify()
      if (added > 0) {
        // Badge the catch-up; runGrouping chains it after any in-flight run.
        regroupPending.add(key)
        runGrouping(key, enriched)
      }
    })
    .catch((error: unknown) => {
      inFlightEnrichment.delete(key)
      if (error instanceof DOMException && error.name === 'AbortError') {
        return // superseded or unmounted
      }
      // Any other enrichment failure is cosmetic: the primary feed and its
      // grouping stand. The honesty notes in the feed already describe it.
    })
}

/** Stage 2 on a ready feed: one Groq run over the payload, deduped per key.
**/
function runGrouping(key: string, feed: AllTopicsFeed | CombinedFeed): void {
  if (inFlightGrouping.has(key)) {
    // Already grouping this key — remember that the payload has moved
    // (enrichment landed) and regroup once the current run resolves.
    regroupPending.add(key)
    return
  }
  const payload = feedsToPayload(feed.articles)

  const myToken = ++groupingRunToken
  const state = states.get(key)
  if (state) {
    states.set(key, { ...state, grouping: { status: 'loading' } })
    notify()
  }

  inFlightGrouping.add(key)
  groupArticles(payload)
    .then((groups) => {
      inFlightGrouping.delete(key)
      if (groupingRunToken !== myToken || activeKey !== key) {
        return // superseded
      }
      const current = states.get(key)
      if (current && current.status === 'ready') {
        states.set(key, {
          ...current,
          groups,
          grouping: { status: 'success' },
          updatedAt: Date.now(),
        })
        notify()
        // Catch-up: enrichment landed while this run was in flight — run
        // ONE more grouping over the now-fresher feed.
        if (regroupPending.has(key)) {
          regroupPending.delete(key)
          if (
            current.feed &&
            current.feed !== feed &&
            isAllTopicsFeed(current.feed)
          ) {
            void runGrouping(key, current.feed)
          }
        }
      }
    })
    .catch((caught: unknown) => {
      inFlightGrouping.delete(key)
      if (groupingRunToken !== myToken || activeKey !== key) {
        return
      }
      const current = states.get(key)
      if (!current || current.status !== 'ready') {
        return
      }
      const rateLimited = caught instanceof GroqRateLimitError
      states.set(key, {
        ...current,
        grouping: {
          status: rateLimited ? 'rateLimited' : 'error',
          error: caught instanceof Error ? caught.message : 'Unknown error.',
        },
        updatedAt: Date.now(),
      })
      notify()
    })
}

// ---------------------------------------------------------------------------
// React-facing surface
// ---------------------------------------------------------------------------

export interface LiveStoriesState {
  key: string
  status: LiveStoryStatus
  feed: AllTopicsFeed | CombinedFeed | null
  groups: ArticleGroup[]
  grouping?: { status: GroupingStatus; error?: string }
  retry: () => void
}

export function ensurePipeline(key: string = ALL_KEY): void {
  ensure(key)
}

export function subscribeToStories(listener: () => void): () => void {
  return subscribe(listener)
}

export function getStoriesSnapshot(): { states: Map<string, PipelineState>; activeKey: string } {
  return snapshot
}

/**
 * Read ONE key's state; a query with no state yet reads as loading (the
 * pipeline starts on the next ensure() call from the hook's effect).
 */
export function readState(
  snapshotValue: { states: Map<string, PipelineState> },
  key: string = ALL_KEY,
): LiveStoriesState {
  const state = snapshotValue.states.get(key)
  const status: LiveStoryStatus = key === '' ? 'idle' : (state?.status ?? 'loading')
  return {
    key,
    status,
    feed: state?.feed ?? null,
    groups: state?.groups ?? [],
    grouping: state?.grouping,
    retry: () => ensure(key, true),
  }
}

// Prime the cache on module load.
rehydrate()
