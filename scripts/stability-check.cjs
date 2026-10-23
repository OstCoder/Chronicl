/**
 * Headline-stability check via Chrome DevTools Protocol (headless Chrome).
 *
 * Verifies, against a running dev server, that the grouped story cards do
 * NOT shuffle across:
 *   1. the initial pipeline load,
 *   2. sidebar filter clicks (pure client-side),
 *   3. a full page reload inside the cache window.
 *
 * Run: node scripts/stability-check.cjs   (dev server must be up)
 * Exit 0 = headlines stable; exit 1 = something reloaded/reshuffled.
 */
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findDevServer() {
  if (process.env.UI_SMOKE_BASE) return process.env.UI_SMOKE_BASE
  for (const port of [5173, 5174, 5175, 5176]) {
    try {
      const res = await fetch(`http://localhost:${port}`)
      if (res.ok) return `http://localhost:${port}`
    } catch {
      // not this port
    }
  }
  throw new Error('dev server not found on 5173-5176')
}

async function waitForDevtools(port, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(`http://localhost:${port}/json`).then((r) => r.json())
    } catch {
      await sleep(500)
    }
  }
  return null
}

async function evalInBrowser(client, expression) {
  // Hard 10s step deadline: a stuck DevTools WebSocket (has happened across
  // navigations) must FAIL FAST with a clear step error, not hang the run.
  const send = client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('eval step timed out: ' + expression.slice(0, 80))), 10_000),
  )
  const result = await Promise.race([send, timeout])
  if (result.result?.exceptionDetails) {
    throw new Error(
      `EXCEPTION: ${JSON.stringify(result.result.exceptionDetails).slice(0, 300)}`,
    )
  }
  return result.result?.result?.value
}

let client

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stability-check-'))
  const chrome = execFile(CHROME, [
    '--headless=new',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${process.env.STABILITY_DEBUG_PORT || 9341}`,
    'about:blank',
  ])
  try {
    // Whole-run watchdog: any stall exits with code 2 and a reason long
    // before an outer CI/harness timeout can swallow the diagnosis.
    const watchdog = setTimeout(() => {
      console.error('watchdog: stability check exceeded 240s — aborting')
      process.exit(2)
    }, 240_000)
    watchdog.unref?.()
    const devtoolsPort = Number(process.env.STABILITY_DEBUG_PORT) || 9341
    const targets = await waitForDevtools(devtoolsPort)
    if (!targets) throw new Error(`Chrome DevTools port ${devtoolsPort} never opened`)
    const BASE = await findDevServer()
    const page = targets.find((t) => t.type === 'page')
    if (!page) throw new Error('no page target')

    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r, { once: true }))
    let msgId = 0
    const pending = new Map()
    const exceptions = []
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data)
        pending.delete(data.id)
      }
      if (data.method === 'Runtime.exceptionThrown') {
        exceptions.push(String(data.params?.exceptionDetails?.text || 'exception'))
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
    await client.send('Runtime.enable')

    const titles = () =>
      evalInBrowser(
        client,
        `[...document.querySelectorAll('.live-story-card-title')].map((el) => el.textContent)`,
      )
    const pipelineMeta = () =>
      evalInBrowser(
        client,
        `(() => {
          try {
            const raw = window.localStorage.getItem('civictrace:live-stories:v6')
            if (!raw) return { cached: false }
            const parsed = JSON.parse(raw)
            const entry = parsed.entries?.[0]
            return {
              cached: true,
              status: entry?.s?.status ?? null,
              articleCount: entry?.s?.feed?.articles?.length ?? 0,
              groupCount: entry?.s?.groups?.length ?? 0,
              groupingStatus: entry?.s?.grouping?.status ?? null,
              ageMs: Date.now() - (entry?.s?.updatedAt ?? 0),
            }
          } catch {
            return { cached: false }
          }
        })()`,
      )
    // Wait until the story grid is populated and grouping has settled
    // (grouping status success/error/rateLimited — any terminal state, or
    // groups simply present), or time out.
    // Wait until the story grid is populated and grouping has settled
    // (grouping status success/error/rateLimited, or a terminal feed state
    // with no card grid — 'empty'/'error' — which simply means there is
    // nothing to compare), or bail out loudly.
    let settled = false
    for (let i = 0; i < 30 && !settled; i++) {
      await visit(BASE + '/app')
      console.log(`STEP: visit #${i + 1}`)
      for (let j = 0; j < 12; j++) {
        const t = await titles()
        if (t.length > 0) {
          const meta = await pipelineMeta()
          if (meta.groupCount > 0 || ['error', 'success', 'rateLimited'].includes(meta.groupingStatus)) {
            settled = true
            break
          }
        }
        await sleep(1000)
      }
      if (!settled) {
        const meta = await pipelineMeta()
        console.log(
          `still not grouped, retrying visit… (cards state: ${meta.cached ? JSON.stringify(meta) : 'none'})`,
        )
        if (meta.cached && ['empty', 'error'].includes(meta.status)) break
      }
    }
    if (!settled) {
      throw new Error('pipeline never settled to a comparable state within the retry budget')
    }

    const A = await titles()
    const metaA = await pipelineMeta()
    console.log('STEP: initial capture', A.length, JSON.stringify(metaA))

    // --- click a filter button, then All topics -------------------------
    await evalInBrowser(
      client,
      `(() => {
        const btn = [...document.querySelectorAll('.filter-btn')].find((b) => b.textContent.trim() === 'Technology')
        if (btn) btn.click()
      })()`,
    )
    await evalInBrowser(
      client,
      `(() => {
        const btn = [...document.querySelectorAll('.filter-btn')].find((b) => b.textContent.trim() === 'All topics')
        if (btn) btn.click()
      })()`,
    )
    await sleep(600)
    console.log('STEP: filter clicks done')
    const C = await titles()

    // --- full reload inside the cache window ----------------------------
    await evalInBrowser(client, 'location.reload()')
    console.log('STEP: reload issued')
    await sleep(1500)
    let D = await titles()
    for (let i = 0; i < 30 && D.length === 0; i++) {
      await sleep(1000)
      D = await titles()
    }
    const metaD = await pipelineMeta()

    const report = {
      initialCards: A.length,
      afterClicksEqual: C.length === A.length && JSON.stringify(A) === JSON.stringify(C),
      afterReloadEqual: D.length > 0 && JSON.stringify(A) === JSON.stringify(D),
      reloadCards: D.length,
      cachedOnReload: metaD.cached,
      reloadGroupCount: metaD.groupCount,
      pageExceptions: exceptions,
    }
    console.log(JSON.stringify(report, null, 2))
    console.log('A sample:', A.slice(0, 5))
    console.log('C sample:', C.slice(0, 5))
    console.log('D sample:', D.slice(0, 5))
    process.exitCode = report.afterClicksEqual && report.afterReloadEqual ? 0 : 1
  } finally {
    chrome.kill()
  }
}

async function visit(url) {
  await evalInBrowser(client, `location.href = ${JSON.stringify(url)}`)
}

main().catch((error) => {
  console.error('stability check failed:', error.stack || error.message)
  process.exit(1)
})
