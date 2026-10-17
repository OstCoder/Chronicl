import { useEffect, useState } from 'react'
import { fetchLiveNews, GdeltRateLimitError, type LiveNewsArticle } from '../services/gdelt'

/**
 * All states a live news panel can be in. 'idle' means "no query yet" —
 * we must NOT fire a GDELT request for an empty search box.
 */
export type GdeltNewsStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'rateLimited'

export interface GdeltNewsState {
  status: GdeltNewsStatus
  articles: LiveNewsArticle[]
  error?: string
}

/**
 * What the fetch resolved to. `status` is deliberately NOT stored here —
 * it is DERIVED during render from this stored result vs the current query.
 * That removes every synchronous setState from the effect: effects only
 * update state from async callbacks, so no cascading re-renders occur.
 */
interface StoredResult {
  query: string
  attempt: number
  articles: LiveNewsArticle[]
  error?: string
  rateLimited?: boolean
}

/**
 * One GDELT query -> one fetch, debounced and cancellable.
 *
 * - 500ms debounce: typing "data ce..." must not fire 6 requests
 * - AbortController + `active` flag: a superseded request can never
 *   overwrite the state of a newer one
 * - `attempt` is an optional re-fetch trigger for the panel's retry button
 */
export function useGdeltNews(query: string, maxRecords = 20, attempt = 0): GdeltNewsState {
  const [result, setResult] = useState<StoredResult | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') {
      return // nothing to fetch — the derived state below already shows idle
    }

    const controller = new AbortController()
    let active = true // flipped false by cleanup: this request is superseded

    const timer = setTimeout(() => {
      fetchLiveNews(trimmed, { maxRecords, signal: controller.signal })
        .then((articles) => {
          if (active) {
            setResult({ query: trimmed, attempt, articles })
          }
        })
        .catch((error: unknown) => {
          if (!active) {
            return
          }
          const rateLimited = error instanceof GdeltRateLimitError
          const message = error instanceof Error ? error.message : 'Unknown error.'
          setResult({ query: trimmed, attempt, articles: [], error: message, rateLimited })
        })
    }, 500)

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, maxRecords, attempt])

  // ---------- Derived state: computed during render, no effects ----------
  const trimmedQuery = query.trim()
  if (trimmedQuery === '') {
    return { status: 'idle', articles: [] }
  }
  // Stored result is absent or for an older query/attempt -> we are loading.
  if (!result || result.query !== trimmedQuery || result.attempt !== attempt) {
    return { status: 'loading', articles: [] }
  }
  if (result.error !== undefined) {
    return {
      status: result.rateLimited ? 'rateLimited' : 'error',
      articles: [],
      error: result.error,
    }
  }
  return result.articles.length === 0
    ? { status: 'empty', articles: [] }
    : { status: 'success', articles: result.articles }
}
