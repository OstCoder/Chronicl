import { useEffect, useState } from 'react'
import { lookupOutletBias } from '../services/mediabias'
import type { OutletBias } from '../types'

const EMPTY_MAP: Map<string, OutletBias> = new Map()

/**
 * Resolve publisher domains -> MediaBias.news ratings, keyed by domain.
 *
 * The caller passes the SAME array identity while the underlying article
 * set is unchanged (useMemo at the call site), so this effect runs once
 * per article set, not once per render. Requests are deduped inside the
 * service's module cache: five articles from one publisher cost one HTTP
 * request, and entries missing from the map render bar-less by design.
 *
 * The empty-domains case is DERIVED in render (EMPTY_MAP), not stored:
 * effects only move state from async callbacks, never synchronously.
 */
export function useOutletBiasMap(domains: string[]): Map<string, OutletBias> {
  const [map, setMap] = useState<Map<string, OutletBias>>(EMPTY_MAP)

  const resolved = domains.length === 0 ? EMPTY_MAP : map

  useEffect(() => {
    if (domains.length === 0) {
      return // the derived value above already serves an empty map
    }

    let active = true
    Promise.all(
      domains.map(async (domain) => {
        const bias = await lookupOutletBias(domain)
        return [domain, bias] as const
      }),
    ).then((entries) => {
      if (!active) {
        return
      }
      const next = new Map<string, OutletBias>()
      for (const [domain, bias] of entries) {
        if (bias) {
          next.set(domain, bias)
        }
      }
      setMap(next)
    })

    return () => {
      active = false
    }
  }, [domains])

  return resolved
}
