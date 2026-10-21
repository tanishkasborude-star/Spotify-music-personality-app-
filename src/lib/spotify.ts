import type {
  ListeningData,
  SpotifyArtist,
  SpotifyArtistPage,
  SpotifyPlaylist,
  SpotifyPlaylistPage,
  SpotifyPlaylistTrackPage,
  SpotifyRecentTracksPage,
  SpotifyTrack,
  SpotifyTrackPage,
} from '../types'

const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_URL = 'https://api.spotify.com/v1'
const SCOPES = [
  'user-top-read',
  'user-read-recently-played',
  'user-library-read',
  'user-follow-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
]
const SESSION_KEY = 'soundprint.spotify.session'
const VERIFIER_KEY = 'soundprint.spotify.verifier'
const STATE_KEY = 'soundprint.spotify.state'
const SESSION_VERSION = 3

interface SpotifySession {
  accessToken: string
  expiresAt: number
  refreshToken?: string
  version: number
}

interface SpotifyPage<T> {
  items: T[]
  total?: number
}

export async function fetchRecommendations(
  genres: string[],
  knownTracks: SpotifyTrack[],
  preferredArtists: string[] = [],
): Promise<SpotifyTrack[]> {
  const genreSeeds = [...new Set(genres.map((genre) => genre.trim()).filter(Boolean))]
    .slice(0, 3)
    .map((genre) => ({ query: `genre:"${genre}"`, signal: genre, isGenre: true }))
  const artistSeeds = [...new Set(preferredArtists.map((artist) => artist.trim()).filter(Boolean))]
    .slice(0, 2)
    .map((artist) => ({ query: `artist:"${artist}"`, signal: artist, isGenre: false }))
  const seeds = [...genreSeeds, ...artistSeeds]
  if (!seeds.length) return []
  const knownIds = new Set(knownTracks.map((track) => track.id))
  const responses = await Promise.allSettled(seeds.map(async (seed) => {
    const query = new URLSearchParams({ q: seed.query, type: 'track', limit: '20' })
    const result = await spotifyGet<{ tracks: { items: SpotifyTrack[] } }>(`/search?${query}`)
    return (result.tracks?.items ?? []).map((track) => ({
      ...track,
      recommendationGenres: seed.isGenre ? [seed.signal] : [],
      recommendationSignals: [seed.isGenre ? `genre · ${seed.signal}` : `artist · ${seed.signal}`],
    }))
  }))
  const tracksById = new Map<string, SpotifyTrack>()
  const failures: string[] = []
  for (const response of responses) {
    if (response.status === 'rejected') {
      failures.push(response.reason instanceof Error ? response.reason.message : 'Spotify search failed.')
      continue
    }
    for (const track of response.value) {
      if (!knownIds.has(track.id)) {
        const existing = tracksById.get(track.id)
        tracksById.set(track.id, existing
          ? {
            ...existing,
            recommendationGenres: [...new Set([...(existing.recommendationGenres ?? []), ...(track.recommendationGenres ?? [])])],
            recommendationSignals: [...new Set([...(existing.recommendationSignals ?? []), ...(track.recommendationSignals ?? [])])],
          }
          : track)
      }
    }
  }
  if (!tracksById.size && failures.length) {
    throw new Error(`Spotify could not find recommendations from your listening genres. ${failures[0]}`)
  }
  return [...tracksById.values()]
    .sort((left, right) => (right.popularity ?? 0) - (left.popularity ?? 0))
    .slice(0, 12)
}

export async function playSpotifyTrack(track: SpotifyTrack) {
  if (!track.uri) throw new Error('Spotify did not provide a playable track link.')
  await spotifyRequest('/me/player/play', 'PUT', { uris: [track.uri] })
}

export async function toggleSpotifyPlayback() {
  const session = await spotifySession()
  const response = await fetch(`${API_URL}/me/player`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
  if (response.status === 204) throw new Error('No active Spotify device was found. Open Spotify on a device and try again.')
  if (response.status === 403) throw new Error('Spotify playback controls require Premium and an active Spotify device.')
  if (response.status === 404) throw new Error('No active Spotify device was found. Open Spotify on a device and try again.')
  if (!response.ok) throw new Error(`Spotify playback status failed (${response.status}).`)
  const player = await response.json() as { is_playing: boolean }
  await spotifyRequest(player.is_playing ? '/me/player/pause' : '/me/player/play', 'PUT')
}

interface SpotifyPlaylistItem {
  item?: SpotifyTrack | null
  track?: SpotifyTrack | null
}

interface SpotifySavedTrack {
  track?: SpotifyTrack | null
}

interface SpotifyFollowedArtists {
  artists: SpotifyPage<SpotifyArtist> & { cursors?: { after?: string } }
}

interface SpotifyPlaylistResponse {
  id: string
  name: string
  owner?: { display_name?: string }
  tracks?: { total?: number }
  items?: { total?: number }
  external_urls?: { spotify?: string }
}

interface SpotifyRecentTracksResponse {
  items: { track: SpotifyTrack }[]
  cursors?: { before?: string }
}

function normalizePlaylist(playlist: SpotifyPlaylistResponse): SpotifyPlaylist {
  return {
    id: playlist.id,
    name: playlist.name,
    trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
    ownerName: playlist.owner?.display_name,
    spotifyUrl: playlist.external_urls?.spotify,
  }
}

function settledValue<T>(
  result: PromiseSettledResult<T>,
  label: string,
  fallback: T,
  warnings: string[],
): T {
  if (result.status === 'fulfilled') return result.value
  const message = result.reason instanceof Error ? result.reason.message : 'An unknown error occurred.'
  warnings.push(`${label}: ${message}`)
  return fallback
}

function clientId() {
  return import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() ?? ''
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256(value: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

function redirectUri() {
  return import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim() || `${location.origin}${location.pathname}`
}

export function isSpotifyConfigured() {
  return Boolean(clientId())
}

export function hasSpotifySession() {
  const stored = sessionStorage.getItem(SESSION_KEY)
  if (!stored) return false
  try {
    const session = JSON.parse(stored) as SpotifySession
    if (session.version !== SESSION_VERSION || session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return false
    }
    return true
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return false
  }
}

export async function beginSpotifyLogin() {
  if (!clientId()) throw new Error('Spotify sign-in is not enabled for this Soundprint app yet.')
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64))
  const verifier = base64Url(verifierBytes)
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)))
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: await sha256(verifier),
    state,
  })
  location.assign(`${AUTH_URL}?${params}`)
}

export async function finishSpotifyLogin(): Promise<boolean> {
  const url = new URL(location.href)
  const code = url.searchParams.get('code')
  if (!code) {
    const error = url.searchParams.get('error')
    if (error) {
      cleanCallbackUrl()
      throw new Error(error === 'access_denied' ? 'Spotify connection was cancelled.' : `Spotify sign-in error: ${error}`)
    }
    return false
  }
  const state = url.searchParams.get('state')
  const expectedState = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  cleanCallbackUrl()
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  if (!state || !expectedState || state !== expectedState || !verifier) {
    throw new Error('Spotify sign-in could not be verified. Please try connecting again.')
  }
  const body = new URLSearchParams({
    client_id: clientId(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  })
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) throw new Error('Spotify could not complete sign-in. Please reconnect and try again.')
  const tokens = await response.json()
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      refreshToken: tokens.refresh_token,
      version: SESSION_VERSION,
    } satisfies SpotifySession),
  )
  return true
}

function cleanCallbackUrl() {
  const url = new URL(location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('error')
  history.replaceState({}, document.title, url.pathname + url.hash)
}

export function clearSpotifySession() {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
}

async function spotifySession(): Promise<SpotifySession> {
  let session: SpotifySession
  try {
    session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as SpotifySession
  } catch {
    throw new Error('Your Spotify session expired. Please reconnect.')
  }
  if (!session?.accessToken || session.version !== SESSION_VERSION) {
    clearSpotifySession()
    throw new Error('Your Spotify session expired. Please reconnect.')
  }
  if (session.expiresAt <= Date.now() + 30_000) {
    if (!session.refreshToken) {
      clearSpotifySession()
      throw new Error('Your Spotify session expired. Please reconnect.')
    }
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId(),
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
      }),
    })
    if (!response.ok) {
      clearSpotifySession()
      throw new Error('Spotify could not refresh your session. Please reconnect.')
    }
    const tokens = await response.json() as {
      access_token: string
      expires_in: number
      refresh_token?: string
    }
    session = {
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      version: SESSION_VERSION,
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }
  return session
}

async function spotifyGet<T>(path: string): Promise<T> {
  const session = await spotifySession()
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
  if (response.status === 401) {
    clearSpotifySession()
    throw new Error('Spotify needs you to reconnect before we can continue.')
  }
  if (response.status === 429) throw new Error('Spotify is rate-limiting requests. Please wait a moment and try again.')
  if (response.status === 403) {
    throw new Error('Spotify denied access to part of your library. Reconnect and approve the requested permissions, then check your Spotify app access settings.')
  }
  if (!response.ok) throw new Error(`Spotify request failed (${response.status}). Please try again.`)
  return response.json() as Promise<T>
}

async function spotifyRequest(path: string, method: 'PUT' | 'POST', body?: unknown) {
  const session = await spotifySession()
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (response.status === 401) {
    clearSpotifySession()
    throw new Error('Spotify needs you to reconnect before we can continue.')
  }
  if (response.status === 403) throw new Error('Spotify playback controls require Premium and an active Spotify device.')
  if (response.status === 404) throw new Error('No active Spotify device was found. Open Spotify on a device and try again.')
  if (response.status === 429) throw new Error('Spotify is rate-limiting requests. Please wait a moment and try again.')
  if (!response.ok && response.status !== 204) throw new Error(`Spotify playback failed (${response.status}).`)
}

export async function fetchListeningData(): Promise<ListeningData> {
  const [artistsResult, tracksResult, recentResult, followedResult, savedResult, playlistsResult] = await Promise.allSettled([
    spotifyGet<{ items: SpotifyArtist[] }>('/me/top/artists?limit=50&time_range=medium_term'),
    spotifyGet<{ items: SpotifyTrack[] }>('/me/top/tracks?limit=50&time_range=medium_term'),
    fetchRecentTracksPage(),
    fetchFollowedArtistsPage(),
    fetchSavedTracksPage(0),
    fetchPlaylistsPage(0),
  ])
  const dataWarnings: string[] = []
  const artists = settledValue(artistsResult, 'Top artists', { items: [] }, dataWarnings)
  const tracks = settledValue(tracksResult, 'Top tracks', { items: [] }, dataWarnings)
  const recent = settledValue(recentResult, 'Recent plays', { items: [] }, dataWarnings)
  const followed = settledValue(followedResult, 'Followed artists', { items: [], total: 0 }, dataWarnings)
  const saved = settledValue(savedResult, 'Saved tracks', { items: [], total: 0 }, dataWarnings)
  const playlists = settledValue(playlistsResult, 'Playlists', { items: [], total: 0 }, dataWarnings)
  if (dataWarnings.length === 6) {
    throw new Error(`Spotify returned no listening data. ${dataWarnings.join(' ')}`)
  }
  return {
    artists: artists.items ?? [],
    followedArtists: followed.items,
    followedArtistsTotal: followed.total,
    followedArtistsAfter: followed.next,
    tracks: tracks.items ?? [],
    recentTracks: recent.items,
    recentTracksBefore: recent.before,
    savedTracks: saved.items,
    savedTracksTotal: saved.total,
    playlistTracks: [],
    playlists: playlists.items,
    playlistTotal: playlists.total,
    dataWarnings,
  }
}

export async function fetchRecentTracksPage(before?: string): Promise<SpotifyRecentTracksPage> {
  const query = new URLSearchParams({ limit: '50' })
  if (before) query.set('before', before)
  const page = await spotifyGet<SpotifyRecentTracksResponse>(`/me/player/recently-played?${query}`)
  return {
    items: (page.items ?? []).map(({ track }) => track),
    before: page.cursors?.before,
  }
}

export async function fetchFollowedArtistsPage(after?: string): Promise<SpotifyArtistPage> {
  const query = new URLSearchParams({ type: 'artist', limit: '50' })
  if (after) query.set('after', after)
  const page = await spotifyGet<SpotifyFollowedArtists>(`/me/following?${query}`)
  return {
    items: page.artists.items ?? [],
    total: page.artists.total ?? page.artists.items?.length ?? 0,
    next: page.artists.cursors?.after,
  }
}

export async function fetchSavedTracksPage(offset: number): Promise<SpotifyTrackPage> {
  const page = await spotifyGet<{ items: SpotifySavedTrack[]; total?: number }>(
    `/me/tracks?limit=50&offset=${Math.max(0, Math.floor(offset))}`,
  )
  return {
    items: (page.items ?? []).flatMap(({ track }) => track ? [track] : []),
    total: page.total ?? page.items?.length ?? 0,
  }
}

export async function fetchPlaylistsPage(offset: number): Promise<SpotifyPlaylistPage> {
  const page = await spotifyGet<SpotifyPage<SpotifyPlaylistResponse>>(
    `/me/playlists?limit=50&offset=${Math.max(0, Math.floor(offset))}`,
  )
  return {
    items: (page.items ?? []).map(normalizePlaylist),
    total: page.total ?? page.items?.length ?? 0,
  }
}

export async function fetchPlaylistTracksPage(
  playlistId: string,
  offset: number,
): Promise<SpotifyPlaylistTrackPage> {
  const page = await spotifyGet<{ items: SpotifyPlaylistItem[]; total?: number }>(
    `/playlists/${encodeURIComponent(playlistId)}/items?limit=50&offset=${Math.max(0, Math.floor(offset))}`,
  )
  return {
    items: (page.items ?? []).flatMap(({ item, track }) => {
      const playable = item ?? track
      return playable && playable.id ? [playable] : []
    }),
    total: page.total ?? page.items?.length ?? 0,
  }
}
