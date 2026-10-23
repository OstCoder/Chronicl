import type { BiasReview, OutletBias } from '../types'

/**
 * MediaBias.news outlet-bias service.
 *
 * Free, key-less read API (120 requests/minute, per their docs) aggregating
 * bias verdicts from AllSides, Ad Fontes Media and Media Bias/Fact Check —
 * deliberately returned UNAVERAGED: where raters disagree, every verdict is
 * shown and credited to its rater. Chronicl honors that contract: the UI
 * renders one marker per rater, never a single flattened label, and links
 * the canonical page so every number is checkable.
 *
 * Live-verified behaviors this service accounts for:
 *   - GET /api/v1/outlets?q={domain} -> { count, outlets: [{ slug, name }] }
 *   - GET /api/v1/outlets/{slug}     -> outlet.bias.reviews[] with named
 *     reviewers and verdict strings ('right', 'leanRight', 'centre', ...),
 *     plus a `citation` block (recommended string + canonicalUrl)
 *   - responses send `Access-Control-Allow-Origin: *` and cache for 1h; we
 *     still route through the dev proxy (vite.config.ts) so no remote CORS
 *     quirk can ever break the page the way GDELT's did
 *   - unknown outlets return count 0; verdicts outside the left/right
 *     spectrum (factuality words like 'low'/'high') never become bar markers
 */

/** Same-origin path served by the vite.config.ts /api/mbias proxy. */
const MBIAS_PROXY_PATH = '/api/mbias'
const MBIAS_DIRECT_ENDPOINT = 'https://mediabias.news/api/v1'
const LIST_TTL_MS = 60 * 60 * 1000 // their cache-control max-age=3600

function resolveBase(): string {
  return import.meta.env.DEV ? MBIAS_PROXY_PATH : MBIAS_DIRECT_ENDPOINT
}

/**
 * Verdict string -> left/right position (0 = far left, 100 = far right, 50
 * = centre). Strings come from AllSides / Ad Fontes / MBFC through
 * MediaBias.news: 'left', 'leanLeft', 'centre', 'leanRight', 'right'.
 * Anything else (factuality vocabulary) has no place on this bar.
 */
function verdictToPosition(verdict: unknown): number | null {
  if (typeof verdict !== 'string') {
    return null
  }
  switch (verdict.toLowerCase()) {
    case 'left':
      return 8
    case 'leanleft':
      return 30
    case 'centre':
    case 'center':
    case 'middle':
      return 50
    case 'leanright':
      return 70
    case 'right':
      return 92
    default:
      return null
  }
}

/** 'Right' | 'Lean Right' | 'Centre' — for the readable review line. */
function verdictToLabel(verdict: unknown): string {
  switch (verdictToPosition(verdict)) {
    case 8:
      return 'Left'
    case 30:
      return 'Lean Left'
    case 50:
      return 'Centre'
    case 70:
      return 'Lean Right'
    case 92:
      return 'Right'
    default:
      return ''
  }
}

/** Raw shapes from MediaBias.news (all fields untrusted). */
interface MbiasListRecord {
  slug?: unknown
  name?: unknown
}
interface MbiasListResponse {
  count?: unknown
  outlets?: unknown
}
interface MbiasOutletResponse {
  outlet?: {
    name?: unknown
    bias?: {
      reviews?: unknown
    }
    citation?: {
      recommended?: unknown
      canonicalUrl?: unknown
    }
  }
}

function normalizeReviews(raw: unknown): BiasReview[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const reviews: BiasReview[] = []
  for (const entry of raw) {
    const record = entry as { reviewer?: unknown; verdict?: unknown; url?: unknown }
    const position = verdictToPosition(record.verdict)
    const label = verdictToLabel(record.verdict)
    const rater = typeof record.reviewer === 'string' ? record.reviewer : ''
    if (position === null || !rater || !label) {
      continue // no position on the left/right bar -> skip this review
    }
    reviews.push({
      rater,
      verdict: label,
      position,
      url: typeof record.url === 'string' ? record.url : undefined,
    })
  }
  return reviews
}

/**
 * Look up one publisher domain. Returns null when MediaBias.news has no
 * record for it, or when the network/API fails — the bar simply does not
 * render for that outlet, by design. Results are cached in-module for one
 * hour, so repeated articles from the same publisher cost one request.
 */
const listCache = new Map<string, { promise: Promise<OutletBias | null>; at: number }>()

export function lookupOutletBias(domain: string): Promise<OutletBias | null> {
  const key = domain.toLowerCase()
  const cached = listCache.get(key)
  if (cached && Date.now() - cached.at < LIST_TTL_MS) {
    return cached.promise
  }

  const promise = performLookup(key).catch(() => {
    // Cache failed lookups briefly? No: retry next render instead, so a
    // transient blip doesn't pin a missing bar to the outlet for an hour.
    listCache.delete(key)
    return null
  })
  listCache.set(key, { promise, at: Date.now() })
  return promise
}

async function performLookup(domain: string): Promise<OutletBias | null> {
  // 1. Domain -> slug via the outlets index (this is request 1 of 2,
  //    only for domains seen for the first time this hour).
  const listUrl = new URL(`${resolveBase()}/outlets`, window.location.origin)
  listUrl.searchParams.set('q', domain)

  const listResponse = await fetch(listUrl.toString())
  if (!listResponse.ok) {
    throw new Error(`MediaBias.news outlet search failed (HTTP ${listResponse.status}).`)
  }
  const list = (await listResponse.json()) as MbiasListResponse
  if (list.count !== 1 || !Array.isArray(list.outlets)) {
    return null // zero matches (or ambiguous): no bar, silently by design
  }
  const found = list.outlets[0] as MbiasListRecord
  const slug = typeof found.slug === 'string' ? found.slug : ''
  if (!slug) {
    return null
  }

  // 2. Slug -> full record with per-rater reviews (request 2 of 2).
  const recordUrl = new URL(`${resolveBase()}/outlets/${slug}`, window.location.origin)
  const recordResponse = await fetch(recordUrl.toString())
  if (!recordResponse.ok) {
    throw new Error(`MediaBias.news outlet record failed (HTTP ${recordResponse.status}).`)
  }
  const record = (await recordResponse.json()) as MbiasOutletResponse
  const reviews = normalizeReviews(record.outlet?.bias?.reviews)
  if (reviews.length === 0) {
    return null // assessed nowhere on the left/right bar: show nothing
  }

  const canonicalUrl =
    typeof record.outlet?.citation?.canonicalUrl === 'string'
      ? record.outlet.citation.canonicalUrl
      : `https://mediabias.news/sources/${slug}`

  return {
    outletName: typeof record.outlet?.name === 'string' ? record.outlet.name : '',
    reviews,
    canonicalUrl,
    citation:
      typeof record.outlet?.citation?.recommended === 'string'
        ? record.outlet.citation.recommended
        : canonicalUrl,
  }
}
