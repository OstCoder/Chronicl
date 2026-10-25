import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import useLiveStories from '../hooks/useLiveStories'
import { useLiveStorySources } from '../hooks/useLiveStorySources'
import { ensureCategoryHeadlines } from '../services/liveStoriesStore'
import { StoryGridSkeleton } from './StoryCardSkeleton'
import type { ArticleGroup, NewsSource } from '../types'
import type { StoryCategory } from '../types'

interface LiveStoriesSectionProps {
  selectedCategory: StoryCategory | null
}

/**
 * The live stories flow — ONE load, ALL topics, NO user-side loading:
 *
 *   mount -> the store fetches EVERY topic from BOTH sources (primary
 *   source alternates automatically per topic; a throttled source is
 *   auto-rebalanced onto the surviving one) -> ONE Groq grouping over the
 *   merged payload -> story title cards.
 *
 * The sidebar topic buttons are pure client-side filters over this
 * dataset (each group renders under its AI-assigned category) — instant,
 * with no network activity.
 */
export default function LiveStoriesSection({
  selectedCategory,
}: LiveStoriesSectionProps) {
  const { status, groups, grouping, retry, feed } = useLiveStories()
  // Shared feed->sources mapping (also used by the story page's
  // cache-recovery path, so IDs line up between the two views).
  const { articles, sources } = useLiveStorySources()

  // Filter guarantee, tier 3's backstop: when the selected filter has ZERO
  // headlines in the payload at all, ask the store to dial that category's
  // GDELT query once (GNews fallback) and merge the result in. Local note
  // state only mirrors "a top-up is pending"; the headlines themselves
  // arrive through the store's normal notification.
  const payloadHasCategory = useMemo(
    () =>
      selectedCategory !== null &&
      articles.some((article) => article.topicCategory === selectedCategory),
    [articles, selectedCategory],
  )
  // Both top-up sources refusing lands an honest note in feed.errors —
  // use it to swap the "fetching" note for an honest failed one instead
  // of showing "pulling…" forever.
  const topUpFailed = useMemo(
    () =>
      selectedCategory !== null &&
      (feed?.errors ?? []).some((entry) =>
        entry.startsWith(`Filter top-up (${selectedCategory})`),
      ),
    [feed, selectedCategory],
  )
  // DERIVED, not stored: pending simply means "this filter would be blank,
  // and its top-up hasn't succeeded or failed yet". No effect-side setState
  // (react-hooks/set-state-in-effect), and the note can never desync from
  // the real payload state after re-renders.
  const topUpPending =
    selectedCategory !== null && !payloadHasCategory && !topUpFailed
      ? selectedCategory
      : null
  useEffect(() => {
    if (selectedCategory === null || payloadHasCategory || topUpFailed) {
      return
    }
    ensureCategoryHeadlines(selectedCategory)
  }, [selectedCategory, payloadHasCategory, topUpFailed])

  // Client-side filtering — the tabs never re-run the pipeline. Each group
  // renders under its AI-assigned primary category, with a guarantee the
  // product insists on: EVERY filter shows at least one headline. Three
  // tiers, first non-empty wins:
  //   1. storylines the AI tagged with that topic (the normal case);
  //   2. any storyline whose MEMBER ARTICLES carry that category (the AI
  //      filed one under 'Community', say, but it reports on education);
  //   3. one synthesized card over the category's own feed headlines —
  //      real headlines, newest first — so a filter is never blank even
  //      when the grouping never produced/passed a storyline for it. The
  //      card opens a simple story page listing those headlines (no
  //      timeline/keys/questions — those fields stay honestly empty).
  const filteredGroups = useMemo((): ArticleGroup[] => {
    if (selectedCategory === null) {
      return groups
    }
    const byTopic = groups.filter((group) => group.topic === selectedCategory)
    if (byTopic.length > 0) {
      return byTopic
    }
    const byMember = groups.filter((group) =>
      group.articleIds.some((id) => articles[id - 1]?.topicCategory === selectedCategory),
    )
    if (byMember.length > 0) {
      return byMember
    }
    // Tier 3 only: the payload holds headlines for this category but no
    // storyline carries any of them. Synthesize one card; the articleIds
    // follow the same 1-based payload indexing as AI groupings, so the
    // story page (and this component's image lookup) resolve unchanged.
    const articleIds = articles
      .map((article, index) => (article.topicCategory === selectedCategory ? index + 1 : 0))
      .filter((id) => id > 0)
    if (articleIds.length === 0) {
      return []
    }
    const latest = articles[articleIds[0] - 1]
    return [
      {
        title: latest.title,
        topic: selectedCategory,
        summary:
          `${articleIds.length} ${selectedCategory.toLowerCase()} headline${articleIds.length === 1 ? '' : 's'} in this load — shown ungrouped because the AI storyline grouping has not produced one here yet.`,
        articleIds,
        keyPoints: [],
        openQuestions: [],
        caseClosed: false,
        timeline: [],
      },
    ]
  }, [groups, articles, selectedCategory])

  /**
   * Card image: the first member article (of the group's 1-based
   * articleIds, indexing the feed payload — see liveStoriesStore's
   * feedsToPayload) that carries an http(s) image from its source
   * (GDELT socialimage / GNews image). Undefined = plain indigo chip.
   */
  const imageForGroup = (group: ArticleGroup): string | undefined => {
    for (const id of group.articleIds) {
      const url = articles[id - 1]?.image
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
        return url
      }
    }
    return undefined
  }

  // The page's <h1> already says "Live stories" — this section adds no
  // second heading, so the feed doesn't announce itself twice.
  return (
    <section className="live-stories">
      {status === 'loading' ? (
        <>
          {/* Skeleton headline cards (Uiverse.io Deri-Kurniawan pulse,
              remade as a card-shaped variant) while the feeds download. */}
          <StoryGridSkeleton count={6} />
        </>
      ) : null}

      {status === 'error' || status === 'empty' ? (
        <div className="gdelt-panel-note no-results">
          <p>
            {status === 'empty'
              ? 'No live articles came back for any topic in the last 7 days.'
              : 'Live feed failed to load.'}
          </p>
          <button type="button" className="filter-btn" onClick={retry}>
            Reload live stories
          </button>
        </div>
      ) : null}

      {status === 'ready' && feed !== null ? (
        <>
          {grouping?.status === 'loading' ? (
            <>
              {/* Headlines are in but not yet AI-grouped: same skeleton,
                  with a live status line so the wait reads as progress. */}
              <p className="live-stories-note">
                Grouping {articles.length} headlines into distinct storylines…
              </p>
              <StoryGridSkeleton count={6} />
            </>
          ) : null}
          {grouping && (grouping.status === 'error' || grouping.status === 'rateLimited') ? (
            <div className="gdelt-panel-note no-results">
              <p>AI grouping unavailable: {grouping.error ?? 'unknown error'}</p>
              <button type="button" className="filter-btn" onClick={retry}>
                Reload live stories
              </button>
            </div>
          ) : null}

          {filteredGroups.length > 0 ? (
            <div className="live-story-grid">
              {filteredGroups.map((group) => {
                const globalIndex = groups.indexOf(group)
                return (
                  <LiveStoryCard
                    key={`${group.topic}-${globalIndex}-${group.title}`}
                    group={group}
                    index={globalIndex}
                    sources={sources}
                    groups={groups}
                    image={imageForGroup(group)}
                  />
                )
              })}
            </div>
          ) : selectedCategory !== null && topUpFailed ? (
            // The live top-up already ran and both sources refused: keep the
            // empty filter honest instead of pretending it will fill itself.
            <div className="gdelt-panel-note no-results">
              <p>
                Nothing tagged "{selectedCategory}" came back from the live index just now —
                try again in a moment, or check All topics.
              </p>
            </div>
          ) : selectedCategory !== null && topUpPending === selectedCategory ? (
            <div className="gdelt-panel-note no-results">
              <p>
                No "{selectedCategory}" headlines in this load — pulling a few from the live
                index so this filter is never empty…
              </p>
            </div>
          ) : grouping?.status === 'success' ? (
            <div className="gdelt-panel-note no-results">
              <p>
                {selectedCategory === null
                  ? 'The AI grouping produced no storylines for this load.'
                  : `No AI-grouped storylines tagged "${selectedCategory}" in this load — All topics shows everything.`}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

interface LiveStoryCardProps {
  group: ArticleGroup
  index: number
  sources: NewsSource[]
  groups: ArticleGroup[]
  /** Article image for the chip, when any member article has one. */
  image?: string
}

/** One headline card: indigo chip (optional article image behind the
    stripes) + headline inside it, one-sentence synopsis below. */
function LiveStoryCard({ group, index, sources, groups, image }: LiveStoryCardProps) {
  return (
    <Link
      className="live-story-card"
      to={`/live-story/${index}`}
      state={{ group, groups, sources }}
    >
      <span
        className={
          image
            ? 'live-story-card-chip live-story-card-chip--image'
            : 'live-story-card-chip'
        }
      >
        {image ? (
          <img
            className="live-story-card-image"
            src={image}
            alt=""
            aria-hidden="true"
            loading="lazy"
            // Publisher image CDNs can 404/expire: degrade to plain indigo.
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
        <span className="live-story-card-stripes" aria-hidden="true" />
        <span className="live-story-card-title">{group.title}</span>
      </span>
      <span className="live-story-card-summary">{group.summary}</span>
    </Link>
  )
}