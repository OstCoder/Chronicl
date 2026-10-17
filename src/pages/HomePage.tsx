import { useMemo, useState } from 'react'
import GdeltNewsPanel from '../components/GdeltNewsPanel'
import Sidebar from '../components/Sidebar'
import StoryCard from '../components/StoryCard'
import TopicGroupSelector from '../components/TopicGroupSelector'
import { TOPIC_GROUPS } from '../data/topicGroups'
import { stories } from '../data/stories'
import type { StoryCategory } from '../types'

/**
 * The homepage OWNS the filter state. Why not in Sidebar?
 * Because filtering needs BOTH values combined (category + search), and
 * both must come from one source of truth. Sidebar just reports user input
 * upward; HomePage decides which stories are visible — one-way data flow.
 */
export default function HomePage() {
  // null means "show every category".
  const [selectedCategory, setSelectedCategory] = useState<StoryCategory | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  // Live-news query selection: defaults to the first REAL topic group, so
  // the validation harness shows working results on first load.
  const [selectedTopicId, setSelectedTopicId] = useState<string>(TOPIC_GROUPS[0]?.id ?? '')

  /**
   * `useMemo` recomputes the filtered list only when a dependency changes,
   * instead of on every render. The result is DERIVED state — we never
   * store a filtered copy in useState, because that would create two
   * lists that can drift apart.
   */
  const visibleStories = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return stories.filter((story) => {
      // Category filter: null (all) or exact match.
      const matchesCategory =
        selectedCategory === null || story.category === selectedCategory
      if (!matchesCategory) {
        return false
      }
      // Search filter: true when the box is empty, otherwise the term must
      // appear in the title, description, category or keywords.
      if (term === '') {
        return true
      }
      const haystack = [
        story.title,
        story.homepageDescription,
        story.category,
        ...story.keywords,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [searchTerm, selectedCategory])

  /**
   * Live-news query priority: an explicit search term wins; otherwise the
   * selected REAL topic group drives GDELT. Fictional story keywords are
   * never used — they cannot return real coverage.
   */
  const activeTopic = TOPIC_GROUPS.find((group) => group.id === selectedTopicId)
  const liveQuery = searchTerm.trim() ? searchTerm.trim() : activeTopic?.gdeltQuery ?? ''

  return (
    <div className="home-layout">
      <Sidebar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <section className="home-main">
        <h1 className="home-heading">Local story histories</h1>
        <p className="home-sub">
          How Northern Virginia stories evolved, what the evidence supports, where
          sources disagree, and what remains unanswered.
        </p>

        <p className="home-count">
          Showing {visibleStories.length} of {stories.length} stories
        </p>

        <div className="story-grid">
          {visibleStories.map((story) => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>

        {visibleStories.length === 0 ? (
          <p className="no-results">
            No stories match that search — try a different term or topic.
          </p>
        ) : null}

        <TopicGroupSelector selectedId={selectedTopicId} onSelect={setSelectedTopicId} />

        {/**
         * Live news panel: the SAME liveQuery feeds GDELT — a search term
         * verbatim, otherwise the selected real topic group. This is the
         * validation harness; fictional story data never enters this path.
         */}
        <GdeltNewsPanel
          query={liveQuery}
          heading="Live reporting via GDELT (last 7 days)"
 />
      </section>
    </div>
  )
}
