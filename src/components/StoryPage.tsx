import { Link } from 'react-router-dom'
import ArticleList from './ArticleList'
import ClaimLedger from './ClaimLedger'
import EvidenceGaps from './EvidenceGaps'
import GdeltNewsPanel from './GdeltNewsPanel'
import Timeline from './Timeline'
import { getTopicQueryForCategory } from '../data/topicGroups'
import type { Story } from '../types'

/**
 * The story page's presentation component. It receives a complete Story and
 * composes the four required sections IN THIS EXACT ORDER:
 *
 *   A. Story overview                    ← live (Stage 4)
 *   B. Unified Claim Ledger              ← live (Stage 6, <ClaimLedger>)
 *   C. Timeline | What we don't know     ← live (Stage 6, <Timeline> +
 *                                          <EvidenceGaps>)
 *   D. Sources                           ← live (Stage 7, <ArticleList>)
 *
 * The section wrappers, headings and grid below are PERMANENT. Stages 6–7
 * only replace each small placeholder paragraph with the matching
 * component, so the page's structure never has to be refactored.
 */
export default function StoryPage({ story }: { story: Story }) {
  // Same badge-color trick as StoryCard, for visual continuity.
  const categoryClass = story.category.toLowerCase().replace(/\s+/g, '-')

  return (
    <article className="story-page">
      {/* ---------- Section A: story overview ---------- */}
      <section className="story-hero story-section">
        <div className="story-hero-meta">
          <span className={`category-badge category-badge--${categoryClass}`}>
            {story.category}
          </span>
          <span className="story-hero-date">Last updated {story.latestUpdateDate}</span>
          {story.isDemo ? <span className="demo-tag">Demo story</span> : null}
        </div>

        <h1 className="story-hero-title">{story.title}</h1>
        <p className="story-hero-summary">{story.summary}</p>
      </section>

      {/* ---------- Section B: unified claim ledger ---------- */}
      <section className="story-section">
        <h2 className="story-section-heading">Unified Claim Ledger</h2>
        <ClaimLedger ledger={story.claimLedger} sources={story.sources} />
      </section>

      {/* ---------- Section C: timeline + unresolved questions ---------- */}
      <section className="story-section">
        <h2 className="story-section-heading">Timeline &amp; open questions</h2>
        <div className="story-columns">
          <div className="story-column">
            <Timeline events={story.timeline} sources={story.sources} />
          </div>
          <div className="story-column">
            <EvidenceGaps gaps={story.evidenceGaps} />
          </div>
        </div>
      </section>

      {/* ---------- Section D: news articles and sources ---------- */}
      <section className="story-section">
        <h2 className="story-section-heading">News articles &amp; sources</h2>

        {/**
         * LIVE coverage comes from the story's REAL topic area (mapped via
         * its category), never from fictional story names. CivicTrace
         * deliberately draws NO claims, classifications or conclusions from
         * this feed — headline-only data; that analysis is a later phase.
         */}
        <GdeltNewsPanel
          query={getTopicQueryForCategory(story.category)}
          heading="Live reporting via GDELT (last 7 days)"
 />

        {/* The fictional prototype sources remain, clearly archived. */}
        <details className="demo-archive">
          <summary>Demonstration source cards (fictional prototype data)</summary>
          <ArticleList sources={story.sources} variant="demo" />
        </details>
      </section>

      <Link to="/" className="story-back-link">
        ← Back to all stories
      </Link>
    </article>
  )
}
