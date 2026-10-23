import { TOPIC_CATEGORIES } from '../data/topicGroups'
import type { StoryCategory } from '../types'

/**
 * Sidebar = the app's ONLY filter surface, wired to the LIVE pipeline.
 * The search box is gone (product decision): the topic buttons are the
 * only control, and they are pure client-side filters over the one
 * auto-loaded dataset — instant, with no network activity.
 */
interface SidebarProps {
  selectedCategory: StoryCategory | null
  onSelectCategory: (category: StoryCategory | null) => void
}

export default function Sidebar({
  selectedCategory,
  onSelectCategory,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <h2 className="sidebar-heading">Filters</h2>
      <div className="sidebar-filters">
        {/* "All topics" clears the topic filter entirely. */}
        <button
          type="button"
          className={
            selectedCategory === null ? 'filter-btn filter-btn--active' : 'filter-btn'
          }
          onClick={() => onSelectCategory(null)}
        >
          All topics
        </button>
        {TOPIC_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={
              selectedCategory === category ? 'filter-btn filter-btn--active' : 'filter-btn'
            }
            onClick={() => onSelectCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>
    </aside>
  )
}
