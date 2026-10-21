import type { Archetype, ListeningData, PersonalityResult } from '../types'

type ArchetypeRule = Omit<Archetype, 'score' | 'signals'> & {
  keywords: string[]
  popularity?: 'high' | 'low'
}

const RULES: ArchetypeRule[] = [
  {
    id: 'night-driver',
    name: 'The Night Driver',
    tagline: 'Headphones on. World off.',
    description: 'You gravitate toward atmospheric sounds with a little mystery in the mix.',
    color: '#c7b5ff',
    emoji: '☾',
    keywords: ['darkwave', 'shoegaze', 'dream pop', 'trip hop', 'post-punk', 'ambient', 'synthwave', 'downtempo', 'indie'],
  },
  {
    id: 'soft-focus',
    name: 'The Soft Focus',
    tagline: 'A softer kind of feeling.',
    description: 'Warm, intimate music gives your listening its gentle center of gravity.',
    color: '#ffb9a7',
    emoji: '♡',
    keywords: ['acoustic', 'folk', 'singer-songwriter', 'bedroom pop', 'soul', 'jazz', 'bossa nova', 'indie folk', 'r&b'],
    popularity: 'low',
  },
  {
    id: 'pulse-chaser',
    name: 'The Pulse Chaser',
    tagline: 'Find the beat. Follow it.',
    description: 'Rhythm leads the way: your listening is built for movement and momentum.',
    color: '#ff6d7d',
    emoji: '↗',
    keywords: ['dance', 'house', 'techno', 'edm', 'disco', 'electronic', 'trance', 'drum and bass', 'dnb', 'hyperpop', 'pop'],
    popularity: 'high',
  },
  {
    id: 'deep-diver',
    name: 'The Deep Diver',
    tagline: 'There’s always another layer.',
    description: 'You like music that rewards a closer listen and takes the scenic route.',
    color: '#89d2ff',
    emoji: '⌁',
    keywords: ['progressive', 'post-rock', 'experimental', 'psychedelic', 'art rock', 'avant-garde', 'classical', 'metal', 'ambient'],
    popularity: 'low',
  },
  {
    id: 'daylight-optimist',
    name: 'The Daylight Optimist',
    tagline: 'A little more sunlight, please.',
    description: 'Bright hooks and open-hearted energy keep finding their way into your rotation.',
    color: '#ffe276',
    emoji: '☀',
    keywords: ['pop', 'funk', 'reggae', 'soul', 'disco', 'afrobeats', 'latin', 'country', 'ska'],
    popularity: 'high',
  },
  {
    id: 'leftfield-explorer',
    name: 'The Leftfield Explorer',
    tagline: 'Familiar is a starting point.',
    description: 'Curiosity pulls you toward unexpected corners, scenes, and sounds.',
    color: '#aff0b6',
    emoji: '✳',
    keywords: ['experimental', 'world', 'afrobeat', 'jazz fusion', 'noise', 'underground', 'global', 'alternative', 'independent', 'hyperpop'],
    popularity: 'low',
  },
  {
    id: 'story-keeper',
    name: 'The Story Keeper',
    tagline: 'Every song means something.',
    description: 'Songs with a voice, a point of view, or a story tend to stay with you.',
    color: '#ffc979',
    emoji: '✎',
    keywords: ['country', 'folk', 'singer-songwriter', 'rap', 'hip hop', 'poetry', 'blues', 'gospel', 'indie rock', 'story'],
  },
  {
    id: 'ritualist',
    name: 'The Ritualist',
    tagline: 'Some things are worth repeating.',
    description: 'You find comfort in a sound you can return to—and know by heart.',
    color: '#f0a8e5',
    emoji: '⟳',
    keywords: ['classic rock', 'rock', 'metal', 'punk', 'reggaeton', 'k-pop', 'r&b', 'motown', 'oldies', 'pop'],
    popularity: 'high',
  },
]

const words = (value: string) =>
  value.toLowerCase().replace(/[^\p{L}\p{N}&+\s-]/gu, '').trim()

/**
 * Explainable rule-based profile: each artist/genre pair contributes 2 points
 * when it matches, each matching archetype keyword adds 1 point, and popularity
 * nudges selected archetypes by at most 3 points.
 */
export function scoreListening(data: ListeningData): PersonalityResult {
  const tasteArtists = [...data.artists, ...data.followedArtists]
  const artistGenrePairs = tasteArtists.flatMap((artist) =>
    artist.genres.map((genre) => ({ genre: words(genre), artist: artist.name })),
  ).filter(({ genre }) => Boolean(genre))
  const genres = artistGenrePairs.map(({ genre }) => genre).filter(Boolean)
  const genreCounts = new Map<string, number>()
  for (const genre of genres) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([genre]) => genre)

  const popularityValues = [...tasteArtists, ...data.tracks, ...data.savedTracks, ...data.playlistTracks]
    .map((item) => item.popularity)
    .filter((value) => Number.isFinite(value))
  const averagePopularity = popularityValues.length
    ? popularityValues.reduce((sum, value) => sum + value, 0) / popularityValues.length
    : 50

  const scores = RULES.map((rule) => {
    const matches = rule.keywords.filter((keyword) => {
      const key = words(keyword)
      return genres.some((genre) => genre.includes(key) || key.includes(genre))
    })
    const artistMatches = artistGenrePairs.filter(({ genre }) =>
      rule.keywords.some((keyword) => {
        const key = words(keyword)
        return genre.includes(key) || key.includes(genre)
      }),
    ).length
    const popularityNudge =
      rule.popularity === 'high'
        ? Math.min(3, Math.max(0, (averagePopularity - 50) / 10))
        : rule.popularity === 'low'
          ? Math.min(3, Math.max(0, (50 - averagePopularity) / 10))
          : 0
    const raw = artistMatches * 2 + matches.length + popularityNudge
    const signals = matches.slice(0, 3)
    return {
      id: rule.id,
      name: rule.name,
      tagline: rule.tagline,
      description: rule.description,
      color: rule.color,
      emoji: rule.emoji,
      score: raw,
      signals,
    }
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  // Empty/genre-light listening histories still get a stable, clearly-qualified result.
  if (scores[0].score === 0) {
    const fallbackIndex = data.artists.length % RULES.length
    const [fallback] = scores.splice(fallbackIndex, 1)
    fallback.score = 1
    fallback.signals = ['your listening mix']
    scores.unshift(fallback)
  }

  const total = scores.reduce((sum, item) => sum + item.score, 0) || 1
  const normalized = scores.map((item) => ({
    ...item,
    score: Math.round((item.score / total) * 100),
  }))
  // Keep the displayed scores summing to 100 despite rounding.
  const roundedTotal = normalized.reduce((sum, item) => sum + item.score, 0)
  normalized[0].score += 100 - roundedTotal
  const primary = normalized[0]
  const artistNames = [...new Set((data.artists.length ? data.artists : data.followedArtists).slice(0, 3).map((artist) => artist.name))]
  const trackNames = [...new Set([
    ...data.tracks,
    ...data.recentTracks,
    ...data.savedTracks,
    ...data.playlistTracks,
  ].map((track) => track.name))].slice(0, 3)
  const strongestSignal = primary.signals[0] ?? topGenres[0] ?? 'your listening mix'
  const explanation = artistNames.length
    ? `${strongestSignal} shows up in your listening, with ${artistNames.slice(0, 2).join(' and ')} helping shape the picture.`
    : `Your listening has a ${primary.name.toLowerCase()} feel, led by ${strongestSignal}.`

  return {
    primary,
    scores: normalized,
    topGenres,
    topArtists: artistNames,
    topTracks: trackNames,
    explanation,
  }
}

export const ARCHETYPE_COUNT = RULES.length
