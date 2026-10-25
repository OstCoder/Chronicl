import {
  buildGroqUpstreamBody,
  parseGroqPayload,
} from '../shared/groq-config.js'

/**
 * `api/groq.ts` — the PRODUCTION backend for the browser's `/api/groq`
 * calls (Vercel serverless Node function, zero-config from this api/
 * directory).
 *
 * Why it exists: the grouping backend used to live only in the Vite dev
 * middleware (vite.config.ts), which NEVER SHIPS with a production build —
 * on the deployed site every grouping call hit a bare 404, so the AI
 * storylines (the app's core feature) could never render. This function is
 * the production twin of that middleware.
 *
 * Model, system prompt and JSON schema are fixed in shared/groq-config and
 * MUST stay identical to the dev middleware's: the browser can only ever
 * run the one intended task (headline clustering), never arbitrary prompts.
 *
 * Vercel project settings must set GROQ_API_KEY (same value as the dev
 * .env.local key) — checked below with a plain process.env read.
 *
 * Rate limits: module-scope variables persist across invocations on a WARM
 * serverless instance only — treat them as a best-effort spacing guard
 * (same numbers as the dev middleware: 4s spacing, 50 runs/day-cap per
 * instance), not a hard global budget. Groq's own plan limits are the
 * real ceiling.
 */

const MIN_GROQ_INTERVAL_MS = 4_000
const GROQ_DAILY_RUN_CAP = 50
let lastRunAt = 0
let dayKey = '' // YYYY-MM-DD local-day key; resets the counter at midnight
let dayRuns = 0

/** Daily-cap key in the SERVER'S local day, matching the dev middleware. */
function localDayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Minimal structural types over Vercel's Node function helpers — the
// handler only needs the shape below (req.body parsed JSON, res is a
// ServerResponse). No @vercel/node dependency is added for these three
// members.
interface FunctionRequest {
  method?: string
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
  const reply = (status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }

  const apiKey = process.env.GROQ_API_KEY ?? ''
  if (!apiKey) {
    reply(500, {
      error:
        'GROQ_API_KEY is not set on this deployment. Add it to the Vercel project environment variables (Production), then redeploy.',
    })
    return
  }

  if (req.method !== 'POST') {
    reply(405, { error: 'POST required.' })
    return
  }

  // Same admission order as the dev middleware: spacing first (defer
  // inside THIS invocation — serverless has no queue of its own), then the
  // per-instance daily cap.
  const spacingWaitMs = MIN_GROQ_INTERVAL_MS - (Date.now() - lastRunAt)
  if (spacingWaitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, spacingWaitMs))
  }

  const today = localDayKey()
  if (dayKey !== today) {
    dayKey = today
    dayRuns = 0
  }
  if (dayRuns >= GROQ_DAILY_RUN_CAP) {
    reply(429, {
      error: `AI grouping daily budget reached (${GROQ_DAILY_RUN_CAP} runs/day on this server instance). Try again shortly.`,
    })
    return
  }

  let articles
  try {
    const parsed = parseGroqPayload(req.body)
    if (typeof parsed === 'string') {
      reply(422, { error: parsed })
      return
    }
    articles = parsed
  } catch {
    reply(400, { error: 'Malformed JSON body.' })
    return
  }

  // Admission: counted from HERE (same rule as dev — upstream failures
  // also consume budget, simplest fair rule).
  lastRunAt = Date.now()
  dayRuns += 1

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: buildGroqUpstreamBody(articles),
    })
    const text = await upstream.text()
    if (upstream.ok) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(text)
      return
    }
    // Normalize Groq's nested error objects into ONE string so the
    // browser shows the REAL reason (e.g. model_not_found) instead of a
    // dissect code number.
    let message = `Groq request failed with HTTP ${upstream.status}.`
    try {
      const parsedError = JSON.parse(text) as {
        error?: { message?: unknown } | string
      }
      if (
        parsedError &&
        typeof parsedError.error === 'object' &&
        typeof parsedError.error?.message === 'string'
      ) {
        message = parsedError.error.message
      } else if (typeof parsedError?.error === 'string') {
        message = parsedError.error
      }
    } catch {
      // keep the generic fallback
    }
    reply(upstream.status, { error: message })
  } catch (error: unknown) {
    reply(502, { error: `Groq upstream request failed: ${String(error)}` })
  }
}
