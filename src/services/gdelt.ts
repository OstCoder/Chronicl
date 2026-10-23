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
  /** Article image URL when GDELT has one (often empty/omitted). */
  socialimage?: unknown
}

/** The normalized shape every Chronicl component consumes. */
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
  /** OPTIONAL article image from the source (GDELT socialimage / GNews image). */
  image?: string
}

/**
 * Thrown on HTTP 429 or while a backoff window from an earlier 429 is still
 * active. Carries the wait the UI should show (and that auto-retry uses).
 */
export class GdeltRateLimitError extends Error {
  /** Seconds the caller should wait before automatically retrying. */
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(
      `GDELT is rate limiting this IP right now. It uses a rolling block on busy IPs, ` +
        `which can outlast its normal one-request-every-5s rule. Retrying in ~${retryAfterSeconds}s — ` +
        `or switch to GNews meanwhile.`,
    )
    this.name = 'GdeltRateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** Module-scoped throttle: shared by every component using this service. */
let lastRequestStartedAt = 0
/**
 * Serialized spacing gate: every caller APPENDS its slot to this promise
 * chain. Computing the wait outside a chain is a race — two concurrent
 * callers read the same `lastRequestStartedAt`, both decide "I can go
 * now", and both fire into GDELT at once, burning the one-request-per-5s
 * budget in a single instant. Chained slots guarantee each request starts
 * at least MIN_REQUEST_INTERVAL_MS after the previous one's start.
 */
let gdeltGate: Promise<void> = Promise.resolve()

/**
 * Adaptive backoff for GDELT's IP lockout. Observed live: a single request
 * can 429 long after the nominal 5s window (today the same IP got 429s even
 * after 7-minute quiet gaps, then a 200). Repeatedly firing requests into a
 * locked-out endpoint looks abusive AND resets their rolling window, so we
 * stop sending while our own backoff is active and fail fast instead.
 */
const GDELT_BACKOFF_STEPS_MS = [60_000, 180_000, 300_000]
let rateLimitHits = 0
let backoffUntil = 0

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

  // socialimage is commonly missing or empty — only trust real http(s) URLs.
  const image =
    typeof raw.socialimage === 'string' && /^https?:\/\//i.test(raw.socialimage)
      ? raw.socialimage
      : undefined

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
    ...(image ? { image } : {}),
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

  // Backoff from a prior 429: fail FAST, don't send into the lockout. The
  // hook reads `retryAfterSeconds` off the error and auto-retries then.
  const backoffRemainingMs = backoffUntil - Date.now()
  if (backoffRemainingMs > 0) {
    throw new GdeltRateLimitError(Math.ceil(backoffRemainingMs / 1000))
  }

  // Throttle across ALL callers so together we stay within 1 req / 5s —
  // through the serialized gate, NOT a bare wait: concurrent callers form
  // a queue, so their starts are spaced no matter when they arrive.
  const slot = gdeltGate.then(() => {
    const waitMs = Math.max(
      MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt),
      0,
    )
    return waitMs > 0
      ? new Promise<void>((resolve) => setTimeout(resolve, waitMs))
      : Promise.resolve()
  })
  gdeltGate = slot
  await slot
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
    // Escalate: 60s, then 180s, then stay at 300s until a request succeeds.
    const waitMs = GDELT_BACKOFF_STEPS_MS[
      Math.min(rateLimitHits, GDELT_BACKOFF_STEPS_MS.length - 1)
    ]
    rateLimitHits += 1
    backoffUntil = Date.now() + waitMs
    throw new GdeltRateLimitError(Math.ceil(waitMs / 1000))
  }
  if (!response.ok) {
    throw new Error(`GDELT request failed with HTTP ${response.status}.`)
  }

  // Success resets the backoff ladder (per-request, not per-session, so a
  // later lockout by GDELT starts at a gentle 60s again).
  rateLimitHits = 0
  backoffUntil = 0

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
