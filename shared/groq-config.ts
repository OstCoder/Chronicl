/**
 * SHARED AI-grouping configuration — the one source of truth for BOTH
 * backends that serve the browser's `/api/groq` calls:
 *
 *   - vite.config.ts  (dev: Vite middleware over http.IncomingMessage)
 *   - api/groq.ts     (production: Vercel serverless Node function)
 *
 * Only the transport differs — the model, prompt, schema and payload
 * validation live here so the two hosts can never silently drift apart.
 * Zero imports on purpose: this file is bundled by both Vite and Vercel.
 *
 * The schema mirrors exactly what src/services/groq.ts parses/validates.
 */

/**
 * Chosen from the account's LIVE model catalog at integration time:
 * openai/gpt-oss-120b is the largest chat model the account serves, with
 * the longest context window (131,072 tokens) — 75 headlines is a rounding
 * error against it, so the feed can grow.
 */
export const GROQ_MODEL = 'openai/gpt-oss-120b'

/**
 * STRICT output schema for the grouping task.
 *
 * Live evidence: with loose `json_object` mode, gpt-oss-120b passed twice
 * then failed twice with "Failed to validate JSON" — a reasoning model can
 * wander off in freeform JSON. `json_schema` mode makes Groq itself reject
 * malformed output, so the client can rely on the shape it parses.
 */
const GROQ_GROUPS_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'story_groups',
    schema: {
      type: 'object',
      properties: {
        groups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              topic: {
                type: 'string',
                enum: ['Local Development', 'Education', 'Technology', 'Environment', 'Community'],
              },
              summary: { type: 'string' },
              articleIds: { type: 'array', items: { type: 'number' } },
              keyPoints: { type: 'array', items: { type: 'string' } },
              openQuestions: { type: 'array', items: { type: 'string' } },
              caseClosed: { type: 'boolean' },
              timeline: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    label: { type: 'string' },
                    description: { type: 'string' },
                    articleIds: { type: 'array', items: { type: 'number' } },
                  },
                  required: ['date', 'label', 'description', 'articleIds'],
                  additionalProperties: false,
                },
              },
            },
            required: ['title', 'topic', 'summary', 'articleIds', 'keyPoints', 'openQuestions', 'caseClosed', 'timeline'],
            additionalProperties: false,
          },
        },
      },
      required: ['groups'],
      additionalProperties: false,
    },
  },
}

export const GROQ_SYSTEM_PROMPT = `You divide recent news headlines into coherent storylines for a civic news-tracing app that renders each storyline as its own story page (overview, vertical timeline, source list). Grouping rules:
- ONE storyline per distinct underlying event, decision, or controversy — and ALL coverage of it: cluster every headline that reports on that same underlying story into the SAME group, including the original report, follow-ups, updates, reaction and analysis pieces, and different angles. A storyline should therefore typically bring together several sources (3 or more when the payload offers them); reference them all in articleIds so the story page lists them as its sub-stories.
- Reasonable boundaries: do NOT merge separate incidents that merely share a broad theme (e.g. two different counties' moratorium votes are TWO groups, not one "data center regulation" group), and never invent a connection between headlines that are clearly about different stories.
- Depth beats breadth: aim for roughly 10 to 25 storylines when the payload holds 60+ headlines, so clusters are meaningful instead of one headline each. A single-article storyline is allowed ONLY when genuinely no other headline in the payload relates to that event. Every article belongs in exactly one group — none dropped.
- Each storyline needs a concise factual title, max 90 characters, no clickbait, no editorializing.
- topic: assign each storyline its PRIMARY subject exactly using one of the five provided category labels: "Local Development", "Education", "Technology", "Environment", "Community". If genuinely mixed, choose the dominant one.
- summary: one or two neutral sentences noting where coverage overlaps or disagrees.
- keyPoints: 3-6 short bullets of what this storyline's coverage establishes, where outlets conflict, and what remains unverified. Phrase as findings; NO opinions, NO adjectives like "shocking".
- openQuestions: 2-4 neutral questions a civic reader would still need answered about this storyline ("What we still don't know"). Fact-based and specific, NOT rhetorical.
- caseClosed: true ONLY when the storyline's latest dated reporting shows a final resolution (a decision made, a law passed or rejected, a case dismissed/settled); false while the story is still developing. When unsure, use false.
- timeline: a LONG chronological record of the storyline — one entry per genuinely DISTINCT dated development, so a well-covered storyline typically yields 4-12 entries covering every day its member articles brought something new (earliest first). Each entry MUST reuse the EXACT date ('YYYY-MM-DD') of the member article(s) it rests on: label = a concise factual name for that day's development; description = 1-2 factual sentences describing what happened that day and how the coverage reports it, drawn ONLY from the member headlines — never invent events. articleIds = the member articles that support that day's development (include all of them, so the timeline shows its sources). Events on the SAME date are SEPARATE entries — never merge two distinct developments into one note. Do NOT add a filler entry for a day when nothing new happened, and never recycle one event across multiple entries.
- Never invent articles: reference them ONLY by the numeric ids provided.
- Return STRICT JSON only matching the schema: {"groups":[{"title":string,"topic":string,"summary":string,"keyPoints":string[],"openQuestions":string[],"caseClosed":boolean,"timeline":[{"date":string,"label":string,"description":string,"articleIds":number[]}],"articleIds":number[]}]}`

export interface GroqArticlePayload {
  id: number
  publisher: string
  title: string
  date: string
}

/**
 * Parse and validate a client grouping payload (untrusted). Returns either
 * the validated headlines or an error message string. Every article is
 * re-id'd 1..n server-side so a client can never smuggle a forged id.
 */
export function parseGroqPayload(body: unknown): string | GroqArticlePayload[] {
  const articlesRaw = (body as { articles?: unknown } | null)?.articles
  if (!Array.isArray(articlesRaw) || articlesRaw.length === 0 || articlesRaw.length > 75) {
    return 'Expected articles: 1..75 headlines.'
  }
  const articles = (articlesRaw as unknown[]).map((a, i) => ({
    id: i + 1,
    publisher:
      typeof (a as { publisher?: unknown }).publisher === 'string'
        ? (a as { publisher: string }).publisher
        : '',
    title:
      typeof (a as { title?: unknown }).title === 'string' ? (a as { title: string }).title : '',
    date:
      typeof (a as { date?: unknown }).date === 'string' ? (a as { date: string }).date : '',
  }))
  if (articles.some((a) => !a.title)) {
    return 'Every article needs a title.'
  }
  return articles
}

/** Render the numbered headline list the user prompt embeds. */
export function renderHeadlineList(articles: GroqArticlePayload[]): string {
  return articles
    .map((a) => `${a.id}. [${a.date || 'undated'}] ${a.publisher || 'unknown'} — ${a.title}`)
    .join('\n')
}

/**
 * Upstream Chat Completions body: fixed model/system-prompt/schema; only
 * the payload varies. reasoning_effort 'low' and the large max_tokens cap
 * mirror the live-tested values (a 1024 cap truncated reasoning-model
 * content intermittently; see the comment history in vite.config.ts).
 */
export function buildGroqUpstreamBody(articles: GroqArticlePayload[]): string {
  return JSON.stringify({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: GROQ_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Group these ${articles.length} headlines:\n\n${renderHeadlineList(articles)}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 32768,
    reasoning_effort: 'low',
    response_format: GROQ_GROUPS_SCHEMA,
  })
}
