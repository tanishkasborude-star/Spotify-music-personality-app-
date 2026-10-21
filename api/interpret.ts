interface CopyRequest {
  archetype?: unknown
  tagline?: unknown
  genres?: unknown
  signals?: unknown
}

interface RequestLike {
  method?: string
  body: unknown
}

interface ResponseLike {
  status(statusCode: number): { json(body: Record<string, string>): unknown }
}

const reply = (response: ResponseLike, status: number, body: Record<string, string>) =>
  response.status(status).json(body)

/**
 * Provider-neutral Vercel function. Configure COPY_PROVIDER_URL to an
 * OpenAI-compatible chat-completions endpoint; key/model stay server-side.
 */
export default async function handler(request: RequestLike, response: ResponseLike) {
  if (request.method !== 'POST') return reply(response, 405, { error: 'Method not allowed' })
  const endpoint = process.env.COPY_PROVIDER_URL
  const apiKey = process.env.COPY_PROVIDER_API_KEY
  if (!endpoint || !apiKey) return reply(response, 503, { error: 'AI copy is not configured' })

  let input: CopyRequest
  try {
    const parsed: unknown = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return reply(response, 400, { error: 'Invalid request body' })
    }
    input = parsed as CopyRequest
  } catch {
    return reply(response, 400, { error: 'Invalid JSON body' })
  }
  const archetype = typeof input.archetype === 'string' ? input.archetype.slice(0, 80) : ''
  const tagline = typeof input.tagline === 'string' ? input.tagline.slice(0, 120) : ''
  const genres = Array.isArray(input.genres)
    ? input.genres.filter((value): value is string => typeof value === 'string').slice(0, 3).map((value) => value.slice(0, 50))
    : []
  const signals = Array.isArray(input.signals)
    ? input.signals.filter((value): value is string => typeof value === 'string').slice(0, 3).map((value) => value.slice(0, 50))
    : []
  if (!archetype) return reply(response, 400, { error: 'Missing archetype' })

  try {
    const providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.COPY_MODEL || 'your-model',
        temperature: 0.65,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content: 'Write a warm, specific 1–2 sentence music personality interpretation. Do not make psychological or factual claims. Do not mention AI. Avoid clichés.',
          },
          {
            role: 'user',
            content: JSON.stringify({ archetype, tagline, genres, signals }),
          },
        ],
      }),
    })
    if (!providerResponse.ok) return reply(response, 502, { error: 'Copy provider request failed' })
    const result = await providerResponse.json() as { choices?: { message?: { content?: unknown } }[] }
    const copy = result.choices?.[0]?.message?.content
    if (typeof copy !== 'string' || !copy.trim()) return reply(response, 502, { error: 'Copy provider returned no text' })
    return reply(response, 200, { copy: copy.slice(0, 500) })
  } catch {
    return reply(response, 502, { error: 'Copy provider unavailable' })
  }
}
