import type { LiveNewsArticle } from './gdelt'

/**
 * GNews API v4 service — second live-news source alongside GDELT.
 *
 * Backend shape (see vite.config.ts): the browser fetches the same-origin
 * `/api/gnews` path; the dev server's middleware injects the GNEWS_API_KEY
 * from `.env.local` and proxies to https://gnews.io/api/v4/search. The key
 * is never exposed to the browser — GNews's own docs recommend calling the
 * API from a backend for exactly this reason.
 *
 * Verified behaviors this service accounts for:
 *   - upstream query param is `apikey`, returns `{ articles: [...] }`
 *   - free tier = 100 requests/DAY (much scarcer than GDELT's 1-per-5s),
 *     so there is no per-second throttle here — restraint comes from the
 *     UI switcher: GNews only fires when the user actively selects it
 *   - article fields: title, description, url, publishedAt (ISO 8601),
 *     source: { name, url }
 *   - HTTP 429 = daily quota exhausted; 401/403 = key missing/invalid
 */

/** Same-origin path served by the vite.config.ts gnews backend middleware. */
const GNEWS_PROXY_PATH = '/api/gnews'

export const GNEWS_MAX_RECORDS = 10

/**
 * Raw article object exactly as GNews returns it (all fields untrusted).
 * `source` is an object here, unlike GDELT's flat `domain`.
 */
interface GnewsRawArticle {
  title?: unknown
  description?: unknown
  url?: unknown
  publishedAt?: unknown
  image?: unknown
  source?: { name?: unknown; url?: unknown }
}

/** Thrown on HTTP 401/403 or a "missing key" middleware response. */
export class GnewsAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GnewsAuthError'
  }
}

/** Thrown on HTTP 429 (daily quota exhausted) so the UI shows a hint. */
export class GnewsRateLimitError extends Error {
  constructor() {
    super('GNews daily quota used up (free tier: 100 requests/day). Try again tomorrow or switch to GDELT.')
    this.name = 'GnewsRateLimitError'
  }
}

/** Timestamp-tolerant slice: any ISO string starts with 'YYYY-MM-DD'. */
function isoDateOnly(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
}

/**
 * Normalize one GNews article. Returns null (caller skips it) when required
 * fields are missing or the URL is not a real http(s) link.
 */
function normalizeArticle(raw: GnewsRawArticle, index: number): LiveNewsArticle | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (!title || !/^https?:\/\//i.test(url)) {
    return null
  }

  let source =
    typeof raw.source?.name === 'string' ? raw.source.name.trim() : ''
  if (!source) {
    try {
      source = new URL(url).hostname
    } catch {
      return null // unparseable URL with no source name: unusable
    }
  }

  // GNews returns a description snippet; keep it as the same
  // 'meta' text slot GDELT fills with 'language · country'.
  const description = typeof raw.description === 'string' ? raw.description.trim() : ''

  // GNews's `image` field is optional too — only trust real http(s) URLs.
  const image =
    typeof raw.image === 'string' && /^https?:\/\//i.test(raw.image) ? raw.image : undefined

  return {
    id: `gnews-${index}-${raw.publishedAt ?? 'undated'}`,
    title,
    source,
    url,
    publishedAt: isoDateOnly(raw.publishedAt),
    // GNews has no top-level language/country per article; keep the slots
    // aligned with LiveNewsArticle so both sources render identically.
    language: '—',
    sourceCountry: description ? `snippet: ${description}` : '—',
    ...(image ? { image } : {}),
  }
}

/**
 * Fetch and normalize live articles for a search phrase via the local
 * GNews backend. Respects the AbortSignal passed from the calling hook.
 */
export async function fetchLiveGnewsArticles(
  query: string,
  options: { maxRecords?: number; signal?: AbortSignal } = {},
): Promise<LiveNewsArticle[]> {
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const url = new URL(GNEWS_PROXY_PATH, window.location.origin)
  url.searchParams.set('q', query)
  url.searchParams.set('max', String(options.maxRecords ?? GNEWS_MAX_RECORDS))

  let response: Response
  try {
    response = await fetch(url.toString(), { signal: options.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error // let the hook recognize a superseded request
    }
    throw new Error('Network error while contacting the GNews backend.', { cause: error })
  }

  // Distinguish quota problems from authentication problems up front.
  if (response.status === 429) {
    throw new GnewsRateLimitError()
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    throw new Error('GNews backend returned a malformed (non-JSON) response.', { cause: error })
  }

  if (!response.ok) {
    const detail =
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `GNews request failed with HTTP ${response.status}.`
    if (response.status === 401 || response.status === 403 || response.status === 500) {
      throw new GnewsAuthError(detail)
    }
    throw new Error(detail)
  }

  const articles = (data as { articles?: unknown }).articles
  if (!Array.isArray(articles)) {
    throw new Error('GNews response is missing its articles array.')
  }

  return articles
    .map((raw, index) => normalizeArticle(raw as GnewsRawArticle, index))
    .filter((article): article is LiveNewsArticle => article !== null)
}
