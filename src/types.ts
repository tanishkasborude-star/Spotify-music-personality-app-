export interface SpotifyArtist {
  id: string
  name: string
  genres: string[]
  popularity: number
  images?: { url: string; width?: number | null; height?: number | null }[]
  external_urls?: { spotify?: string }
}

export interface SpotifyTrack {
  id: string
  name: string
  popularity: number
  artists: { id: string; name: string }[]
  album?: {
    name?: string
    images?: { url: string; width?: number | null; height?: number | null }[]
    external_urls?: { spotify?: string }
  }
  external_urls?: { spotify?: string }
  uri?: string
  preview_url?: string | null
  recommendationGenres?: string[]
  recommendationSignals?: string[]
}

export interface SpotifyPlaylist {
  id: string
  name: string
  trackCount: number
  ownerName?: string
  spotifyUrl?: string
}

export interface SpotifyPlaylistPage {
  items: SpotifyPlaylist[]
  total: number
}

export interface SpotifyPlaylistTrackPage {
  items: SpotifyTrack[]
  total: number
}

export interface SpotifyArtistPage {
  items: SpotifyArtist[]
  total: number
  next?: string
}

export interface SpotifyTrackPage {
  items: SpotifyTrack[]
  total: number
}

export interface SpotifyRecentTracksPage {
  items: SpotifyTrack[]
  before?: string
}

export interface ListeningData {
  artists: SpotifyArtist[]
  followedArtists: SpotifyArtist[]
  followedArtistsTotal: number
  followedArtistsAfter?: string
  tracks: SpotifyTrack[]
  recentTracks: SpotifyTrack[]
  recentTracksBefore?: string
  savedTracks: SpotifyTrack[]
  savedTracksTotal: number
  playlistTracks: SpotifyTrack[]
  playlists: SpotifyPlaylist[]
  playlistTotal: number
  dataWarnings: string[]
  displayName?: string
}

export interface Archetype {
  id: string
  name: string
  tagline: string
  description: string
  color: string
  emoji: string
  signals: string[]
  score: number
}

export interface PersonalityResult {
  primary: Archetype
  scores: Archetype[]
  topGenres: string[]
  topArtists: string[]
  topTracks: string[]
  explanation: string
}
