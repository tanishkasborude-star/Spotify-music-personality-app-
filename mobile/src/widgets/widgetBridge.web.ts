export function publishWidget(_props: { archetype: string; track: string; artist: string; trackUri: string; action: string }) {
  // Native home-screen widgets are not part of the browser build.
}

export function listenForWidgetActions(_listener: (action: 'play' | 'pause', trackUri?: string) => void) {
  return { remove() {} };
}
