import { addUserInteractionListener } from 'expo-widgets';
import MusicPersonalityWidget from './MusicPersonalityWidget';

export function publishWidget(props: { archetype: string; track: string; artist: string; trackUri: string; action: string }) {
  MusicPersonalityWidget.updateSnapshot(props);
}

export function listenForWidgetActions(listener: (action: 'play' | 'pause', trackUri?: string) => void) {
  return addUserInteractionListener((event) => {
    if (event.source === 'MusicPersonalityWidget' && (event.target === 'play' || event.target === 'pause')) {
      listener(event.target);
    }
  });
}
