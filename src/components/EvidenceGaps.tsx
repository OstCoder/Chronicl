import type { EvidenceGap } from '../types'

/**
 * Section C, RIGHT column: questions, NOT facts.
 *
 * The design deliberately makes each entry LOOK like a question — a circled
 * "?" marker and question-mark-driven phrasing — so no reader can mistake
 * an open gap for an established finding. This is CivicTrace's honesty
 * layer: what we don't know is displayed as prominently as what we do.
 */
export default function EvidenceGaps({ gaps }: { gaps: EvidenceGap[] }) {
  return (
    <div className="evidence-gaps">
      <p className="evidence-gaps-note">
        These are open questions — not established facts.
      </p>

      <ul className="gap-list">
        {gaps.map((gap) => (
          <li key={gap.id} className="gap-item">
            <span className="gap-mark" aria-hidden="true">
              ?
            </span>
            <div className="gap-body">
              <p className="gap-question">{gap.question}</p>
              {gap.context ? <p className="gap-context">{gap.context}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
