import { STORY_CATEGORIES } from '../data/stories'
import type { StoryCategory } from '../types'

/**
 * Props are the component's input contract. Sidebar never touches the
 * stories array or decides filtering itself — it only REPORTS what the
 * user picked upward through these callbacks. That keeps it reusable
 * (same component would work on any list page).
 */
interface SidebarProps {
  selectedCategory: StoryCategory | null
  onSelectCategory: (category: StoryCategory | null) => void
  searchTerm: string
  onSearchChange: (term: string) => void
}

export default function Sidebar({
  selectedCategory,
  onSelectCategory,
  searchTerm,
  onSearchChange,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <h2 className="sidebar-heading">Search</h2>
      {/*
        A CONTROLLED input: its value comes from React state and every
        keystroke calls back up with the new value. The homepage owns the
        state, so filtering and this box can never disagree.
      */}
      <input
        type="search"
        className="sidebar-search"
        placeholder="Search stories…"
        value={searchTerm}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      <h2 className="sidebar-heading">Topics</h2>
      <div className="sidebar-filters">
        {/* "All stories" clears the category filter entirely. */}
        <button
          type="button"
          className={
            selectedCategory === null ? 'filter-btn filter-btn--active' : 'filter-btn'
          }
          onClick={() => onSelectCategory(null)}
        >
          All stories
        </button>
        {STORY_CATEGORIES.map((category) => (
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

      <p className="sidebar-note">
        All content in this build is fictional demonstration data.
      </p>
    </aside>
  )
}
