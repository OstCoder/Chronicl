import { useMemo } from 'react'
import useLiveStories from './useLiveStories'
import { useOutletBiasMap } from './useOutletBiasMap'
import type { TaggedArticle } from '../services/liveFeed'
import type { NewsSource } from '../types'

/** URL -> hostname (lowercase), or '' when it can't parse (no bias bar). */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Shared feed -> sources/articles mapping, used by BOTH the story cards
 * (LiveStoriesSection) and the story detail page (LiveStoryPage)'s
 * cache-recovery path, so IDs line up between the two (group.articleIds
 * index into this same ordering).
 */
export function useLiveStorySources(): {
  articles: TaggedArticle[]
  sources: NewsSource[]
} {
  const { feed } = useLiveStories()
  // The store's feed bundle is the ALL pipeline in every case now; the
  // 'autoBalanced' marker doubles as the type guard for the AllTopicsFeed
  // shape (articles are tagged; search-shaped feeds no longer exist).
  const allFeed = feed !== null && 'autoBalanced' in feed ? feed : null
  const articles = useMemo(() => allFeed?.articles ?? [], [allFeed]) as TaggedArticle[]

  const domains = useMemo(() => {
    const unique = new Set<string>()
    for (const article of articles) {
      const host = hostnameOf(article.url)
      if (host !== '') {
        unique.add(host)
      }
    }
    return Array.from(unique)
  }, [articles])
  const biasMap = useOutletBiasMap(domains)

  const sources: NewsSource[] = useMemo(
    () =>
      articles.map((article) => {
        const domain = hostnameOf(article.url)
        const bias = biasMap.get(domain)
        return {
          id: article.id,
          title: article.title,
          publisher: article.source,
          publicationDate: article.publishedAt,
          shortDescription: article.topicCategory,
          url: article.url,
          ...(bias ? { mediaBias: bias } : {}),
        }
      }),
    [articles, biasMap],
  )

  return { articles, sources }
}
