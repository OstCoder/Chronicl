import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * React Router keeps the app feeling like one page, which has a quirk:
 * scrolling down the homepage, then clicking a card, would land you on the
 * story page already scrolled to the same position. This component listens
 * for URL changes and resets the scroll to the top.
 *
 * It renders nothing — it is pure behavior, mounted once in App.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname]) // re-run only when the URL path changes

  return null
}
