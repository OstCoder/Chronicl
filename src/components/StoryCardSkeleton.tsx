/**
 * Skeletal stand-in for a live-story card, shown while headlines are
 * loading or while the AI groups them into storylines.
 *
 * Layout-copy of the real .live-story-card (see index.css) so the swap
 * from skeleton to real card doesn't shift the grid: avatar circle on the
 * left (where the topic badge sits) + two text bars (outlets/title rows).
 *
 * The pulse animation is plain CSS (index.css) — a port of the Uiverse.io
 * snippet by Deri-Kurniawan ("animate-pulse bg-gray-300" chips), no
 * Tailwind needed.
 */
export function StoryCardSkeleton() {
  return (
    <div className="story-skeleton" aria-hidden="true">
      <div className="sk-row">
        <div className="sk-avatar" />
        <div className="sk-col">
          <div className="sk-bar sk-bar--sm" />
          <div className="sk-bar sk-bar--md" />
        </div>
      </div>
      <div className="sk-bar sk-bar--lg" />
      <div className="sk-bar sk-bar--xl" />
    </div>
  )
}

/**
 * A set of skeletons sized to fill the story grid while it loads.
 * One element per grid column, so the aspect matches the real cards.
 */
export function StoryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="live-story-grid">
      {Array.from({ length: count }, (_, i) => (
        <StoryCardSkeleton key={i} />
      ))}
    </div>
  )
}
