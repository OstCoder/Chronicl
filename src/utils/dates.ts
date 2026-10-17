/**
 * Tiny shared date helpers.
 * Data stays ISO 'YYYY-MM-DD' everywhere; components call this only for
 * display, never for storage or sorting.
 */

/** ISO '2026-04-14' -> 'Apr 14, 2026'. */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC', // date-only strings: never let a timezone shift the day
  })
}
