import type { NewsSource } from '../types'

/**
 * FALLBACK-ONLY demo articles, used exclusively when the live GDELT request
 * is rate-limited (HTTP 429) or unreachable, so the validation harness keeps
 * demonstrating its layout instead of an empty panel.
 *
 * Every entry is fictional with an example.org placeholder URL and
 * isDemo: true, so the UI labels them exactly like all other demo content.
 * They are NEVER shown when real results come back.
 */
export const DEMO_NEWS_FALLBACK: NewsSource[] = [
  {
    id: 'demo-fallback-1',
    title: '[DEMO] Facility expansion proposal reaches county planning board',
    publisher: 'example.org',
    publicationDate: '2026-10-16',
    shortDescription: 'English · United States — sample layout article, not real coverage',
    url: 'https://example.org/demo/gdelt-fallback-1',
    isDemo: true,
  },
  {
    id: 'demo-fallback-2',
    title: '[DEMO] Utility briefing weighs grid capacity for new campuses',
    publisher: 'example.org',
    publicationDate: '2026-10-15',
    shortDescription: 'English · United States — sample layout article, not real coverage',
    url: 'https://example.org/demo/gdelt-fallback-2',
    isDemo: true,
  },
  {
    id: 'demo-fallback-3',
    title: '[DEMO] Council session reviews infrastructure funding options',
    publisher: 'example.org',
    publicationDate: '2026-10-14',
    shortDescription: 'English · United States — sample layout article, not real coverage',
    url: 'https://example.org/demo/gdelt-fallback-3',
    isDemo: true,
  },
  {
    id: 'demo-fallback-4',
    title: '[DEMO] School district survey closes ahead of policy vote',
    publisher: 'example.org',
    publicationDate: '2026-10-13',
    shortDescription: 'English · United States — sample layout article, not real coverage',
    url: 'https://example.org/demo/gdelt-fallback-4',
    isDemo: true,
  },
  {
    id: 'demo-fallback-5',
    title: '[DEMO] Regional transit study opens public comment window',
    publisher: 'example.org',
    publicationDate: '2026-10-12',
    shortDescription: 'English · United States — sample layout article, not real coverage',
    url: 'https://example.org/demo/gdelt-fallback-5',
    isDemo: true,
  },
]
