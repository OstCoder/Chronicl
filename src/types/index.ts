/**
 * Chronicl shared type definitions.
 *
 * This app is now LIVE-FIRST: real headlines (GDELT + GNews) are grouped
 * into AI-suggested storylines; there are no pre-authored demo stories.
 * The interfaces below describe exactly what the live pipeline produces
 * and renders — and what a later claim-analysis phase can build on.
 *
 * NOTE: this project uses `verbatimModuleSyntax`, so when a component
 * only needs a *type* it must import it as:
 *   import type { NewsSource } from '../types'
 */

/** The five homepage filter categories (Sidebar); they map to topic queries. */
export type StoryCategory =
  | 'Local Development'
  | 'Education'
  | 'Technology'
  | 'Environment'
  | 'Community'

/**
 * One entry of an AI-suggested storyline timeline. The date MUST come from
 * one of the group's articles (the service validates this); the label is
 * that day's reporting contribution, phrased neutrally by the model.
 */
export interface GroupTimelineEntry {
  date: string
  label: string
  /**
   * 1-2 factual sentences describing the day's development, generated from
   * the member headlines only (the grouping validates dates and ids; it
   * never invents events or dates).
   */
  description: string
  articleIds: number[]
}

/**
 * One AI-suggested story cluster from the Groq grouping feature.
 * Boundaries stated explicitly: this is a machine SUGGESTION about how
 * headlines relate, not a claim, classification or fact-check — the
 * existing boundary (AI never speaks to the Claim Ledger) stays intact.
 * The timeline and keyPoints exist to display the cluster as a story page;
 * they are generated from the headline payload only.
 */
export interface ArticleGroup {
  title: string
  /** The model's assigned primary subject — one of the StoryCategory labels. */
  topic: StoryCategory
  summary: string
  /** 1-based positions in the article payload sent to the model. */
  articleIds: number[]
  /** What the storyline's coverage establishes / conflicts on / leaves open. */
  keyPoints: string[]
  /** "What we still don't know": 2-4 neutral open questions per storyline. */
  openQuestions: string[]
  /**
   * True ONLY when the latest dated reporting in the model's view shows a
   * final resolution. Drives the timeline connector: an open story draws a
   * continuous line to the last node; a closed one stops at the dot.
   */
  caseClosed: boolean
  /** Chronological storyline skeleton; dates come from member articles. */
  timeline: GroupTimelineEntry[]
}

/**
 * A pointer from a timeline entry to a source. Ids resolve against the
 * storyline's `sources` array so timeline source links stay clickable.
 */
export interface SourceRef {
  sourceId: string
  /** Optional short note, e.g. "gives the 1.8M sq ft figure". */
  note?: string
}

/** One live article attached to a storyline (publisher-domain-level data). */
export interface NewsSource {
  id: string
  title: string
  publisher: string
  /** ISO date string, 'YYYY-MM-DD'. */
  publicationDate: string
  shortDescription: string
  /** Real publisher link (GDELT/GNews). */
  url: string
  /**
   * OPTIONAL contextual metadata about the outlet's political leaning
   * (per-rater, unaveraged). Populated only for articles whose publisher
   * was found in the MediaBias.news outlet index. This is NOT a measure of
   * factual accuracy; articles are never ranked or sorted by it.
   */
  mediaBias?: OutletBias
}

/** One entry of a storyline's vertical timeline. */
export interface TimelineEvent {
  id: string
  /** ISO date string; the Timeline sorts events by this. */
  date: string
  title: string
  description: string
  sourceRefs: SourceRef[]
}

/**
 * ONE rater's verdict on an outlet's political leaning, kept SEPARATE from
 * every other rater's. This mirrors MediaBias.news's unaveraged-ratings
 * philosophy: where AllSides and Ad Fontes place the same publisher
 * differently, the reader sees both instead of a single flattened label.
 */
export interface BiasReview {
  /** e.g. 'AllSides', 'Ad Fontes Media', 'Media Bias/Fact Check'. */
  rater: string
  /** The rater's own verdict string, e.g. 'Right', 'Lean Right'. */
  verdict: string
  /** 0 (left) … 100 (right), 50 = centre — derived, for the bar marker dot. */
  position: number
  /** Link to the rater's own published review, when provided. */
  url?: string
}

/**
 * Everything a left-right bar needs for one outlet, plus what the
 * citation requires: the ratings belong to the named raters and the
 * canonical MediaBias.news page must be linkable.
 */
export interface OutletBias {
  /** Publisher's canonical name at MediaBias.news, e.g. 'Fox News'. */
  outletName: string
  /** One entry per rater that has published a bias verdict. */
  reviews: BiasReview[]
  /** Attribution: https://mediabias.news/sources/{slug} */
  canonicalUrl: string
  /** Ready-made citation string from the API's citation block. */
  citation: string
}
