import { Link, useParams } from 'react-router-dom'
import StoryPage from '../components/StoryPage'
import { stories } from '../data/stories'

/**
 * The ROUTE-LEVEL view for /story/:slug.
 *
 * Its only job: pull data out of the world (URL params + the stories array)
 * and hand a plain story object to the presentation component. That split
 * matters later: StoryPage won't care whether its story came from this
 * lookup, a search result, or (eventually) an API/AI pipeline.
 */
export default function StoryPageView() {
  /**
   * `useParams` reads the dynamic parts of the current URL. Our route is
   * declared as "story/:slug", so any URL like /story/foo lands here with
   * params.slug === 'foo'. Type-wise it may be absent (defensive), so we
   * treat it as optional.
   */
  const { slug } = useParams()

  // Derived lookup — recomputed whenever the slug changes. Nothing is
  // stored in useState because the source of truth is the URL itself.
  const story = typeof slug === 'string' ? stories.find((s) => s.slug === slug) : undefined

  if (!story) {
    // Unknown or missing slug: never crash, never render an empty page.
    return (
      <div className="not-found">
        <h1>Story not found</h1>
        <p>
          No story exists at this address. It may have been renamed, or this
          might be a placeholder route from an earlier build stage.
        </p>
        <Link to="/" className="not-found-link">
          ← Back to all stories
        </Link>
      </div>
    )
  }

  return <StoryPage story={story} />
}
