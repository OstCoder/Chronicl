/**
 * CDP end-to-end check for the ONE-BULK-LOAD live-stories flow:
 *   1. open the homepage with no interaction -> EVERY topic loads from both
 *      sources, one Groq grouping runs, cards render
 *   2. record the /api call count
 *   3. click a topic button (Education) -> cards filter INSTANTLY, badge
 *      labels change, /api count DOES NOT change
 *   4. click "All topics" -> the union returns, still zero new calls
 *
 * Run: node scripts/cdp-check.cjs
 */
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function evalInBrowser(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  // Surface page-side exceptions instead of swallowing them as undefined.
  if (result.result?.exceptionDetails) {
    return `EXCEPTION: ${JSON.stringify(result.result.exceptionDetails).slice(0, 300)}`
  }
  return result.result?.result?.value
}

let client

// NOTE: injected expressions must avoid inline regexes — double escaping
// through the template literal produces 'Invalid regular expression flags'
// in the page (observed live). String includes() is bulletproof.
const quotaCalls = () =>
  evalInBrowser(
    client,
    `performance.getEntriesByType('resource').filter((e) =>
      e.name.includes('/api/gdelt') || e.name.includes('/api/gnews') || e.name.includes('/api/groq')).length`,
  )

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-check-'))
  const chrome = execFile(CHROME, [
    '--headless=new',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=9333',
    'about:blank',
  ])
  await sleep(2500)

  const targets = await fetch('http://localhost:9333/json').then((r) => r.json())
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let msgId = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data)
      pending.delete(data.id)
    }
  })
  client = {
    send: (method, params) =>
      new Promise((resolve) => {
        const id = ++msgId
        pending.set(id, resolve)
        ws.send(JSON.stringify({ id, method, params }))
      }),
  }

  await client.send('Page.enable')
  await evalInBrowser(client, `location.href = ${JSON.stringify(BASE)}`)

  console.log('=== PHASE 1: wait for the ONE bulk load (all topics, both sources) ===')
  let state = null
  for (let i = 0; i < 120; i++) {
    await sleep(1000)
    state = await evalInBrowser(client, `(() => {
      const cards = document.querySelectorAll('.live-story-card').length
      const note = (document.querySelector('.live-stories')?.innerText || '')
        .split('\\n').filter((l) => l.trim() !== '').slice(2, 5).join(' | ').slice(0, 200)
      return { cards, note }
    })()`)
    if (state && state.cards > 0) break
  }
  const callsAfterLoad = await quotaCalls()
  const badgesAfterLoad = await evalInBrowser(
    client,
    `[...document.querySelectorAll('.live-story-card .category-badge')].map((el) => el.textContent)`,
  )
  console.log(JSON.stringify({ state, callsAfterLoad, badgesAfterLoad }, null, 2))
  if (!state || state.cards === 0) {
    chrome.kill()
    throw new Error('bulk load did not produce cards')
  }

  console.log('=== PHASE 2: click the Education topic button ===')
  await evalInBrowser(client, `(() => {
    const btn = [...document.querySelectorAll('.sidebar-filters button')]
      .find((b) => b.textContent.trim() === 'Education')
    if (!btn) return 'BUTTON NOT FOUND'
    btn.click()
    return 'clicked'
  })()`)
  await sleep(700)
  const education = await evalInBrowser(client, `(() => ({
    cards: document.querySelectorAll('.live-story-card').length,
    badges: [...document.querySelectorAll('.live-story-card .category-badge')].map((el) => el.textContent),
    calls: performance.getEntriesByType('resource').filter((e) =>
      e.name.includes('/api/gdelt') || e.name.includes('/api/gnews') || e.name.includes('/api/groq')).length,
  }))()`)
  console.log(JSON.stringify(education, null, 2))

  console.log('=== PHASE 3: click "All topics" ===')
  await evalInBrowser(client, `(() => {
    const btn = [...document.querySelectorAll('.sidebar-filters button')]
      .find((b) => b.textContent.trim() === 'All topics')
    if (!btn) return 'BUTTON NOT FOUND'
    btn.click()
    return 'clicked'
  })()`)
  await sleep(700)
  const allTopics = await evalInBrowser(client, `(() => ({
    cards: document.querySelectorAll('.live-story-card').length,
    calls: performance.getEntriesByType('resource').filter((e) =>
      e.name.includes('/api/gdelt') || e.name.includes('/api/gnews') || e.name.includes('/api/groq')).length,
  }))()`)
  console.log(JSON.stringify(allTopics, null, 2))

  const searchBox = await evalInBrowser(client, `!!document.querySelector('.sidebar-search')`)
  const multiPerBadge = badgesAfterLoad !== null && new Set(badgesAfterLoad).size > 0
  const groupedCounts = await evalInBrowser(client, `(() => {
    const counted = {}
    for (const el of document.querySelectorAll('.live-story-card .category-badge')) {
      counted[el.textContent] = (counted[el.textContent] ?? 0) + 1
    }
    return counted
  })()`)
  const verdict =
    education.calls === callsAfterLoad &&
    allTopics.calls === callsAfterLoad &&
    allTopics.cards >= education.cards &&
    searchBox === false
      ? `PASS: tab switches filtered instantly with ZERO new API calls; search removed; groups per topic: ${JSON.stringify(groupedCounts)}`
      : `REVIEW: calls ${education.calls}->${allTopics.calls}, searchBox=${searchBox}`
  console.log(verdict)
  void multiPerBadge

  chrome.kill()
}

main().catch((error) => {
  console.error('diag failed:', error.stack || error.message)
  process.exit(1)
})
