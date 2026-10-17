import { formatDate } from '../utils/dates'
import type { NewsSource, TimelineEvent } from '../types'

interface TimelineProps {
  /** The story's timeline events, in whatever order they appear in data. */
  events: TimelineEvent[]
  /** The story's sources, for resolving SourceRef ids to publishers. */
  sources: NewsSource[]
}

/**
 * Section C, LEFT column: a vertical timeline in strict chronological
 * order. CSS draws the line + dots, so the data stays plain.
 */
export default function Timeline({ events, sources }: TimelineProps) {
  const sourceById = new Map(sources.map((source) => [source.id, source]))

  // Sort a COPY — props are read-only by convention, and [...events]
  // guarantees we never reorder the caller's array.
  const chronological = [...events].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <ol className="timeline">
      {chronological.map((event) => (
        <li key={event.id} className="timeline-item">
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
        </li>
      ))}
    </ol>
  )
}
