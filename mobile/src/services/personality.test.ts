import { describe, expect, it } from 'vitest';
import { personalityFor, pickFallbackRecommendation } from './personality';
import type { Track } from '../types';

const tracks: Track[] = [
  { id: '1', name: 'One', artist: 'A', album: 'X' },
  { id: '2', name: 'Two', artist: 'B', album: 'Y' },
  { id: '3', name: 'Three', artist: 'C', album: 'Z' },
];

describe('personalityFor', () => {
  it('provides a default archetype without Spotify history', () => {
    expect(personalityFor([]).archetype).toBe('The Dreamer');
  });

  it('recognizes an exploratory listener with diverse artists', () => {
    expect(personalityFor(tracks).archetype).toBe('The Explorer');
  });

  it('recognizes a repeat-artist listener', () => {
    expect(personalityFor(tracks.map((track) => ({ ...track, artist: 'A' }))).archetype).toBe('The Dreamer');
  });
});

describe('pickFallbackRecommendation', () => {
  it('returns a deterministic recommendation without Spotify', () => {
    expect(pickFallbackRecommendation('alice@example.com')).toEqual(pickFallbackRecommendation('alice@example.com'));
  });
});
