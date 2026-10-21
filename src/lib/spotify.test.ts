import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchListeningData, fetchPlaylistTracksPage, fetchRecentTracksPage, fetchRecommendations, fetchSavedTracksPage } from './spotify'

const SESSION_KEY = 'soundprint.spotify.session'
const values = new Map<string, string>()
const mockSessionStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
}

function authorizeMockRequests() {
  values.set(SESSION_KEY, JSON.stringify({
    accessToken: 'test-token',
    expiresAt: Date.now() + 60_000,
    version: 3,
    refreshToken: 'test-refresh-token',
  }))
  vi.stubGlobal('sessionStorage', mockSessionStorage)
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  values.clear()
  vi.unstubAllGlobals()
})

describe('Spotify library integration', () => {
  it('collects top listening, follows, saved tracks, recent plays, and playlists', async () => {
    authorizeMockRequests()
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requested.push(url)
      if (url.includes('/me/top/artists')) return jsonResponse({ items: [{ id: 'artist-1', name: 'Artist', genres: ['indie'], popularity: 50 }] })
      if (url.includes('/me/top/tracks')) return jsonResponse({ items: [] })
      if (url.includes('/me/player/recently-played')) return jsonResponse({ items: [{ track: { id: 'recent-1', name: 'Recent', artists: [], popularity: 20 } }] })
      if (url.includes('/me/following')) return jsonResponse({ artists: { items: [{ id: 'followed-1', name: 'Followed', genres: ['ambient'], popularity: 30 }], total: 1, cursors: {} } })
      if (url.includes('/me/tracks')) return jsonResponse({ items: [{ track: { id: 'saved-1', name: 'Saved', artists: [], popularity: 40 } }], total: 1 })
      if (url.includes('/me/playlists')) return jsonResponse({ items: [{ id: 'playlist-1', name: 'Night Mix', tracks: { total: 12 }, external_urls: { spotify: 'https://open.spotify.com/playlist/playlist-1' } }], total: 1 })
      throw new Error(`Unexpected request: ${url}`)
    }))

    const data = await fetchListeningData()
    expect(data.artists[0].name).toBe('Artist')
    expect(data.followedArtists[0].name).toBe('Followed')
    expect(data.savedTracks[0].name).toBe('Saved')
    expect(data.recentTracks[0].name).toBe('Recent')
    expect(data.playlists[0]).toMatchObject({ name: 'Night Mix', trackCount: 12 })
    expect(data.playlistTotal).toBe(1)
    expect(requested).toEqual(expect.arrayContaining([
      expect.stringContaining('/me/following?type=artist&limit=50'),
      expect.stringContaining('/me/tracks?limit=50&offset=0'),
      expect.stringContaining('/me/playlists?limit=50&offset=0'),
    ]))
    expect(requested.some((url) => url.includes('/playlists/'))).toBe(false)
  })

  it('loads playlist contents in pages and safely handles unavailable tracks', async () => {
    authorizeMockRequests()
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requested.push(String(input))
      return jsonResponse({
        items: [
          { item: { id: 'track-1', name: 'First', artists: [], popularity: 10 } },
          { track: { id: 'track-2', name: 'Second', artists: [], popularity: 20 } },
          { item: null },
        ],
        total: 103,
      })
    }))

    const page = await fetchPlaylistTracksPage('playlist/id', 50)
    expect(page.items.map((track) => track.name)).toEqual(['First', 'Second'])
    expect(page.total).toBe(103)
    expect(requested[0]).toContain('/playlists/playlist%2Fid/items?limit=50&offset=50')
  })

  it('pages older listening history using Spotify cursors', async () => {
    authorizeMockRequests()
    let requestedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input)
      return jsonResponse({
        items: [{ track: { id: 'older-1', name: 'Older play', artists: [], popularity: 10 } }],
        cursors: { before: '1730000000000' },
      })
    }))
    const page = await fetchRecentTracksPage('1740000000000')
    expect(page.items[0].name).toBe('Older play')
    expect(page.before).toBe('1730000000000')
    expect(requestedUrl).toContain('/me/player/recently-played?limit=50&before=1740000000000')
  })

  it('surfaces permission failures instead of returning an empty library', async () => {
    authorizeMockRequests()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'forbidden' }, 403)))
    await expect(fetchSavedTracksPage(0)).rejects.toThrow('Spotify denied access to part of your library')
  })

  it('keeps usable sources when one permissioned library endpoint fails', async () => {
    authorizeMockRequests()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/me/tracks')) return jsonResponse({ error: 'forbidden' }, 403)
      if (url.includes('/me/top/artists')) return jsonResponse({ items: [{ id: 'artist-1', name: 'Artist', genres: ['indie'], popularity: 50 }] })
      if (url.includes('/me/top/tracks')) return jsonResponse({ items: [] })
      if (url.includes('/me/player/recently-played')) return jsonResponse({ items: [] })
      if (url.includes('/me/following')) return jsonResponse({ artists: { items: [], total: 0, cursors: {} } })
      if (url.includes('/me/playlists')) return jsonResponse({ items: [], total: 0 })
      throw new Error(`Unexpected request: ${url}`)
    }))

    const data = await fetchListeningData()
    expect(data.artists).toHaveLength(1)
    expect(data.dataWarnings).toHaveLength(1)
    expect(data.dataWarnings[0]).toContain('Saved tracks')
  })

  it('reports an error when no Spotify listening source is available', async () => {
    authorizeMockRequests()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'forbidden' }, 403)))
    await expect(fetchListeningData()).rejects.toThrow('Spotify returned no listening data')
  })

  it('searches top genres and excludes tracks already in listening history', async () => {
    authorizeMockRequests()
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requested.push(url)
      const query = new URL(url).searchParams.get('q') ?? ''
      const genre = query.includes('dream') ? 'dream pop' : 'indie'
      return jsonResponse({
        tracks: {
          items: [
            { id: 'new-track', name: `${genre} discovery`, artists: [{ id: 'artist-new', name: 'New Artist' }], popularity: 82, uri: 'spotify:track:new-track' },
            { id: 'known-track', name: 'Already liked', artists: [{ id: 'artist-old', name: 'Known Artist' }], popularity: 95 },
          ],
        },
      })
    }))
    const recommendations = await fetchRecommendations(
      ['dream pop', 'indie'],
      [{ id: 'known-track', name: 'Already liked', artists: [], popularity: 95 }],
      ['Beach House'],
    )
    expect(recommendations).toHaveLength(1)
    expect(recommendations[0].id).toBe('new-track')
    expect(recommendations[0].recommendationGenres).toContain('dream pop')
    expect(recommendations[0].recommendationSignals).toContain('artist · Beach House')
    expect(requested).toHaveLength(3)
    expect(requested.some((url) => new URL(url).searchParams.get('q') === 'artist:"Beach House"')).toBe(true)
  })

  it('refreshes the Spotify access token before making API requests', async () => {
    values.set(SESSION_KEY, JSON.stringify({
      accessToken: 'expired-access-token',
      expiresAt: Date.now() + 1_000,
      refreshToken: 'valid-refresh-token',
      version: 3,
    }))
    vi.stubGlobal('sessionStorage', mockSessionStorage)
    const calls: { url: string; body?: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, body: init?.body ? String(init.body) : undefined })
      if (url.includes('/api/token')) return jsonResponse({ access_token: 'fresh-access-token', expires_in: 3600 })
      return jsonResponse({ items: [], total: 0 })
    }))

    await fetchSavedTracksPage(0)
    expect(calls[0].url).toContain('/api/token')
    expect(calls[0].body).toContain('refresh_token=valid-refresh-token')
    expect(calls[1].url).toContain('/me/tracks')
    expect(values.get(SESSION_KEY)).toContain('fresh-access-token')
  })
})
