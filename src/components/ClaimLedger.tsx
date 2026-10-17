import type { ClaimLedger as ClaimLedgerData, ClaimStatus, NewsSource } from '../types'

/**
 * Display order mirrors the thesis narrative: first what the evidence
 * supports, then where sources conflict, then what stays uncertain.
 * Groups whose claims are empty are skipped entirely (render nothing).
 */
const STATUS_GROUPS: { status: ClaimStatus; heading: string }[] = [
  { status: 'supported', heading: 'Supported by available evidence' },
  { status: 'conflicting', heading: 'Where sources conflict' },
  { status: 'uncertain', heading: 'Uncertain or unsupported' },
]

interface ClaimLedgerProps {
  /** The unified thesis + machine-readable claims, straight from the data. */
  ledger: ClaimLedgerData
  /** The story's full source list, used to resolve sourceId references. */
  sources: NewsSource[]
}

/**
 * Section B. Renders TWO layers of the SAME analysis:
 *
 *   1. `ledger.thesis`  — ONE coherent paragraph weaving together the
 *      supported, conflicting and uncertain aspects (never three separate
 *      theses). This stays the visual and rhetorical centerpiece.
 *   2. `ledger.claims`  — the same analysis broken into individual claims,
 *      each carrying its source references. This is the layer the future
 *      AI pipeline will generate per claim.
 *
 * `sourceById` turns each claim's `{ sourceId, note }` reference back into
 * the real source it points at — this lookup is exactly what the citations
 * pipeline will one day fill in automatically.
 */
export default function ClaimLedger({ ledger, sources }: ClaimLedgerProps) {
  const sourceById = new Map(sources.map((source) => [source.id, source]))

  return (
    <div className="claim-ledger">
      {/* ---------- The one coherent thesis ---------- */}
      <div className="ledger-thesis">
        <h3 className="ledger-thesis-label">Current understanding</h3>
        <p className="ledger-thesis-text">{ledger.thesis}</p>
      </div>

      {/* ---------- The same analysis, structured ---------- */}
      {STATUS_GROUPS.map(({ status, heading }) => {
        const claims = ledger.claims.filter((claim) => claim.status === status)
        if (claims.length === 0) {
          return null // skip a status with no claims — nothing to show
        }

        return (
          <div key={status} className="claim-group">
            <h4 className={`claim-group-title claim-group-title--${status}`}>
              {heading}
              <span className="claim-group-count">
                {claims.length} {claims.length === 1 ? 'claim' : 'claims'}
              </span>
            </h4>

            {claims.map((claim) => (
              <div key={claim.id} className="claim-card">
                <p className="claim-statement">{claim.statement}</p>
                {claim.sourceRefs.length > 0 ? (
                  <ul className="claim-sources">
                    {claim.sourceRefs.map((ref) => {
                      const source = sourceById.get(ref.sourceId)
                      if (!source) {
                        // A dangling reference is a data-quality issue, not a
                        // UI crash — the claim simply renders without it.
                        return null
                      }
                      return (
                        <li key={`${ref.sourceId}-${ref.note ?? ''}`}>
                          <span className="claim-source-publisher">{source.publisher}</span>
                          {ref.note ? <span> — {ref.note}</span> : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
