/**
 * CivicTrace shared type definitions.
 * These interfaces describe the shape of EVERY story object in the app,
 * whether it comes from the mock data in src/data/ or, eventually, from
 * a real news/records API or AI analysis pipeline.
 *
 * NOTE: this project uses `verbatimModuleSyntax`, so when a component
 * only needs a *type* it must import it as:
 *   import type { Story } from '../types'
 */

/** The five homepage filter categories (Sidebar). */
export type StoryCategory =
  | 'Local Development'
  | 'Education'
  | 'Technology'
  | 'Environment'
  | 'Community'

/**
 * How a claim relates to the story's unified thesis. This is metadata on ONE
 * coherent ledger — not three separate theses.
 */
export type ClaimStatus = 'supported' | 'conflicting' | 'uncertain'

/**
 * A pointer from a claim (or timeline event) to a source in the story's
 * `sources` array. Keeping references small and id-based means the future
 * AI pipeline can attach evidence without rewriting any data structure.
 */
export interface SourceRef {
  sourceId: string
  /** Optional short note, e.g. "gives the 1.8M sq ft figure". */
  note?: string
}

/** One article or official record. Demo data always uses placeholder URLs. */
export interface NewsSource {
  id: string
  title: string
  publisher: string
  /** ISO date string, 'YYYY-MM-DD'. */
  publicationDate: string
  shortDescription: string
  /** Placeholder while data is fictional; replaced with verified links later. */
  url: string
  /**
   * OPTIONAL contextual metadata about the publisher's general leaning.
   * This is NOT a measure of factual accuracy and articles are never
   * ranked or sorted by it.
   */
  biasRating?: string
  /** True while the entry is fictional demonstration data. */
  isDemo: boolean
}

/** One claim in the unified ledger. */
export interface Claim {
  id: string
  /** Where this claim sits in the overall analysis. */
  status: ClaimStatus
  /** The claim itself, written neutrally. */
  statement: string
  /** Sources that support or conflict with this claim. */
  sourceRefs: SourceRef[]
}

/**
 * Section B of the story page: ONE unified thesis plus the
 * machine-readable claims behind it.
 */
export interface ClaimLedger {
  /**
   * A single coherent paragraph that incorporates what evidence supports,
   * where sources conflict, and what remains uncertain.
   */
  thesis: string
  claims: Claim[]
}

/** Section C (left column): one entry on the vertical timeline. */
export interface TimelineEvent {
  id: string
  /** ISO date string; the Timeline sorts events by this. */
  date: string
  title: string
  description: string
  sourceRefs: SourceRef[]
}

/**
 * Section C (right column): a question or gap — deliberately phrased as a
 * QUESTION, never as an established fact.
 */
export interface EvidenceGap {
  id: string
  question: string
  /** Why it matters, or what evidence would answer it. Optional. */
  context?: string
}

/** A complete story: everything the homepage and story page need. */
export interface Story {
  id: string
  /** Used in the route /story/:slug — must be unique, lowercase, hyphenated. */
  slug: string
  title: string
  category: StoryCategory
  /** Short neutral summary shown at the top of the story page. */
  summary: string
  /** Shorter description shown on the homepage StoryCard. */
  homepageDescription: string
  /** Extra search terms matched in addition to the title. */
  keywords: string[]
  /** ISO date of the most recent update in `timeline`. */
  latestUpdateDate: string
  claimLedger: ClaimLedger
  timeline: TimelineEvent[]
  evidenceGaps: EvidenceGap[]
  sources: NewsSource[]
  /** Shown prominently until real data replaces mock data. */
  isDemo: boolean
}
