import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import {
  buildGroqUpstreamBody,
  parseGroqPayload,
  type GroqArticlePayload,
} from './shared/groq-config.js'

// https://vite.dev/config/
//
// Two server-side shims keep external news APIs out of the browser bundle:
//
// 1. DEV PROXY for GDELT (`/api/gdelt`):
//    The GDELT 2.0 doc API sends `Access-Control-Allow-Origin: *` on most
//    responses but intermittently OMITS the header (observed live: a node
//    probe got the header while a same-minute headless-Chrome session got a
//    CORS-blocked fetch). Routing through a same-origin proxy sidesteps
//    CORS completely. Frontend calls `/api/gdelt` (services/gdelt.ts);
//    only that path is proxied.
//
// 2. DEV MIDDLEWARE for GNews (`/api/gnews`):
//    GNews requires an `apikey` query parameter, and GNews's own docs warn
//    that a key in front-end code is visible to anyone. So /api/gnews is a
//    small local backend: it reads GNEWS_API_KEY from `.env.local`
//    (gitignored, never bundled), attaches it to the upstream gnews.io
//    request, and hands the JSON back. The browser never sees the key.
//    Missing key -> clear 500 JSON telling the developer where to put it.

/** Build the GNews middleware plugin, closing over the server-side key. */
function gnewsBackend(apiKey: string): Plugin {
  return {
    name: 'gnews-key-backend',
    configureServer(server) {
      server.middlewares.use('/api/gnews', (req, res) => {
        // `use(path, ...)` strips the '/api/gnews' prefix from req.url.
        const incoming = new URL(req.url ?? '/', 'http://localhost')
        const q = incoming.searchParams.get('q') ?? 'news'
        const max = incoming.searchParams.get('max') ?? '10'

        const reply = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }

        if (!apiKey) {
          reply(500, {
            error: 'GNEWS_API_KEY is not set. Copy .env.example to .env.local and paste your GNews key there, then restart the dev server.',
          })
          return
        }

        const upstream = new URL('https://gnews.io/api/v4/search')
        upstream.searchParams.set('q', q)
        upstream.searchParams.set('max', max)
        upstream.searchParams.set('apikey', apiKey)

        // Backend-to-backend hop: CORS does not apply, and the key stays
        // inside the dev process, unreachable from the browser.
        fetch(upstream.toString())
          .then(async (response) => {
            const text = await response.text()
            // Pass GNews's own status and JSON through so the service layer
            // can distinguish 429 (quota) from 401/403 (key problems).
            res.statusCode = response.status
            res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json')
            res.end(text)
          })
          .catch((error: unknown) => {
            reply(502, { error: `GNews upstream request failed: ${String(error)}` })
          })
      })
    },
  }
}

/**
 * Groq backend for AI story grouping (`/api/groq`).
 *
 * Third server-side shim: reads GROQ_API_KEY from `.env.local`, and —
 * unlike the two pass-throughs — BUILDS the upstream request itself. Why:
 * Groq is OpenAI-compatible chat, and letting the browser post arbitrary
 * prompts through the key would make this a free LLM proxy for anyone on
 * localhost. Instead the client sends ONLY the headline payloads ({
 * articles }); the system prompt, model and response format are fixed —
 * SHARED with the production serverless function (api/groq.ts) in
 * ./shared/groq-config, so the key can only ever run the one intended
 * task and the two hosts cannot drift apart.
 */

function groqBackend(apiKey: string): Plugin {
  // Groq's free tier throttles per-minute AND per-day; hammering a shared
  // key risks a cooldown nobody wants. Our own limits sit BELOW Groq's so
  // the natural ceiling is ours, not an outage: one grouping run every
  // 4 seconds (MIN_GROQ_INTERVAL_MS), and a per-day cap that resets at
  // midnight local time (the LOCAL-day key below, not UTC).
  const MIN_GROQ_INTERVAL_MS = 4_000
  const GROQ_DAILY_RUN_CAP = 50
  let lastRunAt = 0
  let dayKey = '' // YYYY-MM-DD; resets the daily counter at midnight
  let dayRuns = 0

  return {
    name: 'groq-grouping-backend',
    configureServer(server) {
      server.middlewares.use('/api/groq', (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }

        if (!apiKey) {
          reply(500, {
            error: 'GROQ_API_KEY is not set. Add it to .env.local (see .env.example), then restart the dev server.',
          })
          return
        }
        // Read-only model catalog passthrough (dev convenience): lets us
        // verify which model ids the CURRENT account can actually use
        // before wiring one into the fixed task. No prompts, no inference.
        if (req.method === 'GET' && (req.url ?? '').startsWith('/models')) {
          fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
            .then(async (upstream) => {
              res.statusCode = upstream.status
              res.setHeader('Content-Type', 'application/json')
              res.end(await upstream.text())
            })
            .catch((error: unknown) => {
              reply(502, { error: `Groq upstream request failed: ${String(error)}` })
            })
          return
        }
        if (req.method !== 'POST') {
          reply(405, { error: 'POST required.' })
          return
        }
        // Rate limit check before ANY work: spacing first, then the daily
        // cap. Waiting happens here (a single dev user), so the client
        // simply sees its run take an extra moment — no 429 UX needed for
        // quick successive clicks.
        const spacingWaitMs = MIN_GROQ_INTERVAL_MS - (Date.now() - lastRunAt)
        if (spacingWaitMs > 0) {
          // Serialize the request until the spacing window opens.
          setTimeout(() => {
            processGroq(req, res)
          }, spacingWaitMs)
          return
        }
        processGroq(req, res)
      })

      /** Runs AFTER rate-limit admission (spacing may have deferred us). */
      function processGroq(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }
        // Daily cap, checked before reading the body: cheap and flat.
        // Keyed on the LOCAL day (documented behavior: resets at midnight
        // for the developer sitting at the machine) — toISOString would be
        // UTC and reset up to a day early/late depending on timezone.
        const now = new Date()
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        if (dayKey !== today) {
          dayKey = today
          dayRuns = 0
        }
        if (dayRuns >= GROQ_DAILY_RUN_CAP) {
          reply(429, {
            error: `AI grouping daily budget reached (${GROQ_DAILY_RUN_CAP} runs/day on this dev server). Resets at midnight.`,
          })
          return
        }

        let raw = ''
        let oversized = false
        req.on('data', (chunk: Buffer) => {
          raw += chunk.toString()
          if (raw.length > 64_000) {
            oversized = true
            raw = '' // stop accumulating; reply below
          }
        })
        req.on('end', () => {
          if (oversized) {
            reply(413, { error: 'Payload too large.' })
            return
          }
          // Payload parse + upstream body build live in the shared
          // groq-config module (identical to api/groq.ts).
          let articles: GroqArticlePayload[]
          try {
            const parsed = parseGroqPayload(JSON.parse(raw))
            if (typeof parsed === 'string') {
              reply(422, { error: parsed })
              return
            }
            articles = parsed
          } catch {
            reply(400, { error: 'Malformed JSON body.' })
            return
          }

          // Admission: the run counts from HERE (upstream call accepted),
          // so upstream failures also consume budget — simplest fair rule.
          lastRunAt = Date.now()
          dayRuns += 1

          fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: buildGroqUpstreamBody(articles),
          })
            .then(async (upstream) => {
              const text = await upstream.text()
              if (upstream.ok) {
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(text)
                return
              }
              // Normalize Groq's nested error objects into ONE string so the
              // browser shows the REAL reason (e.g. model_not_found) instead
              // of a dissect code number.
              let message = `Groq request failed with HTTP ${upstream.status}.`
              try {
                const parsed = JSON.parse(text) as {
                  error?: { message?: unknown } | string
                }
                if (parsed && typeof parsed.error === 'object' && typeof parsed.error?.message === 'string') {
                  message = parsed.error.message
                } else if (typeof parsed?.error === 'string') {
                  message = parsed.error
                }
              } catch {
                // keep the generic fallback
              }
              reply(upstream.status, { error: message })
            })
            .catch((error: unknown) => {
              reply(502, { error: `Groq upstream request failed: ${String(error)}` })
            })
        })
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  // loadEnv reads .env/.env.local without importing dotenv; the '' prefix
  // keeps vars without the VITE_ prefix, which is exactly what we want for
  // a server-side secret that must never reach the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const gnewsKey = env.GNEWS_API_KEY ?? ''
  const groqKey = env.GROQ_API_KEY ?? ''

  return {
    plugins: [react(), gnewsBackend(gnewsKey), groqBackend(groqKey)],
    server: {
      proxy: {
        '/api/gdelt': {
          target: 'https://api.gdeltproject.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gdelt/, '/api/v2/doc/doc'),
        },
        // MediaBias.news sends `Access-Control-Allow-Origin: *` on its read
        // API; the proxy is still worth it for consistency with GDELT (one
        // CORS omission has already broken this app once) and it keeps the
        // service layer origin-agnostic. No key involved.
        '/api/mbias': {
          target: 'https://mediabias.news',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/mbias/, '/api/v1'),
        },
      },
    },
  }
})
