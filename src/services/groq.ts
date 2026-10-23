import type { ArticleGroup } from '../types'

/**
 * Groq AI story-grouping service.
 *
 * The browser never talks to Groq directly — it POSTs only the headline
 * payloads to the same-origin `/api/groq` backend (vite.config.ts), which
 * holds GROQ_API_KEY (from .env.local), builds the chat-completion request,
 * and returns Chat Completions JSON. The model, system prompt and JSON
 * response format are fixed server-side, so the app can only ever run the
 * one intended task (clustering headlines) — never arbitrary prompts.
 *
 * Model: llama-3.3-70b-versatile with temperature 0.2 and JSON mode, for
 * stable, low-creativity grouping.
 */

const GROQ_PROXY_PATH = '/api/groq'

export interface GroqArticleInput {
  id: number
  publisher: string
  title: string
  date: string
}

const VALID_TOPICS = new Set([
  'Local Development',
  'Education',
  'Technology',
  'Environment',
  'Community',
])

/** Thrown on HTTP 429 (Groq's limit or our own server-side budget) so the
 *  UI shows a distinct state. Carries the reason the backend gave. */
export class GroqRateLimitError extends Error {
  constructor(message = 'Groq rate limit hit — try again in a moment.') {
    super(message)
    this.name = 'GroqRateLimitError'
  }
}

/** Thrown on HTTP 401/403 (missing/invalid key) or the no-key middleware reply. */
export class GroqAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GroqAuthError'
  }
}

/** Raw Chat Completions payload (untrusted). */
interface ChatCompletionResponse {
  choices?: {
    message?: { content?: unknown }
  }[]
}

/** Raw parsed groups from the model (untrusted). */
interface ModelGroups {
  groups?: unknown
}

/**
 * Ask the model to cluster headlines. `articles` carries ids already
 * assigned BY the caller (the id is the 1-based index used in the prompt).
 * Returns groups whose articleIds are validated against the real articles.
 */
export async function groupArticles(
  articles: GroqArticleInput[],
  signal?: AbortSignal,
): Promise<ArticleGroup[]> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  let response: Response
  try {
    response = await fetch(new URL(GROQ_PROXY_PATH, window.location.origin).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new Error('Network error while contacting the Groq backend.', { cause: error })
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    throw new Error('Groq backend returned a malformed (non-JSON) response.', { cause: error })
  }

  if (!response.ok) {
    const detail =
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Groq request failed with HTTP ${response.status}.`
    // Our backend's own 429 (spacing exceeded client patience, or the daily
    // budget) carries the reason in `error` — show it verbatim.
    if (response.status === 429) {
      throw new GroqRateLimitError(detail)
    }
    if (response.status === 401 || response.status === 403 || response.status === 500) {
      throw new GroqAuthError(detail)
    }
    throw new Error(detail)
  }

  // Chat Completions: one choice -> message.content -> stringified JSON.
  const choice = (data as ChatCompletionResponse).choices?.[0]
  const content = typeof choice?.message?.content === 'string' ? choice.message.content : ''
  let parsed: ModelGroups
  try {
    parsed = JSON.parse(content) as ModelGroups
  } catch (error) {
    throw new Error('The model did not return valid JSON groups.', { cause: error })
  }
  if (!Array.isArray(parsed.groups)) {
    throw new Error('The model response is missing its groups array.')
  }

  const validIds = new Set(articles.map((a) => a.id))
  // date -> the ids that actually carry it: model timeline entries must
  // borrow a REAL article date, never invent one.
  const datesById = new Map(articles.map((a) => [a.id, a.date]))
  const groups: ArticleGroup[] = []
  for (const entry of parsed.groups) {
    // Model-local untrusted validation: no titles, no forged ids.
    const record = entry as {
      title?: unknown
      topic?: unknown
      summary?: unknown
      articleIds?: unknown
      keyPoints?: unknown
      openQuestions?: unknown
      caseClosed?: unknown
      timeline?: unknown
    }
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    // The model labels each cluster with one of the app's filter categories
    // (schema enum); anything outside that list falls back to the broadest
    // civic label rather than silently dropping a valid group.
    const topic =
      typeof record.topic === 'string' && VALID_TOPICS.has(record.topic)
        ? (record.topic as ArticleGroup['topic'])
        : 'Local Development'
    if (!title) {
      continue
    }
    const articleIds = Array.isArray(record.articleIds)
      ? [
          ...new Set(
            // Dedupe PRESERVING order: a repeated id (model noise) would
            // otherwise list the same article twice in the member lists.
            // Drop the invalid ones at the same time.
            record.articleIds.filter(
              (value): value is number => typeof value === 'number' && validIds.has(value),
            ),
          ),
        ]
      : []
    if (articleIds.length === 0) {
      continue
    }

    // Timeline entries: keep only ones whose date matches a member article.
    const timeline: ArticleGroup['timeline'] = []
    if (Array.isArray(record.timeline)) {
      for (const item of record.timeline) {
        const t = item as {
          date?: unknown
          label?: unknown
          description?: unknown
          articleIds?: unknown
        }
        const label = typeof t.label === 'string' ? t.label.trim() : ''
        // Same dedupe policy as the group's own ids: repeated model noise
        // must not list one article twice under a timeline node.
        const ids = [
          ...new Set(
            Array.isArray(t.articleIds)
              ? t.articleIds.filter(
                  (value): value is number =>
                    typeof value === 'number' && articleIds.includes(value),
                )
              : [],
          ),
        ]
        const date = typeof t.date === 'string' ? t.date.slice(0, 10) : ''
        const description =
          typeof t.description === 'string' ? t.description.trim() : ''
        // Date must be a REAL calendar day AND one a member article actually
        // published. The format check matters: an undated member article's
        // date is '', and the model could echo '' back — the round-trip
        // equality below would then happily accept it and the story page
        // would render "Invalid Date". Require YYYY-MM-DD first.
        if (
          !label ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !ids.some((id) => datesById.get(id) === date)
        ) {
          continue
        }
        timeline.push({ date, label, description, articleIds: ids })
      }
    }

    const keyPoints = Array.isArray(record.keyPoints)
      ? record.keyPoints
          .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
          .map((value) => value.trim())
      : []

    // "What we still don't know": same filter policy as keyPoints. The
    // schema REQUIRES the field, so an empty list is a legitimate outcome.
    const openQuestions = Array.isArray(record.openQuestions)
      ? record.openQuestions
          .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
          .map((value) => value.trim())
      : []
    // caseClosed: required boolean in the schema; default open (false) —
    // the UI only trusts TRUE with an explicit boolean from the model.
    const caseClosed = record.caseClosed === true

    groups.push({
      title,
      topic,
      summary: typeof record.summary === 'string' ? record.summary.trim() : '',
      articleIds,
      keyPoints,
      openQuestions,
      caseClosed,
      timeline,
    })
  }
  return groups
}
