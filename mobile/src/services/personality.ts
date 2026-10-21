import type { Personality, Track } from '../types';

const archetypes: Personality[] = [
  { archetype: 'The Dreamer', title: 'Drift into the feeling', description: 'You follow the songs that make a moment linger.', accent: '#BDA4FF' },
  { archetype: 'The Explorer', title: 'Always finding a new sound', description: 'Curiosity leads your listening, one artist at a time.', accent: '#68D8B4' },
  { archetype: 'The Rhythm Keeper', title: 'A pulse for every day', description: 'Your soundtrack turns everyday energy into a ritual.', accent: '#FFB66E' },
];

export function personalityFor(tracks: Track[]): Personality {
  if (!tracks.length) return archetypes[0];
  const distinctArtists = new Set(tracks.map((track) => track.artist)).size;
  return archetypes[distinctArtists > tracks.length * 0.72 ? 1 : tracks.length > 8 ? 2 : 0];
}

export const fallbackTracks: Track[] = [
  { id: 'sample-1', name: 'Golden Hour', artist: 'Kacey Musgraves', album: 'Golden Hour' },
  { id: 'sample-2', name: 'Good Days', artist: 'SZA', album: 'Good Days' },
  { id: 'sample-3', name: 'Sunset Lover', artist: 'Petit Biscuit', album: 'Presence' },
];

export function pickFallbackRecommendation(email?: string): Track {
  const index = email ? email.charCodeAt(0) % fallbackTracks.length : 0;
  return fallbackTracks[index];
}
