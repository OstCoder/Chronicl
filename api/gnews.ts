/**
 * `api/gnews.ts` — the PRODUCTION backend for the browser's `/api/gnews`
 * calls (Vercel serverless Node function, zero-config from this api/
 * directory). Production twin of the Vite dev middleware in
 * vite.config.ts, which never ships with a built site.
 *
 * GNews requires an `apikey` query parameter, and GNews's own docs warn
 * that a key in front-end code is visible to anyone. This function reads
 * GNEWS_API_KEY from the Vercel project's environment variables, attaches
 * it to the upstream gnews.io request, and hands the JSON back unchanged.
 * The browser sends only `q` and `max`, so it never sees the key.
 *
 * Vercel project settings must set GNEWS_API_KEY (same free-tier key as
 * the dev .env.local one) — checked below with a plain process.env read.
 */

// Minimal structural types over Vercel's Node function helpers.
interface FunctionRequest {
  method?: string
  url?: string
  body?: unknown
}
interface FunctionResponse {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

export default async function handler(
  req: FunctionRequest,
  res: FunctionResponse,
): Promise<void> {
  // Read the query from the URL: Vercel keeps the full query string on
  // req.url (only the api/<file> path segment selects the function).
  const incoming = new URL(req.url ?? '/', 'https://function.invalid')
  const q = incoming.searchParams.get('q') ?? 'news'
  const max = incoming.searchParams.get('max') ?? '10'

  const reply = (status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }

  if (req.method !== 'GET') {
    reply(405, { error: 'GET required.' })
    return
  }

  const apiKey = process.env.GNEWS_API_KEY ?? ''
  if (!apiKey) {
    reply(500, {
      error:
        'GNEWS_API_KEY is not set on this deployment. Add it to the Vercel project environment variables (Production), then redeploy.',
    })
    return
  }

  const upstream = new URL('https://gnews.io/api/v4/search')
  upstream.searchParams.set('q', q)
  upstream.searchParams.set('max', max)
  upstream.searchParams.set('apikey', apiKey)

  try {
    const response = await fetch(upstream.toString())
    const text = await response.text()
    // Pass GNews's own status and JSON through so the service layer can
    // distinguish 429 (daily quota) from 401/403 (key problems).
    res.statusCode = response.status
    res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json')
    res.end(text)
  } catch (error: unknown) {
    reply(502, { error: `GNews upstream request failed: ${String(error)}` })
  }
}
