import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import LiveStoriesSection from '../components/LiveStoriesSection'
import type { StoryCategory } from '../types'

/**
 * The homepage OWNS the topic-filter state; Sidebar only reports picks
 * upward. There is no search box: ONE auto pipeline loads every topic from
 * BOTH sources at once (store key 'all'), the AI groups it, and the topic
 * buttons purely client-side filter the grouped storylines.
 */
export default function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState<StoryCategory | null>(null)

  return (
    <div className="home-layout">
      <Sidebar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      <section className="home-main">
        <h1 className="home-heading">Live stories</h1>
        <p className="home-sub">
          Today's headlines on civic topics that have occurred in the past
          week, grouped into storylines. Filter if necessary.
        </p>

        <LiveStoriesSection selectedCategory={selectedCategory} />
      </section>
    </div>
  )
}
