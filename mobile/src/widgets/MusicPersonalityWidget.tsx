import { createWidget } from 'expo-widgets';
import MusicPersonalityWidgetView from './MusicPersonalityWidgetView';

const musicPersonalityWidget = createWidget('MusicPersonalityWidget', MusicPersonalityWidgetView, {
  archetype: 'Your music personality',
  track: 'Connect Spotify',
  artist: 'Your next favorite',
  trackUri: '',
  action: '',
});

export default musicPersonalityWidget;
