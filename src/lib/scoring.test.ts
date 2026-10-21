import { describe, expect, it } from 'vitest'
import { ARCHETYPE_COUNT, scoreListening } from './scoring'
import type { ListeningData } from '../types'

const sample: ListeningData = {
  artists: [
    { id: '1', name: 'Moon', genres: ['dream pop', 'shoegaze'], popularity: 45 },
    { id: '2', name: 'Echo', genres: ['dream pop', 'indie'], popularity: 55 },
  ],
  followedArtists: [],
  followedArtistsTotal: 0,
  tracks: [
    { id: 'a', name: 'Slow Orbit', artists: [{ id: '1', name: 'Moon' }], popularity: 60 },
  ],
  recentTracks: [
    { id: 'b', name: 'Afterglow', artists: [{ id: '2', name: 'Echo' }], popularity: 50 },
  ],
  recentTracksBefore: undefined,
  savedTracks: [],
  savedTracksTotal: 0,
  playlistTracks: [],
  playlists: [],
  playlistTotal: 0,
  dataWarnings: [],
}

describe('scoreListening', () => {
  it('returns a stable result and explainable genre signals', () => {
    const first = scoreListening(sample)
    expect(scoreListening(sample)).toEqual(first)
    expect(first.primary.name).toBe('The Night Driver')
    expect(first.primary.signals).toContain('dream pop')
    expect(first.topGenres).toContain('dream pop')
    expect(first.topTracks).toContain('Afterglow')
  })

  it('returns all archetypes with normalized scores totaling 100', () => {
    const result = scoreListening(sample)
    expect(result.scores).toHaveLength(ARCHETYPE_COUNT)
    expect(result.scores.reduce((total, item) => total + item.score, 0)).toBe(100)
    expect(result.primary.score).toBeGreaterThanOrEqual(result.scores[1].score)
  })

  it('provides a deterministic fallback for a genre-light account', () => {
    const result = scoreListening({
      artists: [],
      followedArtists: [],
      followedArtistsTotal: 0,
      tracks: [],
      recentTracks: [],
      recentTracksBefore: undefined,
      savedTracks: [],
      savedTracksTotal: 0,
      playlistTracks: [],
      playlists: [],
      playlistTotal: 0,
      dataWarnings: [],
    })
    expect(result.primary.name).toBeTruthy()
    expect(result.primary.signals).toEqual(['your listening mix'])
    expect(result.scores.reduce((total, item) => total + item.score, 0)).toBe(100)
  })

  it('uses followed-artist genres and saved tracks when building the portrait', () => {
    const result = scoreListening({
      ...sample,
      artists: [],
      followedArtists: [{ id: '3', name: 'Haze', genres: ['ambient'], popularity: 40 }],
      tracks: [],
      recentTracks: [],
      recentTracksBefore: undefined,
      savedTracks: [{ id: 'c', name: 'Drift', artists: [{ id: '3', name: 'Haze' }], popularity: 35 }],
      playlistTracks: [],
    })
    expect(result.topArtists).toEqual(['Haze'])
    expect(result.topTracks).toContain('Drift')
    expect(result.topGenres).toContain('ambient')
  })

  it('includes loaded playlist tracks in the portrait', () => {
    const result = scoreListening({
      ...sample,
      tracks: [],
      recentTracks: [],
      savedTracks: [],
      playlistTracks: [{ id: 'playlist-track', name: 'Deep Cut', artists: [{ id: '3', name: 'Haze' }], popularity: 30 }],
    })
    expect(result.topTracks).toContain('Deep Cut')
  })
})
