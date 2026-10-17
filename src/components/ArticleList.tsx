import { formatDate } from '../utils/dates'
import type { NewsSource } from '../types'

/**
 * Section D: every article or official record attached to the story.
 * Cards show newest first (sources are entered oldest->newest in demo data).
 *
 * Two sources of cards use this component:
 *   - variant 'demo': story-specific fictional source cards (placeholder links)
 *   - variant 'live': real GDELT results, unverified by CivicTrace
 *
 * Either way: a publisher's bias rating (when present) is optional CONTEXT
 * about the outlet, NOT a measure of factual accuracy — cards are never
 * ranked, sorted, or highlighted by it.
 */
export default function ArticleList({
  sources,
  variant = 'demo',
}: {
  sources: NewsSource[]
  variant?: 'demo' | 'live'
}) {
  // Newest first, on a copy — same non-mutating sort convention as Timeline.
  const newestFirst = [...sources].sort((a, b) =>
    b.publicationDate.localeCompare(a.publicationDate),
  )

  return (
    <div className="article-list">
      {variant === 'demo' ? (
        <p className="article-list-note">
          All links below are demonstration placeholders pending verified
          citations. Where shown, a publisher's political-bias rating is
          contextual metadata only.
        </p>
      ) : (
        <p className="article-list-note article-list-note--live">
          Live results from the GDELT DOC 2.0 API (last 7 days). Headlines link
          to the original publishers; CivicTrace has not verified or classified
          this coverage.
        </p>
      )}

      <div className="article-grid">
        {newestFirst.map((source) => (
          <article key={source.id} className="article-card">
            <div className="article-card-meta">
              <span className="article-publisher">{source.publisher}</span>
              <time dateTime={source.publicationDate}>{formatDate(source.publicationDate)}</time>
            </div>

            <h3 className="article-title">
              {/*
                target="_blank" opens the demo link in a new tab so the story
                page is not lost; rel="noopener noreferrer" prevents the opened
                page from referencing back into ours.
              */}
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
            </h3>

            <p className="article-desc">{source.shortDescription}</p>

            <div className="article-card-footer">
              {source.biasRating ? <span className="bias-chip">{source.biasRating}</span> : null}
              {source.isDemo ? <span className="demo-tag">Demo source</span> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
