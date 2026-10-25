import { useIntroSplash } from '../hooks/useIntroSplash'

/**
 * The app-launch splash that plays before the landing page: a black screen,
 * the 3D cube acting as the animated logo (pop-in, then the faces keep
 * tumbling), and below it a small ring spinner with a percentage label
 * that races up and then crawls to 99% — finally the whole screen fades
 * into the app.
 *
 * Runs on the FIRST pageview of a browser tab only (see useIntroSplash for
 * the session rule) and renders nothing once the ~0.9s sequence is done —
 * every later load in that tab lands on the page immediately.
 */
export default function IntroSplash() {
  const { seen, count, fading } = useIntroSplash()

  if (seen) return null

  return (
    <div className={`intro-splash${fading ? ' intro-splash--fading' : ''}`}>
      {/* The cube IS the logo: six faces spinning in 3D */}
      <div className="intro-logo-wrap">
        <div className="intro-logo" aria-hidden="true">
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
        </div>
      </div>
      {count > 0 && (
        <div className="intro-loader" aria-live="polite">
          <span className="intro-spinner" aria-hidden="true" />
          <span className="intro-percent">{count}%</span>
        </div>
      )}
    </div>
  )
}
