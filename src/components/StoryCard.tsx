import { Link } from 'react-router-dom'
import type { Story } from '../types'

/**
 * One story summary card on the homepage.
 *
 * - The WHOLE card is a <Link>, so clicking anywhere navigates to
 *   /story/:slug (the route itself arrives in Stage 4–5).
 * - `key={story.id}` in HomePage lets React match cards across renders.
 */
export default function StoryCard({ story }: { story: Story }) {
  // "Local Development" -> "local-development", safe for CSS class names.
  const categoryClass = story.category.toLowerCase().replace(/\s+/g, '-')

  return (
    <Link to={`/story/${story.slug}`} className="story-card">
      <div className="story-card-top">
        <span className={`category-badge category-badge--${categoryClass}`}>
          {story.category}
        </span>
        <span className="story-card-date">Updated {story.latestUpdateDate}</span>
      </div>

      <h2 className="story-card-title">{story.title}</h2>
      <p className="story-card-desc">{story.homepageDescription}</p>

      <div className="story-card-meta">
        {/* Source count is DERIVED from the data, never stored twice. */}
        <span>{story.sources.length} sources</span>
        <span className="demo-tag">Demo story</span>
      </div>
    </Link>
  )
}
