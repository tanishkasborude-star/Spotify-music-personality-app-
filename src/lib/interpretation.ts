import type { PersonalityResult } from '../types'

export async function requestInterpretation(result: PersonalityResult): Promise<string> {
  const response = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      archetype: result.primary.name,
      tagline: result.primary.tagline,
      genres: result.topGenres,
      signals: result.primary.signals,
    }),
  })
  if (!response.ok) throw new Error('AI copy is not configured. Showing the local explanation instead.')
  const data = await response.json()
  if (typeof data.copy !== 'string' || !data.copy.trim()) {
    throw new Error('AI copy was unavailable. Showing the local explanation instead.')
  }
  return data.copy.trim()
}
