import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as AuthSession from 'expo-auth-session';
import { getTopTracks } from './spotify';

const values = new Map<string, string>();

vi.mock('expo-auth-session', () => ({
  ResponseType: { Code: 'code' },
  AuthRequest: class {},
  makeRedirectUri: vi.fn(),
  exchangeCodeAsync: vi.fn(),
  refreshAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { values.delete(key); }),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../config', () => ({ spotifyClientId: 'test-client', spotifyRedirectUri: '' }));

const response = (status: number, payload: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => payload,
});

describe('Spotify token renewal', () => {
  beforeEach(() => {
    values.clear();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('refreshes an expiring token and stores a rotated refresh token', async () => {
    values.set('spotify_token_data', JSON.stringify({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: Date.now() - 1,
    }));
    vi.mocked(AuthSession.refreshAsync).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
    } as AuthSession.TokenResponse);
    vi.mocked(fetch).mockResolvedValue(response(200, { items: [] }) as Response);

    await expect(getTopTracks()).resolves.toEqual([]);

    expect(AuthSession.refreshAsync).toHaveBeenCalledWith(
      { clientId: 'test-client', refreshToken: 'old-refresh' },
      { tokenEndpoint: 'https://accounts.spotify.com/api/token' },
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer new-access' },
    });
    expect(JSON.parse(values.get('spotify_token_data') ?? '{}')).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  it('renews after an unauthorized response and retries the Spotify request once', async () => {
    values.set('spotify_token_data', JSON.stringify({
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() + 3600_000,
    }));
    vi.mocked(AuthSession.refreshAsync).mockResolvedValue({
      accessToken: 'renewed-access',
      expiresIn: 3600,
    } as AuthSession.TokenResponse);
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(401, {}) as Response)
      .mockResolvedValueOnce(response(200, { items: [] }) as Response);

    await expect(getTopTracks()).resolves.toEqual([]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer expired-access' },
    });
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer renewed-access' },
    });
    expect(JSON.parse(values.get('spotify_token_data') ?? '{}')).toMatchObject({
      accessToken: 'renewed-access',
      refreshToken: 'valid-refresh',
    });
  });

  it('keeps stored credentials when a refresh attempt fails', async () => {
    const existing = JSON.stringify({
      accessToken: 'old-access',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() - 1,
    });
    values.set('spotify_token_data', existing);
    vi.mocked(AuthSession.refreshAsync).mockRejectedValue(new Error('Network unavailable'));

    await expect(getTopTracks()).rejects.toThrow('Network unavailable');
    expect(values.get('spotify_token_data')).toBe(existing);
  });

  it('migrates an access token saved by an older app version', async () => {
    values.set('spotify_access_token', 'legacy-access');
    vi.mocked(fetch).mockResolvedValue(response(200, { items: [] }) as Response);

    await expect(getTopTracks()).resolves.toEqual([]);

    expect(values.get('spotify_token_data')).toBe(JSON.stringify({ accessToken: 'legacy-access' }));
    expect(values.has('spotify_access_token')).toBe(false);
  });
});
