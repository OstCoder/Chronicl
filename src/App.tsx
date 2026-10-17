import { Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import ScrollToTop from './components/ScrollToTop'
import { DEMO_DISCLAIMER } from './data/stories'
import HomePage from './pages/HomePage'
import StoryPageView from './pages/StoryPageView'

/**
 * Shown for any URL that matches no route at all (e.g. /foo). Story slugs
 * never land here — unknown /story/… addresses are handled as a
 * "Story not found" state inside StoryPageView. A catch-all route keeps
 * the app from rendering a blank screen while it is under construction.
 */
function PlaceholderPage() {
  return (
    <div className="placeholder-page">
      <h1>Story pages are being built…</h1>
      <p>
        This route intentionally does nothing yet. Stage 4–5 replaces it with the
        full individual story page.
      </p>
    </div>
  )
}

/**
 * App is the app shell: header on top of every page, one <Routes> block
 * that maps URLs to page components, and a visible demo-data footer.
 */
export default function App() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* :slug is a dynamic segment — it matches ONE URL part of any value,
              and the value becomes the `slug` URL parameter. */}
          <Route path="/story/:slug" element={<StoryPageView />} />
          <Route path="*" element={<PlaceholderPage />} />
        </Routes>
        <footer className="demo-footer">
          <p>{DEMO_DISCLAIMER}</p>
        </footer>
      </main>
    </div>
  )
}
