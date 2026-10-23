import { formatDate } from '../utils/dates'
import type { NewsSource, TimelineEvent } from '../types'

interface TimelineProps {
  /** The story's timeline events, in whatever order they appear in data. */
  events: TimelineEvent[]
  /** The story's sources, for resolving SourceRef ids to publishers. */
  sources: NewsSource[]
  /**
   * Whether the storyline has reached a final resolution (AI-assessed).
   * The connector line runs through every node in both cases, and the
   * LAST node always pulses as "where the story is now" — CLOSED story
   * (true) only swaps that node's solid dot for a hollow terminator ring.
   */
  caseClosed?: boolean
}

/**
 * Section C, LEFT column: a HORIZONTAL timeline in strict chronological
 * order. Each event renders as a sub-card under its dot; CSS draws ONE
 * continuous connector line above the cards with line on BOTH sides of
 * every node at all times (open or closed). The LAST node is always the
 * "current" one: it keeps the pulsing halo, and a closed case only adds
 * a hollow terminator ring around it.
 */
export default function Timeline({ events, sources, caseClosed = false }: TimelineProps) {
  const sourceById = new Map(sources.map((source) => [source.id, source]))

  // Sort a COPY — props are read-only by convention, and [...events]
  // guarantees we never reorder the caller's array.
  const chronological = [...events].sort((a, b) => a.date.localeCompare(b.date))
  const lastIndex = chronological.length - 1

  return (
    <ol className={`timeline${caseClosed ? ' timeline--closed' : ''}`}>
      {chronological.map((event, index) => {
        const isLast = index === lastIndex
        // The LAST item is always the story's present moment: it pulses so
        // the reader can see where the story currently stands, and a closed
        // case additionally wraps that pulse in a hollow terminator ring.
        const itemClass = `timeline-item${isLast && caseClosed ? ' timeline-item--final-closed timeline-item--current' : isLast ? ' timeline-item--current' : ''}`
        return (
          <li key={event.id} className={itemClass}>
            {/* The last item is the story's present moment — a pulsing
                halo spans behind its dot on EVERY story (open or closed; a
                dedicated span because the item's ::after pseudo already
                draws the connector). */}
            {isLast ? (
              <span className="timeline-now-halo" aria-hidden="true" />
            ) : null}
            <time className="timeline-date" dateTime={event.date}>
              {formatDate(event.date)}
            </time>
            <h3 className="timeline-event-title">{event.title}</h3>
            <p className="timeline-event-desc">{event.description}</p>

            {event.sourceRefs.length > 0 ? (
              <ul className="event-sources">
                {event.sourceRefs.map((ref) => {
                  const source = sourceById.get(ref.sourceId)
                  if (!source) {
                    return null // same dangling-reference policy as ClaimLedger
                  }
                  return (
                    <li key={`${ref.sourceId}-${ref.note ?? ''}`}>
                      <span className="event-source-publisher">{source.publisher}</span>
                      {ref.note ? <span> — {ref.note}</span> : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}

            {isLast && caseClosed ? <span className="timeline-closed-tag">Case closed</span> : null}
          </li>
        )
      })}
    </ol>
  )
}
