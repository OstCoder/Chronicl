import { useEffect, useState } from 'react'

/**
 * Drives the app-launch splash animation that plays before the landing
 * page appears (matches the reference video: black screen -> centered icon
 * with a pop-in, a small spinner below with a percentage crawling up to
 * 99%, then a fade to the landing page).
 *
 * Runs on EVERY page load — every refresh and every first visit replays
 * it (per the user's choice). React Router's in-app navigation does NOT
 * rerun this hook, so moving between pages never re-triggers it.
 *
 * Timing is QUICK (~2s total): the user asked for a fast loader that gets
 * to the landing page without making them wait.
 *
 * Exposes the two numbers the CSS needs:
 *  - `count` (1..99) is the percentage label under the spinner
 *  - `fading` flips true near the end so the whole splash fades out
 */
const SPLASH_TOTAL_MS = 2000 // quick: just long enough to read the logo
const FADE_MS = 350
const COUNT_START_MS = 350 // spinner appears shortly after the logo lands
const COUNT_END_MS = 1750 // percentage label hides just before the fade

export function useIntroSplash() {
  const [count, setCount] = useState(0)
  const [fading, setFading] = useState(false)
  const [seen, setSeen] = useState(false)

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
