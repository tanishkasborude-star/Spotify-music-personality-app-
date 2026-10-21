// TypeScript fallback; platform-specific files provide native and browser behavior.
export function publishWidget(_props: { archetype: string; track: string; artist: string; trackUri: string; action: string }) {}

export function listenForWidgetActions(_listener: (action: 'play' | 'pause', trackUri?: string) => void) {
  return { remove() {} };
}
