/**
 * Time-limited viewer session (NO accounts).
 *
 * Chronicl has no login: the landing page is the only front door, and the
 * app is open to every visitor. Instead of a signed-in state, the app
 * enforces a SESSION TIME LIMIT — a visit lasts SESSION_TTL_MS from the
 * first feed entry, after which the visitor is reset to the landing page
 * (mid-session by a timer, or on the next navigation if the tab was
 * closed and reopened later).
 *
 * Storage: localStorage, so plain refreshes and same-tab navigations keep
 * the visit going. An in-memory mirror backs the case where storage is
 * unavailable (blocked/private browsing) so the visitor still gets a
 * full-length session per page load instead of being bounced instantly.
 */

const SESSION_KEY = 'chronicl:session-start'

/** Six hours from the first feed entry, then back to the landing page. */
export const SESSION_TTL_MS = 6 * 60 * 60_000

/** In-memory mirror for when localStorage is unavailable. */
let memoryStart = 0

/**
 * Set by endSession() until the landing page acknowledges it. Keeps a
 * reset sticky even when the gate effect re-runs on the same page load
 * (React StrictMode double-invokes effects in dev): the stamp stays
 * cleared and no later run can silently resurrect a fresh session
 * behind it. LandingPage clears the flag on mount — landing is the
 * reset destination, and its Get Started click must start a NEW visit.
 */
let sessionEndedThisLoad = false

function readStart(): number {
  if (memoryStart !== 0) {
    return memoryStart
  }
  try {
    const value = Number(localStorage.getItem(SESSION_KEY))
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

/** TRUE when no session is running or the six hours are up. */
export function isSessionExpired(): boolean {
  const start = readStart()
  return start === 0 || Date.now() - start >= SESSION_TTL_MS
}

/** Milliseconds left in the running session (0 when none/expired). */
export function msUntilSessionExpiry(): number {
  const start = readStart()
  if (start === 0) {
    return 0
  }
  return Math.max(0, start + SESSION_TTL_MS - Date.now())
}

/**
 * Stamp the session start on the first feed entry; refreshes and idle
 * time inside the window do NOT restart it.
 */
export function startSession(): void {
  if (sessionEndedThisLoad || readStart() !== 0) {
    return
  }
  const now = Date.now()
  memoryStart = now
  try {
    localStorage.setItem(SESSION_KEY, String(now))
  } catch {
    // Storage unavailable: the memory mirror still holds the session.
  }
}

/** Clear the (expired) session so the next landing -> feed click starts fresh. */
export function endSession(): void {
  memoryStart = 0
  sessionEndedThisLoad = true
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

/**
 * Called by the landing page on mount so a visitor returned there by an
 * expiry can start a brand-new session with the CTA. Deliberately NOT
 * called anywhere else: mid-session navigation back to / must not reset
 * the visit ('/' browses back is allowed; a fresh session only begins
 * after the reset the visitor just experienced, or a fresh page load).
 */
export function clearSessionEnded(): void {
  sessionEndedThisLoad = false
}
