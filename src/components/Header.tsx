import { Link } from 'react-router-dom'

/**
 * Site-wide header: brand name + simple navigation.
 *
 * `Link` is React Router's anchor tag. It looks (and is styled) like a link,
 * but it changes the URL WITHOUT a full page reload — the app stays loaded
 * and React just swaps what's rendered. A plain <a href> would reload the
 * whole page and destroy app state.
 */
export default function Header() {
  return (
    <header className="site-header">
      {/* Brand + Home both lead to the NEWS page (/app): the marketing
          landing page is pre-login only, so the signed-in app shell never
          links back to it. */}
      <Link to="/app" className="header-brand">
        Chronicl
      </Link>
      <nav className="header-nav">
        <Link to="/app" className="header-nav-link">
          Home
        </Link>
        <span className="header-badge">Live wire</span>
      </nav>
    </header>
  )
}
