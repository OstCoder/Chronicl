import type { OutletBias } from '../types'

/**
 * The left-right bar for one article's publisher.
 *
 * Contract as adjusted by product decision (previously one dot PER rater):
 *   - ONE indicator on the track, positioned at the ratings' location: a
 *     right-leaning rating puts it on the right, a centre rating at the
 *     centre, a left-leaning rating on the left. Where raters disagree,
 *     it sits at the midpoint of their positions and the tooltip still
 *     names each rater's verdict, so no flattening is claimed — the
 *     named, checkable detail keeps the provenance (hover, not ink).
 *   - The caption no longer lists "Rater: verdict" strings; attribution
 *     stays as the canonical MediaBias.news link, which the citation
 *     contract requires to be reachable from the bar.
 *   - Purely contextual metadata: nothing is ranked, sorted or scored by it.
 *
 * Visual presentation: the HORIZONTAL track from before (left → centre →
 * right, soft gradient), but the indicator is a small GLASS CIRCLE — a
 * frosted bead with a dark centre pin onto which it sits. The glass is
 * applied to that knob ONLY, and it is deliberately more opaque than
 * transparent so it keeps contrast over the colored track.
 *
 * No lookup happens here — this is presentational only.
 */
export default function BiasBar({ bias }: { bias: OutletBias }) {
  const reviews = bias.reviews
  // The knob's spot: the mean of the rater positions (0 = far left,
  // 100 = far right); a single rating lands there exactly, disagreements
  // sit between them. 50 keeps the bar honest if reviews are somehow empty.
  const position =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.position, 0) / reviews.length
      : 50
  // Provenance without the caption clutter: named raters + verdicts live
  // in the hover title, not on the page.
  const title =
    reviews.length > 0
      ? reviews.map((review) => `${review.rater}: ${review.verdict}`).join(' · ')
      : 'Political leaning of this outlet'

  return (
    <div className="bias-bar">
      <div
        className="bias-bar-track"
        role="img"
        aria-label="Political leaning of this outlet, as rated by third-party raters"
      >
        <span className="bias-bar-endpoint bias-bar-endpoint--left">left</span>
        <span className="bias-bar-endpoint bias-bar-endpoint--centre">centre</span>
        <span className="bias-bar-endpoint bias-bar-endpoint--right">right</span>
        {/*
          The glass circular indicator: a frosted bead (CSS in index.css)
          riding the gradient track, with a dark centre pin so the exact
          spot stays readable. The whole bead carries the rater tooltip.
        */}
        <span
          className="bias-bar-knob"
          style={{ left: `${position}%` }}
          title={title}
        >
          <span className="bias-bar-knob-pin" aria-hidden="true" />
        </span>
      </div>
      <p className="bias-bar-caption">
        outlet ratings via{' '}
        <a href={bias.canonicalUrl} target="_blank" rel="noopener noreferrer">
          MediaBias.news
        </a>
      </p>
    </div>
  )
}
