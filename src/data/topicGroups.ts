import type { StoryCategory } from '../types'

/**
 * REAL topic queries — the live pipeline's filter mapping.
 *
 * Each StoryCategory maps to a curated real-topic GDELT query. The bulk
 * pipeline (liveFeed) OR-combines ALL of these into one union request and
 * re-derives per-article categories with the extracted keywords, and the
 * enrichment floor top-ups re-dial each query directly. There are no demo
 * stories and no search: this file is now the ONLY data file in src/data,
 * and TOPIC_CATEGORIES below feeds the Sidebar buttons.
 */
export interface TopicGroup {
  id: string
  label: string
  description: string
  /** Full-text GDELT query: quoted phrases, space = AND. */
  gdeltQuery: string
  category: StoryCategory
}

export const TOPIC_GROUPS: TopicGroup[] = [
  {
    id: 'data-centers',
    label: 'Data centers',
    description: 'Data-center development across Virginia',
    gdeltQuery: '"data center" virginia',
    category: 'Local Development',
  },
  {
    id: 'education-policy',
    label: 'Education policy',
    description: 'School boards, policies and classrooms',
    gdeltQuery: '"school board" virginia',
    category: 'Education',
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    description: 'Roads, transit and local projects',
    gdeltQuery: 'infrastructure virginia',
    category: 'Community',
  },
  {
    id: 'technology',
    label: 'Technology',
    description: 'Tech industry and innovation news',
    gdeltQuery: 'technology virginia',
    category: 'Technology',
  },
  {
    id: 'environment',
    label: 'Environment',
    description: 'Energy, climate and land-use questions',
    gdeltQuery: 'environment virginia',
    category: 'Environment',
  },
]

/** Sidebar filter labels, in topic-group order. */
export const TOPIC_CATEGORIES: StoryCategory[] = TOPIC_GROUPS.map((group) => group.category)
