/**
 * Proves the hard-refresh promise: two Chrome sessions back-to-back on the
 * SAME persistent profile. Session 1 lets the pipeline run (calls > 0).
 * Session 2 is a simulated hard refresh — with sessionStorage intact, it
 * must render cards from the cached store with ZERO new /api calls.
 *
 * Run: node scripts/cdp-reload-check.cjs
 */
const { execFileSync, execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-reload-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function evalInBrowser(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  return result.result?.result?.value
}

/** One headless session on the shared profile; returns a snoop function. */
async function session() {
  execFile(CHROME, [
    '--headless=new',
    '--disable-gpu',
    `--user-data-dir=${PROFILE}`,
    '--remote-debugging-port=9334',
    BASE,
  ])
  let page = null
  for (let i = 0; i < 30; i++) {
    await sleep(500)
    try {
      const targets = await fetch('http://localhost:9334/json').then((r) => r.json())
      page = targets.find((t) => t.type === 'page' && t.url.startsWith(BASE))
      if (page) break
    } catch {
      // Chrome not listening yet — retry until the port opens.
    }
  }
  if (!page) throw new Error('no page target')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => ws.addEventListener('open', r, { once: true }))
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
}

let client

async function killChrome() {
  try {
    execFileSync('pkill', ['-f', 'cdp-reload-'])
  } catch {
    // already dead
  }
  await sleep(1500)
}

/** Graceful shutdown so Chrome flushes profile storage before exit. */
async function closeGracefully() {
  try {
    const version = await fetch('http://localhost:9334/json/version').then((r) => r.json())
    const ws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((r, j) => ws.addEventListener('open', r, { once: true }))
    let id = 0
    ws.addEventListener('message', () => {
      // nothing to read; close fires asynchronously below
    })
    ws.send(JSON.stringify({ id: ++id, method: 'Browser.close', params: {} }))
    await sleep(2000)
    try {
      ws.close()
    } catch {
      // ignore
    }
  } catch {
    // discovery failed: fall back to the hard kill
    await killChrome()
  }
  await sleep(1500)
}

async function main() {
  // ---- Session 1: cold load; the pipeline may run (quota calls > 0) ----
  const CARD_COUNT = () => `performance.getEntriesByType('resource').filter((e) =>
    /\\/api\\/(gdelt|gnews|groq)/.test(e.name)).length`
  const BIAS_COUNT = () => `performance.getEntriesByType('resource').filter((e) =>
    e.name.includes('/api/mbias')).length`
  console.log('=== SESSION 1: cold load ===')
  await session()
  let calls = -1
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    const s = await evalInBrowser(
      client,
      `(() => ({
        cards: document.querySelectorAll('.live-story-card').length,
        calls: ${CARD_COUNT()},
      }))()`,
    )
    calls = s.calls
    if (s.cards > 0) {
      console.log(JSON.stringify(s))
      break
    }
  }
  console.log(
    'session 1 totals: quota apis:', await evalInBrowser(client, CARD_COUNT()),
    '| mediabias lookups:', await evalInBrowser(client, BIAS_COUNT()),
  )
  await closeGracefully()

  // ---- Session 2: warm reload on the SAME profile ----
  // Pass rule: the QUOTA-bearing APIs (gdelt/gnews/groq) must stay silent;
  // MediaBias lookups re-run freely (120 req/min, no cap in the free tier).
  console.log('=== SESSION 2: reload on same profile (sessionStorage intact) ===')
  await session()
  let second = null
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    second = await evalInBrowser(
      client,
      `(() => ({
        cards: document.querySelectorAll('.live-story-card').length,
        quotaCalls: ${CARD_COUNT()},
        biasCalls: ${BIAS_COUNT()},
        titles: [...document.querySelectorAll('.live-story-card-title')].slice(0, 2).map((el) => el.textContent),
      }))()`,
    )
    if (second && second.cards > 0 && i >= 3) break // let render+bars settle
  }
  console.log(JSON.stringify(second, null, 2))
  const verdict =
    second && second.cards > 0 && second.quotaCalls === 0
      ? 'PASS: reload rendered from cache with ZERO new quota-bearing API calls'
      : 'FAIL: reload still caused quota-bearing API traffic or no cards'
  console.log(verdict)
  await killChrome()
}

main().catch((error) => {
  console.error('diag failed:', error.stack || error.message)
  try {
    execFileSync('pkill', ['-f', 'cdp-reload-'])
  } catch {}
  process.exit(1)
})
