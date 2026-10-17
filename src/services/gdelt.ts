/**
 * GDELT DOC 2.0 service.
 *
 * Free, key-less news index: https://api.gdeltproject.org/api/v2/doc/doc
 * Verified behaviors this service accounts for:
 *   - the API's `Access-Control-Allow-Origin: *` header is UNRELIABLE: a
 *     headless-Chrome probe observed `net::ERR_FAILED` (no ACAO header) on a
 *     URL that a node-side probe minutes earlier returned with the header
 *     set. To eliminate the CORS dependency during development the fetch
 *     goes through Vite's dev proxy at `/api/gdelt` — a same-origin path
 *     rewritten server-side to GDELT's real `/api/v2/doc/doc` endpoint
 *     (see vite.config.ts). PROD fallback is direct, unchanged.
 *   - hard rate limit of ONE request per 5 seconds (HTTP 429 otherwise),
 *     so all calls are throttled centrally here, whichever component uses
 *     the service
 *   - `seendate` looks like '20261017T040000Z' — parsed by slicing, never
 *     by `new Date(...)` string guessing
 */

/** Same-origin path the Vite dev server proxies to the real GDELT host. */
const GDELT_DEV_PROXY_PATH = '/api/gdelt'
/** Direct host, used when the proxy is unavailable (production / preview). */
const GDELT_DIRECT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc'

/**
 * Prefer the same-origin dev proxy (no CORS exposure at all). Fall back to
 * hitting GDELT directly when the proxy is not configured — keeps the
 * service useful behind `vite preview` or a static production host until a
 * production-grade proxy choice is made.
 */
function resolveGdeltEndpoint(): string {
  return import.meta.env.DEV ? GDELT_DEV_PROXY_PATH : GDELT_DIRECT_ENDPOINT
}
const MIN_REQUEST_INTERVAL_MS = 6_000 // one request per 5s, with margin
export const GDELT_TIMESPAN = '7d'

/** Raw article object exactly as GDELT returns it (all fields untrusted). */
interface GdeltRawArticle {
  url?: unknown
  title?: unknown
  seendate?: unknown
  domain?: unknown
  language?: unknown
  sourcecountry?: unknown
}

/** The normalized shape every CivicTrace component consumes. */
export interface LiveNewsArticle {
  id: string
  title: string
  /** Publisher domain, e.g. 'washingtonpost.com'. */
  source: string
  url: string
  /** ISO date 'YYYY-MM-DD' derived from seendate. */
  publishedAt: string
  language: string
  sourceCountry: string
}

/** Thrown on HTTP 429 so the UI can show a "try again shortly" state. */
export class GdeltRateLimitError extends Error {
  constructor() {
    super('GDELT rate limit hit — one request every 5 seconds. Try again shortly.')
    this.name = 'GdeltRateLimitError'
  }
}

/** Module-scoped throttle: shared by every component using this service. */
let lastRequestStartedAt = 0

/**
 * '20261017T040000Z' -> '2026-10-17'. Returns null for anything that does
 * not at least start with 8 digits + 'T', instead of trusting GDELT blindly.
 */
function parseSeenDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T/)
  if (!match) {
    return null
  }
  return `${match[1]}-${match[2]}-${match[3]}`
}

/**
 * Normalize one raw article. Returns null (caller skips it) when required
 * fields are missing or a URL is not a real http(s) link.
 */
function normalizeArticle(raw: GdeltRawArticle, index: number): LiveNewsArticle | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (!title || !/^https?:\/\//i.test(url)) {
    return null
  }

  let source = typeof raw.domain === 'string' ? raw.domain.trim() : ''
  if (!source) {
    try {
      source = new URL(url).hostname
    } catch {
      return null // unparseable URL with no domain: unusable
    }
  }

  return {
    id: `gdelt-${index}-${raw.seendate ?? 'undated'}`,
    title,
    source,
    url,
    publishedAt: parseSeenDate(raw.seendate) ?? '',
    language: typeof raw.language === 'string' ? raw.language : 'Unknown',
    sourceCountry: typeof raw.sourcecountry === 'string' ? raw.sourcecountry : 'Unknown',
  }
}

/**
 * Fetch and normalize live articles for a search phrase.
 * `query` is the raw GDELT full-text query (callers may quote phrases).
 * Respects the AbortSignal passed from the calling hook.
 */
export async function fetchLiveNews(
  query: string,
  options: { maxRecords?: number; signal?: AbortSignal } = {},
): Promise<LiveNewsArticle[]> {
  const maxRecords = options.maxRecords ?? 20

  // Throttle across ALL callers so together we stay within 1 req / 5s.
  const waitMs = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt)
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
  lastRequestStartedAt = Date.now()

  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const url = new URL(resolveGdeltEndpoint(), window.location.origin)
  url.searchParams.set('query', query)
  url.searchParams.set('mode', 'artlist')
  url.searchParams.set('format', 'json')
  url.searchParams.set('maxrecords', String(maxRecords))
  url.searchParams.set('timespan', GDELT_TIMESPAN)
  url.searchParams.set('sort', 'datedesc')

  let response: Response
  try {
    response = await fetch(url.toString(), { signal: options.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error // let the hook recognize a superseded request
    }
    throw new Error('Network error while contacting GDELT.', { cause: error })
  }

  if (response.status === 429) {
    throw new GdeltRateLimitError()
  }
  if (!response.ok) {
    throw new Error(`GDELT request failed with HTTP ${response.status}.`)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    throw new Error('GDELT returned a malformed (non-JSON) response.', { cause: error })
  }

  const articles = (data as { articles?: unknown }).articles
  if (!Array.isArray(articles)) {
    throw new Error('GDELT response is missing its articles array.')
  }

  return articles
    .map((raw, index) => normalizeArticle(raw as GdeltRawArticle, index))
    .filter((article): article is LiveNewsArticle => article !== null)
}
