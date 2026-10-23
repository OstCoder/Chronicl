import { useEffect, useSyncExternalStore } from 'react'
import {
  ensurePipeline,
  getStoriesSnapshot,
  readState,
  subscribeToStories,
  type LiveStoriesState,
} from '../services/liveStoriesStore'

export type { LiveStoriesState }

/**
 * Thin React adapter over the session-level pipeline store
 * (services/liveStoriesStore.ts). There is exactly ONE pipeline now — the
 * bulk 'all' load that the whole app filters client-side — so the hook
 * takes no arguments: it triggers the pipeline once on mount and
 * re-renders on store notifications. The store itself defaults to the
 * 'all' key.
 */
export default function useLiveStories(): LiveStoriesState {
  const snapshot = useSyncExternalStore(subscribeToStories, getStoriesSnapshot)

  useEffect(() => {
    ensurePipeline()
  }, [])

  return readState(snapshot)
}
