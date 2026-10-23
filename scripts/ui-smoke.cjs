/**
 * UI smoke check via Chrome DevTools Protocol (headless Chrome).
 *
 * Verifies, against a running dev server (localhost:5173):
 *   - '/'      (signed out): landing renders, app header absent
 *   - '/login' and '/signup': now the catch-all not-found page (auth removed);
 *      the 6h time-limited session resets /app to the landing page
 *   - '/app':  header renders; Home link is legible (light text on navy,
 *              computed color must NOT be the old invisible navy shade);
 *              "Live stories" appears ONCE (no double heading);
 *              Live Wire chip + pulsing dot pseudo exist;
 *              live-story cards render (or an honest state note does).
 *   - '/'      rendered with no page exceptions
 *
 * Run: node scripts/ui-smoke.cjs   (dev server must be up)
 */
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Find the dev server: Vite bumps the port (5173 -> 5174 -> ...) when one
    is already taken. Probe the usual candidates. Default via env override. */
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

/** Wait for Chrome's DevTools port to open (Chrome is slow to boot cold). */
async function waitForDevtools(port, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const targets = await fetch(`http://localhost:${port}/json`).then((r) => r.json())
      return targets
    } catch {
      await sleep(500)
    }
  }
  return null
}

async function evalInBrowser(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.result?.exceptionDetails) {
    return `EXCEPTION: ${JSON.stringify(result.result.exceptionDetails).slice(0, 300)}`
  }
  return result.result?.result?.value
}

let client

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-smoke-'))
  const chrome = execFile(CHROME, [
    '--headless=new',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=9335',
    'about:blank',
  ])
  const targets = await waitForDevtools(9335)
  if (!targets) {
    chrome.kill()
    throw new Error('Chrome DevTools port 9335 never opened')
  }
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
      const details = data.params?.exceptionDetails ?? {}
      const text =
        details.exception?.description ||
        details.exception?.value ||
        details.text ||
        'exception'
      // Keep the FIRST meaningful line (a full stack can be huge) plus the
      // source position so a report can point at the culprit file.
      const summary = String(text).split('\n').slice(0, 4).join(' | ')
      exceptions.push(`${details.url ?? ''}@${details.lineNumber ?? '?'}:${details.columnNumber ?? '?'} ${summary}`)
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
  await client.send('Page.enable')

  const visit = async (route) => {
    await evalInBrowser(client, `location.href = ${JSON.stringify(BASE + route)}`)
    // Let the intro splash play out and React settle (route changes are SPA-fast).
    await sleep(3800)
  }

  const report = {}

  // ---- '/app': the signed-in news page --------------------------------
  await visit('/app')
  report.app = await evalInBrowser(
    client,
    `(() => {
      const home = [...document.querySelectorAll('.header-nav-link')].map(el => el.textContent.trim())
      const link = document.querySelector('.header-nav-link')
      const linkColor = link ? getComputedStyle(link).color : null
      const brandDot = getComputedStyle(document.querySelector('.header-brand'), '::after').width
      const dot = getComputedStyle(document.querySelector('.header-badge'), '::before')
      const liveStoriesCount = document.body.innerText
        .split('\\n').filter((l) => l.trim() === 'Live stories').length
      return {
        headerPresent: !!document.querySelector('.site-header'),
        home,
        homeLinkColor: linkColor,
        homeLinkIsInvisibleNavy: linkColor === 'rgb(34, 44, 68)',
        brandDotWidth: brandDot,
        liveDot: { width: dot.width, borderRadius: dot.borderRadius, background: dot.backgroundColor },
        liveStoriesHeadingCount: liveStoriesCount,
        sidebars: document.querySelectorAll('.sidebar').length,
        filterButtons: document.querySelectorAll('.filter-btn').length,
        liveCards: document.querySelectorAll('.live-story-card').length,
        skeletons: document.querySelectorAll('.story-skeleton').length,
      }
    })()`,
  )

  // ---- landing CTA stamped the session on the first /app entry ----------
  report.session = await evalInBrowser(
    client,
    `(() => ({
      stamped: !!window.localStorage.getItem('chronicl:session-start'),
    }))()`,
  )

  // ---- '/login' and '/signup' no longer exist (auth was removed):
  //      they must render the catch-all not-found page, not a broken app
  await visit('/login')
  report.login = await evalInBrowser(
    client,
    `(() => ({
      notFound: !!document.querySelector('.placeholder-page'),
      bodyHasLogin: document.body.innerText.toLowerCase().includes('log in'),
    }))()`,
  )
  await visit('/signup')
  report.signup = await evalInBrowser(
    client,
    `(() => ({ notFound: !!document.querySelector('.placeholder-page') }))()`,
  )

  // ---- '/' signed in-session: landing is the only front door, with
  //      exactly ONE button that opens the Chronicl app -----------------
  await visit('/')
  report.landing = await evalInBrowser(
    client,
    `(() => ({
      landingPresent: !!document.querySelector('.landing'),
      headerAbsent: !document.querySelector('.site-header'),
      ctaCount: document.querySelectorAll('.landing-cta').length,
      ctaGoesToApp: document.querySelector('.landing-cta')?.getAttribute('href') === '/app',
      noLoginLinks: !document.querySelector('.landing-login') &&
        document.body.innerText.toLowerCase().indexOf('log in') === -1,
      signUpGone: !document.body.innerText.toLowerCase().includes('sign up'),
      floatCards: document.querySelectorAll('.float-card').length,
      miniTimelineLi: document.querySelectorAll('.float-timeline li').length,
    }))()`,
  )

  // ---- session time limit: an expired stamp resets /app to the landing --
  await evalInBrowser(
    client,
    `window.localStorage.setItem('chronicl:session-start', String(Date.now() - 7 * 60 * 60 * 1000))`,
  )
  await visit('/app')
  report.expiredReset = await evalInBrowser(
    client,
    `(() => ({
      landingShown: !!document.querySelector('.landing'),
      feedGone: !document.querySelector('.site-header'),
      stampCleared: !window.localStorage.getItem('chronicl:session-start'),
    }))()`,
  )

  // ---- deep link with NO session: the gate resets to the landing (the
  //      story-expired grace page only applies mid-session) --------------
  await visit('/live-story/0')
  report.expiredStory = await evalInBrowser(
    client,
    `(() => ({
      landingOrGracePage:
        !!document.querySelector('.landing') ||
        !!document.querySelector('.placeholder-page') ||
        !!document.querySelector('.story-page--bento'),
    }))()`,
  )

  report.pageExceptions = exceptions
  console.log(JSON.stringify(report, null, 2))

  chrome.kill()
}

main().catch((error) => {
  console.error('ui smoke failed:', error.stack || error.message)
  process.exit(1)
})
