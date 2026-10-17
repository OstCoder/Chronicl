import { useState } from 'react'
import { useGdeltNews } from '../hooks/useGdeltNews'
import { DEMO_NEWS_FALLBACK } from '../data/demoNewsFallback'
import type { NewsSource } from '../types'
import ArticleList from './ArticleList'

interface GdeltNewsPanelProps {
  /** Raw GDELT full-text query; empty string shows the idle hint. */
  query: string
  heading?: string
}

/**
 * Reuse trick: GdeltNewsPanel maps normalized live articles onto the app's
 * existing `NewsSource` interface, so the EXISTING ArticleList component
 * and its styling render them unchanged (isDemo: false hides demo tags).
 */
function toNewsSource(articles: {
  id: string
  title: string
  source: string
  url: string
  publishedAt: string
  language: string
  sourceCountry: string
}[]): NewsSource[] {
  return articles.map((article) => ({
    id: article.id,
    title: article.title,
    publisher: article.source,
    publicationDate: article.publishedAt,
    shortDescription: `${article.language} · ${article.sourceCountry}`,
    url: article.url,
    isDemo: false,
  }))
}

/**
 * A self-contained live news block: handles idle / loading / empty /
 * error / rate-limited states, and renders results with the app's
 * existing source-card styling.
 */
export default function GdeltNewsPanel({
  query,
  heading = 'Live reporting via GDELT',
}: GdeltNewsPanelProps) {
  const [attempt, setAttempt] = useState(0)
  const { status, articles, error } = useGdeltNews(query, 20, attempt)

  const retry = () => setAttempt((value) => value + 1)

  return (
    <div className="gdelt-panel">
      <h3 className="gdelt-panel-heading">{heading}</h3>

      {status === 'idle' ? (
        <p className="gdelt-panel-note">
          Pick a topic or type a search to pull live reporting from the
          GDELT DOC 2.0 API (free, no key, last 7 days).
        </p>
      ) : null}

      {status === 'loading' ? <p className="gdelt-panel-note">Fetching live reporting…</p> : null}

      {status === 'empty' ? (
        <p className="gdelt-panel-note no-results">No articles found for that query in the last 7 days.</p>
      ) : null}

      {status === 'error' || status === 'rateLimited' ? (
        <>
          <div className="gdelt-panel-note no-results">
            {/* GDELT allows one request every 5 seconds — busy sessions (or
                other users behind the same IP) can legitimately hit this;
                it is an API condition, not an app bug. */}
            <p>
              {status === 'rateLimited'
                ? (error ?? 'Rate limited. Try again shortly.')
                : (error ?? 'Something went wrong.')}
            </p>
            <button type="button" className="filter-btn" onClick={retry}>
              Retry live fetch
            </button>
          </div>
          {/**
           * Fallback: clearly-labeled demo articles keep the panel
           * demonstrable while the live feed is unavailable. They are
           * NEVER mixed into successful live results.
           */}
          <p className="gdelt-panel-count">
            Showing demo articles while the live feed is unavailable
          </p>
          <ArticleList sources={DEMO_NEWS_FALLBACK} variant="demo" />
        </>
      ) : null}

      {status === 'success' ? (
        <>
          <p className="gdelt-panel-count">
            {articles.length} article{articles.length === 1 ? '' : 's'} from GDELT (last 7 days)
          </p>
          <ArticleList sources={toNewsSource(articles)} variant="live" />
        </>
      ) : null}
    </div>
  )
}
