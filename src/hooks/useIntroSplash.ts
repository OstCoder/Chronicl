import { useEffect, useState } from 'react'

/**
 * Drives the app-launch splash animation that plays before the landing
 * page appears (matches the reference video: black screen -> centered icon
 * with a pop-in, a small spinner below with a percentage crawling up to
 * 99%, then a fade to the landing page).
 *
 * SPEED RULE (product decision after the conversion audit): the splash
 * only plays on the FIRST pageview of a browser tab/session. It marks
 * itself played in sessionStorage the moment the sequence ends, so every
 * refresh and in-app navigation afterwards lands straight on the page —
 * no artificial wait between a visitor and the content. Previously it
 * replayed on EVERY load at ~2s, which was the single biggest "this page
 * is slow" offender. React Router navigation never re-triggers it either.
 *
 * When it DOES play it is quick (<1s): logo pop + percentage crawl, then
 * a short fade.
 *
 * Exposes the two numbers the CSS needs:
 *  - `count` (1..99) is the percentage label under the spinner
 *  - `fading` flips true near the end so the whole splash fades out
 */
const SPLASH_TOTAL_MS = 900
const FADE_MS = 300
const COUNT_START_MS = 250 // spinner appears shortly after the logo lands
const COUNT_END_MS = 700 // percentage label hides just before the fade

/** sessionStorage marker: this tab has already seen the intro. */
const SEEN_KEY = 'chronicl:intro-splash-played'

export function useIntroSplash() {
  // Lazily read once: a tab that has already played the intro renders the
  // app with zero splash markup (and without ever locking scroll).
  const [seen, setSeen] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) === 'played'
    } catch {
      return false // storage unavailable (private mode): conservative = play it
    }
  })
  const [count, setCount] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (seen) return

    document.body.classList.add('intro-lock') // no scroll while the splash is up

    // Percentage label: ease-in fast start, slow crawl near 99 like the video.
    let raf = 0
    let timer = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(now - start, SPLASH_TOTAL_MS)
      if (t >= COUNT_START_MS && t < COUNT_END_MS) {
        const p = (t - COUNT_START_MS) / (COUNT_END_MS - COUNT_START_MS)
        // easeOutCubic: jumps to ~60% quickly, then crawls to 99
        setCount(Math.round(99 * (1 - Math.pow(1 - p, 3))))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    timer = window.setTimeout(() => setFading(true), SPLASH_TOTAL_MS - FADE_MS)
    const done = window.setTimeout(() => {
      setSeen(true)
      try {
        sessionStorage.setItem(SEEN_KEY, 'played')
      } catch {
        // storage unavailable: the splash replays per load rather than failing
      }
      document.body.classList.remove('intro-lock')
    }, SPLASH_TOTAL_MS)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.clearTimeout(done)
      document.body.classList.remove('intro-lock')
    }
  }, [seen])

  return { seen, count, fading }
}
