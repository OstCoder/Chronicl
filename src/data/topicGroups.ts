import type { StoryCategory } from '../types'

/**
 * REAL topic groups — the live-data validation harness.
 *
 * These are the ONLY inputs the GDELT integration ever uses. The fictional
 * demo stories (Powell's Run, Millcreek, etc.) stay purely as demo content
 * for the Claim Ledger / Timeline / gaps sections and NEVER feed live
 * queries — fictional entities cannot return real coverage, which is why
 * the first integration attempt showed "no articles".
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

/**
 * Story pages fetch REAL coverage for their topic AREA (mapped from the
 * story's category), never for their fictional names/keywords.
 */
export function getTopicQueryForCategory(category: StoryCategory): string {
  return TOPIC_GROUPS.find((group) => group.category === category)?.gdeltQuery ?? ''
}
