import { formatDate } from '../utils/dates'
import type { NewsSource } from '../types'
import BiasBar from './BiasBar'

/**
 * Section D of a storyline page: every live article in the cluster.
 * Cards show newest first (same non-mutating sort convention as Timeline).
 *
 * A publisher's political leaning (when MediaBias.news rated it) is
 * optional CONTEXT, NOT a measure of factual accuracy — cards are never
 * ranked, sorted, or highlighted by it.
 */
export default function ArticleList({
  sources,
}: {
  sources: NewsSource[]
}) {
  // Newest first, on a copy — same non-mutating sort convention as Timeline.
  const newestFirst = [...sources].sort((a, b) =>
    b.publicationDate.localeCompare(a.publicationDate),
  )

  return (
    <div className="article-list">
      <div className="article-grid">
        {newestFirst.map((source, index) => (
          <article
            // Composite key, not source.id alone: both feed sources build ids
            // as `${source}-${index}-${date}` with per-query indexes, so two
            // DIFFERENT articles from different topic calls can share one id
            // string — duplicate keys would render twice/erratically in React.
            key={`${index}-${source.id}`}
            className="article-card"
          >
            <div className="article-card-meta">
              <span className="article-publisher">{source.publisher}</span>
              {/* Undated articles exist (GDELT's seendate can fail to parse):
                  render an honest label instead of "Invalid Date". */}
              {source.publicationDate ? (
                <time dateTime={source.publicationDate}>{formatDate(source.publicationDate)}</time>
              ) : (
                <span>Undated</span>
              )}
            </div>

            {/* Headline sits on the same indigo chip the live-story cards
                use (stripes texture over the indigo block), so both card
                families read as one design. */}
            <h3 className="article-headline">
              <span className="article-headline-chip">
                <span className="article-headline-chip-stripes" aria-hidden="true" />
                {/**
                 * Same link conventions as the live-story cards: a new tab
                 * keeps the story page open, noopener keeps it isolated.
                 */}
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              </span>
            </h3>

            <p className="article-desc">{source.shortDescription}</p>

            {/**
             * Left-right bar with ONE marker positioned by the rating.
             * Present only when the outlet was found and rated in the
             * MediaBias.news index.
             */}
            {source.mediaBias ? <BiasBar bias={source.mediaBias} /> : null}
          </article>
        ))}
      </div>

      {/* Plain-text disclaimer UNDER the grid (not the red alert style). */}
      <p className="article-list-note">
        Live coverage from the past week, linked to the original publishers.
        Chronicl hasn't verified or classified this reporting.
      </p>
    </div>
  )
}
