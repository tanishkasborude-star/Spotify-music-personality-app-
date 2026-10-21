import { requireOptionalNativeModule } from 'expo';
import * as Linking from 'expo-linking';

type SoundprintAndroidWidgetModule = {
  updateWidget(archetype: string, track: string, artist: string, trackUri: string): void;
};

let initialUrlRead = false;

export function publishWidget(props: { archetype: string; track: string; artist: string; trackUri: string; action: string }) {
  const androidWidget = requireOptionalNativeModule<SoundprintAndroidWidgetModule>('SoundprintAndroidWidget');
  androidWidget?.updateWidget(props.archetype, props.track, props.artist, props.trackUri);
}

export function listenForWidgetActions(listener: (action: 'play' | 'pause', trackUri?: string) => void) {
  const handleUrl = (url: string) => {
    const params = Linking.parse(url).queryParams;
    const action = params?.action;
    if (action === 'play' || action === 'pause') {
      listener(action, typeof params?.trackUri === 'string' ? params?.trackUri : undefined);
    }
  };
  const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
  if (!initialUrlRead) {
    initialUrlRead = true;
    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
  }
  return { remove: () => subscription.remove() };
}
