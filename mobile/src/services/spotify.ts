import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { spotifyClientId, spotifyRedirectUri } from '../config';
import type { SpotifyPlayback, Track } from '../types';

const tokenKey = 'spotify_token_data';
const legacyTokenKey = 'spotify_access_token';
const scopes = ['user-top-read', 'user-read-private', 'user-modify-playback-state', 'user-read-playback-state'];
const refreshLeewayMs = 60_000;

type SpotifyTokenData = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

let refreshInProgress: Promise<string> | null = null;

async function readTokenData(): Promise<SpotifyTokenData | null> {
  const read = async (key: string) => Platform.OS === 'web'
    ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(key))
    : SecureStore.getItemAsync(key);
  const stored = await read(tokenKey);
  if (!stored) {
    const legacyToken = await read(legacyTokenKey);
    if (!legacyToken) return null;
    const migrated = { accessToken: legacyToken };
    await writeTokenData(migrated);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(legacyTokenKey);
    } else {
      await SecureStore.deleteItemAsync(legacyTokenKey);
    }
    return migrated;
  }

  try {
    const value: unknown = JSON.parse(stored);
    if (
      typeof value === 'object' &&
      value !== null &&
      'accessToken' in value &&
      typeof value.accessToken === 'string'
    ) {
        return {
          accessToken: value.accessToken,
          refreshToken: 'refreshToken' in value && typeof value.refreshToken === 'string'
            ? value.refreshToken
            : undefined,
          expiresAt: 'expiresAt' in value && typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
            ? value.expiresAt
            : undefined,
        };
    }
  } catch {
    // Older builds stored only the access token as a plain string.
  }
  return { accessToken: stored };
}

async function writeTokenData(token: SpotifyTokenData): Promise<void> {
  const serialized = JSON.stringify(token);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(tokenKey, serialized);
    return;
  }
  await SecureStore.setItemAsync(tokenKey, serialized);
}

async function persistTokenResult(
  result: { accessToken: string; refreshToken?: string; expiresIn?: number },
  previousRefreshToken?: string,
): Promise<string> {
  const token: SpotifyTokenData = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? previousRefreshToken,
    expiresAt: Date.now() + (result.expiresIn ?? 3600) * 1000,
  };
  await writeTokenData(token);
  return token.accessToken;
}

async function refreshToken(refreshTokenValue: string, previousRefreshToken: string): Promise<string> {
  const result = await AuthSession.refreshAsync(
    { clientId: spotifyClientId, refreshToken: refreshTokenValue },
    { tokenEndpoint: 'https://accounts.spotify.com/api/token' },
  );
  if (!result.accessToken) throw new Error('Spotify could not refresh your session. Please reconnect.');
  return persistTokenResult(result, result.refreshToken ?? previousRefreshToken);
}

async function getUsableToken(forceRefresh = false): Promise<string | null> {
  const stored = await readTokenData();
  if (!stored) return null;

  const shouldRefresh = forceRefresh ||
    (stored.expiresAt !== undefined && stored.expiresAt <= Date.now() + refreshLeewayMs);
  if (!shouldRefresh) return stored.accessToken;
  if (!stored.refreshToken) {
    if (forceRefresh) {
      await clearSpotifyToken();
      throw new Error('Your Spotify session expired. Please reconnect.');
    }
    return stored.accessToken;
  }
  if (!spotifyClientId) throw new Error('Add EXPO_PUBLIC_SPOTIFY_CLIENT_ID in mobile/.env first.');

  if (!refreshInProgress) {
    refreshInProgress = refreshToken(stored.refreshToken, stored.refreshToken)
      .finally(() => {
        refreshInProgress = null;
      });
  }
  return refreshInProgress;
}

export async function getToken(): Promise<string | null> {
  return getUsableToken();
}

export async function clearSpotifyToken(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(legacyTokenKey);
    }
  } else {
    await SecureStore.deleteItemAsync(tokenKey);
    await SecureStore.deleteItemAsync(legacyTokenKey);
  }
}

export async function connectSpotify(): Promise<void> {
  if (!spotifyClientId) throw new Error('Add EXPO_PUBLIC_SPOTIFY_CLIENT_ID in mobile/.env first.');
  const redirectUri = spotifyRedirectUri || AuthSession.makeRedirectUri({ scheme: 'spotify-personality' });
  const request = new AuthSession.AuthRequest({
    clientId: spotifyClientId,
    redirectUri,
    scopes,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  await request.makeAuthUrlAsync({ authorizationEndpoint: 'https://accounts.spotify.com/authorize' });
  const result = await request.promptAsync({ authorizationEndpoint: 'https://accounts.spotify.com/authorize' });
  if (result.type !== 'success' || !result.params.code) {
    if (result.type === 'error') throw new Error(result.error?.description || 'Spotify sign-in failed.');
    return;
  }
  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId: spotifyClientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    { tokenEndpoint: 'https://accounts.spotify.com/api/token' },
  );
  if (!tokenResult.accessToken) throw new Error('Spotify did not return an access token.');
  await persistTokenResult(tokenResult);
}

async function spotifyFetch<T>(path: string, method = 'GET', body?: object): Promise<T> {
  let token = await getUsableToken();
  if (!token) throw new Error('Connect Spotify to load your listening data.');

  const makeRequest = (accessToken: string) => fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let response = await makeRequest(token);
  if (response.status === 401) {
    token = await getUsableToken(true);
    if (!token) throw new Error('Your Spotify session expired. Please reconnect.');
    response = await makeRequest(token);
  }
  if (!response.ok) throw new Error(`Spotify request failed (${response.status}).`);
  return (response.status === 204 ? {} : response.json()) as Promise<T>;
}

export async function getTopTracks(): Promise<Track[]> {
  const result = await spotifyFetch<{ items: Array<{ id: string; name: string; uri: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] } }> }>('/me/top/tracks?time_range=medium_term&limit=20');
  return result.items.map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    album: track.album.name,
    imageUrl: track.album.images[0]?.url,
    uri: track.uri,
  }));
}

export async function getRecommendedTrack(topTracks: Track[]): Promise<Track | null> {
  if (!topTracks.length) return null;
  // Uses recent top-listening data and Spotify Search rather than the restricted legacy
  // Recommendations endpoint, which may be unavailable to newly registered apps.
  const seed = topTracks[0];
  const query = encodeURIComponent(`artist:"${seed.artist.split(',')[0]}"`);
  try {
    const result = await spotifyFetch<{ tracks: { items: Array<{ id: string; name: string; uri: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] } }> } }>(`/search?type=track&limit=10&q=${query}`);
    const track = result.tracks.items.find((item) => !topTracks.some((top) => top.id === item.id)) ?? result.tracks.items[0];
    return track ? { id: track.id, name: track.name, artist: track.artists.map((a) => a.name).join(', '), album: track.album.name, imageUrl: track.album.images[0]?.url, uri: track.uri } : seed;
  } catch {
    return seed;
  }
}

export async function playTrack(track: Track): Promise<SpotifyPlayback> {
  try {
    const state = await spotifyFetch<{ device?: { id?: string }; is_playing?: boolean }>('/me/player');
    if (!state.device?.id) return 'no-device';
    await spotifyFetch('/me/player/play', 'PUT', { uris: track.uri ? [track.uri] : [] });
    return 'ready';
  } catch (error) {
    if (error instanceof Error && /403/.test(error.message)) return 'premium-required';
    return 'error';
  }
}

export async function togglePlayback(action: 'play' | 'pause'): Promise<SpotifyPlayback> {
  try {
    const endpoint = action === 'play' ? '/me/player/play' : '/me/player/pause';
    await spotifyFetch(endpoint, 'PUT');
    return 'ready';
  } catch (error) {
    if (error instanceof Error && /403/.test(error.message)) return 'premium-required';
    return 'error';
  }
}
