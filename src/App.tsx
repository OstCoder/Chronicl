import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Header from './components/Header'
import ScrollToTop from './components/ScrollToTop'
import IntroSplash from './components/IntroSplash'
import LandingPage from './pages/LandingPage'
import FeedPage from './pages/FeedPage'
import LiveStoryPage from './pages/LiveStoryPage'
import {
  endSession,
  isSessionExpired,
  msUntilSessionExpiry,
  startSession,
} from './utils/session'

/**
 * The time-limited session gate (NO accounts): Chronicl has no login page
 * and no signed-in state — every visitor goes straight through. The gate
 * only enforces the session TIME LIMIT over the feed routes: entering one
 * stamps the session start (localStorage, so refreshes keep the visit)
 * and, once the limit is reached, the visitor is returned to the landing
 * page — mid-session by a timer, or on the next navigation if the tab sat
 * idle past the limit.
 */
function SessionGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  useEffect(() => {
    // ORDER MATTERS: stamping runs BEFORE the expiry check. A visitor with
    // no session at all is a FIRST entry (start a fresh session and show
    // the feed), not an expired one — checking first would bounce every
    // first visit straight back to the landing page, trapping them there.
    // An EXISTING session whose six hours are up still fails the check
    // below, exactly as intended.
    startSession()
    if (isSessionExpired()) {
      endSession()
      navigate('/', { replace: true })
      return
    }
    // setTimeout is 32-bit clamped; the six-hour remainder fits, but clamp
    // anyway so the timer never misfires on a jumbo remaining value.
    const timer = window.setTimeout(
      () => {
        endSession()
        navigate('/', { replace: true })
      },
      Math.min(msUntilSessionExpiry(), 2_147_000_000),
    )
    return () => window.clearTimeout(timer)
  }, [navigate])

  return <>{children}</>
}

/**
 * Shown for any URL that matches no route at all (e.g. /foo). Expired
 * live-story links are handled on the live story page itself. A catch-all
 * route keeps the app from rendering a blank screen.
 */
function PlaceholderPage() {
  return (
    <div className="placeholder-page">
      <h1>Page not found</h1>
      <p>That address does not match anything in this app.</p>
    </div>
  )
}

/**
 * App is the app shell: the splash intro plays once per session, then the
 * landing page at / — the only front door — the live feed at /app under
 * the session time limit, and the live-story detail route. The header
 * appears only on the feed pages; the landing page stays clean like the
 * reference screenshot.
 */
export default function App() {
  const { pathname } = useLocation()
  const isFeed = pathname.startsWith('/app') || pathname.startsWith('/live-story')

  return (
    <div className="app-shell">
      <IntroSplash />
      {isFeed && (
        <>
          <ScrollToTop />
          <Header />
        </>
      )}
      <main className="app-main">
        <Routes>
          {/* The landing page is the only front door: no auth screens at all. */}
          <Route path="/" element={<LandingPage />} />
          {/* Feed routes reset to the landing page once the session limit
              is reached (6 hours from first entry). */}
          <Route
            path="/app"
            element={
              <SessionGate>
                <FeedPage />
              </SessionGate>
            }
          />
          <Route
            path="/live-story/:groupId"
            element={
              <SessionGate>
                <LiveStoryPage />
              </SessionGate>
            }
          />
          <Route path="*" element={<PlaceholderPage />} />
        </Routes>
        {/* Inside <main> so the page is the :last-child target of the
            spacing rule above. */}
      </main>
    </div>
  )
}
