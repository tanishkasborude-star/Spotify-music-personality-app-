export type Track = {
  id: string;
  name: string;
  artist: string;
  album: string;
  imageUrl?: string;
  uri?: string;
};

export type Profile = {
  name: string;
  email?: string;
  avatarUrl?: string;
};

export type Personality = {
  archetype: string;
  title: string;
  description: string;
  accent: string;
};

export type SpotifyPlayback = 'ready' | 'premium-required' | 'no-device' | 'not-connected' | 'error';
