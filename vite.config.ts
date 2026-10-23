import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

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
 * articles }); the system prompt, model and response format are fixed
 * here, so the key can only ever run the one intended task.
 */
// Chosen from the account's LIVE model catalog (see the /models route
// below) at integration time: openai/gpt-oss-120b is the largest chat model
// the account serves, with the longest context window (131,072 tokens) —
// 25 headlines is a rounding error against it, so the feed can grow.
const GROQ_MODEL = 'openai/gpt-oss-120b'

/**
 * STRICT output schema for the grouping task.
 *
 * Live evidence: with loose `json_object` mode, gpt-oss-120b passed twice
 * then failed twice with "Failed to validate JSON" — a reasoning model can
 * wander off in freeform JSON. `json_schema` mode makes Groq itself reject
 * malformed output, so the client can rely on the shape it parses. The
 * schema mirrors exactly what src/services/groq.ts validates.
 */
const GROQ_GROUPS_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'story_groups',
    schema: {
      type: 'object',
      properties: {
        groups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              topic: {
                type: 'string',
                enum: ['Local Development', 'Education', 'Technology', 'Environment', 'Community'],
              },
              summary: { type: 'string' },
              articleIds: { type: 'array', items: { type: 'number' } },
              keyPoints: { type: 'array', items: { type: 'string' } },
              openQuestions: { type: 'array', items: { type: 'string' } },
              caseClosed: { type: 'boolean' },
              timeline: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    label: { type: 'string' },
                    description: { type: 'string' },
                    articleIds: { type: 'array', items: { type: 'number' } },
                  },
                  required: ['date', 'label', 'description', 'articleIds'],
                  additionalProperties: false,
                },
              },
            },
            required: ['title', 'topic', 'summary', 'articleIds', 'keyPoints', 'openQuestions', 'caseClosed', 'timeline'],
            additionalProperties: false,
          },
        },
      },
      required: ['groups'],
      additionalProperties: false,
    },
  },
}
const GROQ_SYSTEM_PROMPT = `You divide recent news headlines into coherent storylines for a civic news-tracing app that renders each storyline as its own story page (overview, vertical timeline, source list). Grouping rules:
- ONE storyline per distinct underlying event, decision, or controversy — and ALL coverage of it: cluster every headline that reports on that same underlying story into the SAME group, including the original report, follow-ups, updates, reaction and analysis pieces, and different angles. A storyline should therefore typically bring together several sources (3 or more when the payload offers them); reference them all in articleIds so the story page lists them as its sub-stories.
- Reasonable boundaries: do NOT merge separate incidents that merely share a broad theme (e.g. two different counties' moratorium votes are TWO groups, not one "data center regulation" group), and never invent a connection between headlines that are clearly about different stories.
- Depth beats breadth: aim for roughly 10 to 25 storylines when the payload holds 60+ headlines, so clusters are meaningful instead of one headline each. A single-article storyline is allowed ONLY when genuinely no other headline in the payload relates to that event. Every article belongs in exactly one group — none dropped.
- Each storyline needs a concise factual title, max 90 characters, no clickbait, no editorializing.
- topic: assign each storyline its PRIMARY subject exactly using one of the five provided category labels: "Local Development", "Education", "Technology", "Environment", "Community". If genuinely mixed, choose the dominant one.
- summary: one or two neutral sentences noting where coverage overlaps or disagrees.
- keyPoints: 3-6 short bullets of what this storyline's coverage establishes, where outlets conflict, and what remains unverified. Phrase as findings; NO opinions, NO adjectives like "shocking".
- openQuestions: 2-4 neutral questions a civic reader would still need answered about this storyline ("What we still don't know"). Fact-based and specific, NOT rhetorical.
- caseClosed: true ONLY when the storyline's latest dated reporting shows a final resolution (a decision made, a law passed or rejected, a case dismissed/settled); false while the story is still developing. When unsure, use false.
- timeline: a LONG chronological record of the storyline — one entry per genuinely DISTINCT dated development, so a well-covered storyline typically yields 4-12 entries covering every day its member articles brought something new (earliest first). Each entry MUST reuse the EXACT date ('YYYY-MM-DD') of the member article(s) it rests on: label = a concise factual name for that day's development; description = 1-2 factual sentences describing what happened that day and how the coverage reports it, drawn ONLY from the member headlines — never invent events. articleIds = the member articles that support that day's development (include all of them, so the timeline shows its sources). Events on the SAME date are SEPARATE entries — never merge two distinct developments into one note. Do NOT add a filler entry for a day when nothing new happened, and never recycle one event across multiple entries.
- Never invent articles: reference them ONLY by the numeric ids provided.
- Return STRICT JSON only matching the schema: {"groups":[{"title":string,"topic":string,"summary":string,"keyPoints":string[],"openQuestions":string[],"caseClosed":boolean,"timeline":[{"date":string,"label":string,"description":string,"articleIds":number[]}],"articleIds":number[]}]}`

interface GroqArticlePayload {
  id: number
  publisher: string
  title: string
  date: string
}

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
          let articles: GroqArticlePayload[]
          try {
            const body = JSON.parse(raw) as { articles?: unknown }
            if (!Array.isArray(body.articles) || body.articles.length === 0 || body.articles.length > 75) {
              reply(422, { error: 'Expected articles: 1..75 headlines.' })
              return
            }
            articles = (body.articles as unknown[]).map((a, i) => ({
              id: i + 1,
              publisher: typeof (a as { publisher?: unknown }).publisher === 'string' ? (a as { publisher: string }).publisher : '',
              title: typeof (a as { title?: unknown }).title === 'string' ? (a as { title: string }).title : '',
              date: typeof (a as { date?: unknown }).date === 'string' ? (a as { date: string }).date : '',
            }))
            if (articles.some((a) => !a.title)) {
              reply(422, { error: 'Every article needs a title.' })
              return
            }
          } catch {
            reply(400, { error: 'Malformed JSON body.' })
            return
          }

          const headlineList = articles
            .map((a) => `${a.id}. [${a.date || 'undated'}] ${a.publisher || 'unknown'} — ${a.title}`)
            .join('\n')

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
            body: JSON.stringify({
              model: GROQ_MODEL,
              messages: [
                { role: 'system', content: GROQ_SYSTEM_PROMPT },
                { role: 'user', content: `Group these ${articles.length} headlines:\n\n${headlineList}` },
              ],
              temperature: 0.2,
              // Reasoning models spend tokens THINKING before the JSON: a
              // 1024 cap made content truncate intermittently (browser
              // payloads with 10-25 headlines failed while 2-item tests
              // passed — that exact asymmetry showed in live testing).
              // The grouping prompt now requires deeper storylines (each
              // with several timeline entries CARRYING description text),
              // so the budget scales with it. Groq serves this model with
              // a 65,536 max-output cap; 32768 gives the richer payload
              // headroom without approaching it.
              max_tokens: 32768,
              reasoning_effort: 'low',
              response_format: GROQ_GROUPS_SCHEMA,
            }),
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
