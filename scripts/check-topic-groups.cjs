/**
 * One-shot live validation: runs each TopicGroup query against real GDELT.
 * Spacing is deliberately generous (55s) because GDELT queues longer
 * rolling lockouts for bursty IPs — 5s is the documented minimum, not a
 * realistic budget for repeated validation runs.
 *
 * Keep this list in sync with TOPIC_GROUPS in src/data/topicGroups.ts.
 */
const GROUPS = [
  ['Data centers', '"data center" virginia'],
  ['Education policy', '"school board" virginia'],
  ['Infrastructure', 'infrastructure virginia'],
  ['Technology', 'technology virginia'],
  ['Environment', 'environment virginia'],
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Optional CLI filter, e.g. `npm run verify:topics -- data-centers technology`
 * — lets us validate only the groups that still need proof.
 */
const wanted = new Set(process.argv.slice(2))

/** One fetch with a single graceful retry for transient network errors. */
async function fetchJsonWithRetry(url) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(url)
      if (res.status === 429) {
        throw Object.assign(new Error('HTTP 429 (rate limited)'), { isRateLimit: true })
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (error) {
      // Retry once ONLY for network-level failures ('fetch failed' has no
      // status and is usually transient). Rate limits are not retried here —
      // spacing handles those.
      if (attempt === 2 || error.isRateLimit) throw error
      await sleep(10_000)
    }
  }
}

async function main() {
  let failures = 0
  for (const [label, query] of GROUPS) {
    if (wanted.size > 0 && !wanted.has(label.toLowerCase().replace(/\s+/g, '-'))) {
      continue // CLI filter: skip groups that were already validated live
    }
    const url =
      'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
      encodeURIComponent(query) +
      '&mode=artlist&format=json&maxrecords=5&timespan=7d&sort=datedesc'
    try {
      const data = await fetchJsonWithRetry(url)
      const articles = Array.isArray(data.articles) ? data.articles : []
      console.log(`${label} -> ${articles.length} article(s)`)
      articles
        .slice(0, 2)
        .forEach((a) =>
          console.log(`   ${a.seendate} | ${a.domain} | ${String(a.title).slice(0, 60)}`),
        )
      if (articles.length === 0) failures += 1
    } catch (error) {
      failures += 1
      console.error(`${label} -> FAILED (${error.message})`)
    }
    await sleep(55_000)
  }
  console.log(
    failures === 0
      ? 'ALL TOPIC GROUPS RETURNED REAL RESULTS'
      : `${failures} group(s) returned nothing or failed`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
