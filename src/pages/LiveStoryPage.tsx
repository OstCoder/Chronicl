import { Link, useLocation, useParams } from 'react-router-dom'
import ArticleList from '../components/ArticleList'
import Timeline from '../components/Timeline'
import useLiveStories from '../hooks/useLiveStories'
import { useLiveStorySources } from '../hooks/useLiveStorySources'
import type { ArticleGroup, NewsSource, TimelineEvent } from '../types'

interface LiveStoryNavigation {
  state: {
    group: ArticleGroup
    groups?: ArticleGroup[]
    sources: NewsSource[]
  } | null
}

/**
 * The story detail page: the Bento card arrangement from the spec,
 * themed to the app's regular WHITE palette (per the user request).
 *
 *   ┌────────────────────────────────────────────┐
 *   │ Story overview — title + summary           │
 *   ├────────────────────────────────────────────┤
 *   │ Timeline (events)                          │
 *   ├────────────────────────────────────────────┤
 *   │ What we still don't know                   │
 *   ├────────────────────────────────────────────┤
 *   │ News articles and official sources         │
 *   └────────────────────────────────────────────┘
 *
 * Data arrives two ways: navigation state from the clicked card (instant),
 * or recovery from the pipeline store's cached feed (refresh/deep link).
 * Only when BOTH are empty does the expired message show.
 */
export default function LiveStoryPage() {
  const { groupId } = useParams()
  const { state } = useLocation() as unknown as LiveStoryNavigation
  const { groups: cachedGroups } = useLiveStories()
  const { sources: cachedSources } = useLiveStorySources()

  // --- Resolve group + sources ------------------------------------------
  let group: ArticleGroup | undefined = state?.group
  let sources: NewsSource[] = state?.sources ?? []

  if (!group) {
    // Recovery path: the URL carries the group's index into the cached
    // grouping (cards link as /live-story/<globalIndex>).
    const index = Number.parseInt(groupId ?? '', 10)
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < cachedGroups.length &&
      cachedSources.length > 0
    ) {
      group = cachedGroups[index]
      sources = cachedSources
    }
  }

  if (!group) {
    return (
      <div className="placeholder-page">
        <h1>This live story link expired</h1>
        <p>
          Live storylines are built fresh in your browser session. Go to the
          feed and click a story title again.
        </p>
        <Link to="/app" className="story-back-link">
          ← Back to all stories
        </Link>
      </div>
    )
  }

  // RELEVANT ONLY: everything this page shows — range, outlets, timeline,
  // article list — comes from the group's OWN member articles. The full
  // `sources` array is only the id -> source lookup table (group.articleIds
  // are 1-based positions into the feed payload, see liveStoriesStore).
  const memberSources = group.articleIds
    .map((id) => sources[id - 1])
    .filter(Boolean)

  const outlets = new Set(memberSources.map((source) => source.publisher))
  // Coverage range header: the span of all member articles' publication
  // dates (what the news list below covers) — independent of how many
  // events the timeline flags.
  const dates = memberSources.map((source) => source.publicationDate).filter(Boolean).sort()
  const range =
    dates.length > 0
      ? dates[0] === dates[dates.length - 1]
        ? dates[0]
        : `${dates[0]} – ${dates[dates.length - 1]}`
      : 'undated'

  // EVENT-BASED timeline, NOT date-based: every node IS a distinct event
  // from the AI grouping (whose entries are validated to a real member
  // article's date). Two events that happened on the SAME day get their
  // own dots; a day where nothing new happened gets NO dot — the range
  // above still reports the full coverage span, so the timeline stays
  // additive-fact only, never padded to fill dates. caseClosed comes
  // from the grouping; it decides whether the timeline's connector line
  // runs through every node (open story), or stops at the final dot
  // (resolved story).
  const seenEventKeys = new Set<string>()
  const timelineEvents: TimelineEvent[] = [...group.timeline]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((entry) => {
      // Drop exact duplicate events (same day + same label): model noise,
      // not a second event. Also refuse any entry whose date is not a real
      // YYYY-MM-DD day — the grouping validates this too, but a malformed
      // date here would render as "Invalid Date" on the timeline.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        return false
      }
      const key = `${entry.date}|${entry.label}`
      if (seenEventKeys.has(key)) {
        return false
      }
      seenEventKeys.add(key)
      return true
    })
    .map((entry, index) => ({
      id: `gt-${groupId}-${index}`,
      date: entry.date,
      title: entry.label,
      // The grouping's per-day note (schema-validated as a string, but an
      // older persisted cache can hold entries without it): render an empty
      // description rather than "undefined". Timeline sorts and dedupes by
      // date which stays intact.
      description:
        typeof entry.description === 'string' ? entry.description : '',
      sourceRefs: entry.articleIds
        .map((id) => sources[id - 1])
        .filter(Boolean)
        .map((source) => ({ sourceId: source.id })),
    }))

  return (
    <article className="story-page story-page--bento">
      {/* Row 1: full-width overview */}
      <section className="story-bento story-bento--overview">
        <div className="story-bento-meta">
          <span className="category-badge category-badge--live">Live story</span>
          <span className="story-bento-range">{range}</span>
        </div>
        <h1 className="story-bento-title">{group.title}</h1>
        <p className="story-bento-summary">{group.summary}</p>

        {/* Key points: the storyline's one-line takeaways, as quiet pills
            under the summary. Rendered only when the grouping produced
            them — an empty list shows nothing, no dead heading. */}
        {group.keyPoints.length > 0 ? (
          <ul className="story-key-points">
            {group.keyPoints.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Row 2: full-width timeline — "What we still don't know" moved
          BELOW the timeline (full width) per product request. */}
      <section className="story-bento story-bento--timeline">
        <div className="story-bento-head">
          <span className="story-bento-side">
            {outlets.size} outlet{outlets.size === 1 ? '' : 's'} tracked
          </span>
          <h2 className="story-bento-heading">Timeline</h2>
        </div>
        {timelineEvents.length > 0 ? (
          <Timeline
            events={timelineEvents}
            sources={memberSources}
            caseClosed={group.caseClosed}
          />
        ) : (
          <p className="story-bento-empty">No date-backed timeline entries for this storyline.</p>
        )}
      </section>

      <section className="story-bento story-bento--questions">
        <h2 className="story-bento-heading">What we still don't know</h2>
        {group.openQuestions.length > 0 ? (
          <ul className="story-questions">
            {group.openQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        ) : group.caseClosed ? (
          <p className="story-bento-empty">This case is closed — no open questions recorded.</p>
        ) : (
          <p className="story-bento-empty">No open questions for this storyline yet.</p>
        )}
      </section>

      {/* Row 3: full-width sources */}
      <section className="story-bento story-bento--sources">
        <h2 className="story-bento-heading">
          News articles and official sources ({memberSources.length})
        </h2>
        <ArticleList sources={memberSources} />
      </section>

      <Link to="/app" className="story-back-link story-back-link--bento">
        ← Back to all stories
      </Link>
    </article>
  )
}
