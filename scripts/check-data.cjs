/* Stage 8 one-off data integrity check (kept for future AI-pipeline QA). */
const fs = require('fs')
const src = fs.readFileSync('src/data/stories.ts', 'utf8')

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/* Must mirror the StoryCategory union in src/types/index.ts. */
const VALID_CATEGORIES = new Set([
  'Local Development',
  'Education',
  'Technology',
  'Environment',
  'Community',
])

// Per story block: latestUpdateDate must equal the newest timeline date.
const blocks = src.split(/\r?\n\s*id: 'story-/).slice(1)
if (blocks.length === 0) {
  console.error('FATAL: no story blocks found — check split marker')
  process.exit(1)
}

let failures = 0
for (const b of blocks) {
  const slug = (b.match(/slug:\s'([\w-]+)'/) || [])[1]
  const latest = [...b.matchAll(/latestUpdateDate:\s'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1])
  const timelineDates = [...b.matchAll(/date:\s'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1])

  const problems = []
  if (latest.length !== 1) problems.push(`expected 1 latestUpdateDate, found ${latest.length}`)
  if (timelineDates.length === 0) problems.push('no timeline dates found')
  for (const d of [...latest, ...timelineDates]) {
    if (!ISO_DATE.test(d)) problems.push(`malformed date ${d}`)
  }
  const maxTimeline = timelineDates.slice().sort().at(-1)
  if (latest.length === 1 && maxTimeline !== latest[0]) {
    problems.push(`latestUpdateDate ${latest[0]} != newest timeline event ${maxTimeline}`)
  }

  if (problems.length === 0) {
    console.log(slug, '-> OK (latestUpdateDate matches newest timeline event)')
  } else {
    failures += 1
    console.error(slug, '-> FAIL:', problems.join('; '))
  }
}

/*
 * Reference integrity: every sourceId referenced in any claim or timeline
 * event MUST resolve to one defined source, or the demo build would be
 * lying about its evidence. Data stays exactly as written; the UI already
 * degrades gracefully on dangling refs, but this script FAILS so bad data
 * never ships quietly.
 */
const declared = [...src.matchAll(/(?:^|\r?\n)\s*id:\s'((?:dc|sch|gw)-source-\d+)',/gm)]
const declaredIds = new Set(declared.map((m) => m[1]))
const referencedIds = [...src.matchAll(/sourceId:\s'((?:dc|sch|gw)-source-\d+)'/g)].map((m) => m[1])

const dangling = referencedIds.filter((id) => !declaredIds.has(id))
if (dangling.length > 0) {
  failures += 1
  console.error(`FAIL: ${dangling.length} dangling sourceId reference(s): ${[...new Set(dangling)].join(', ')}`)
} else {
  console.log(
    `Refs OK -> ${referencedIds.length} sourceId references resolve against ${declaredIds.size} declared sources`,
  )
}

const slugs = [...src.matchAll(/slug:\s'([\w-]+)'/g)].map((m) => m[1])
const dupSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i)
if (dupSlugs.length > 0) {
  failures += 1
  console.error(`FAIL: duplicated slug(s): ${[...new Set(dupSlugs)].join(', ')}`)
} else {
  console.log(`Slugs OK -> all unique: ${slugs.join(', ')}`)
}

const categories = [...src.matchAll(/category:\s'([^']+)',/g)].map((m) => m[1])
const badCategory = categories.filter((c) => !VALID_CATEGORIES.has(c))
if (badCategory.length > 0) {
  failures += 1
  console.error(`FAIL: unknown category value(s): ${[...new Set(badCategory)].join(', ')}`)
} else {
  console.log(`Categories OK -> all ${categories.length} match StoryCategory`)
}

console.log(failures === 0 ? 'DATA INTEGRITY: PASSED' : `DATA INTEGRITY: ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
