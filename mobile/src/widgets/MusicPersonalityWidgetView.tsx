import { Button, HStack, Text, VStack } from '@expo/ui/swift-ui';

export type MusicPersonalityWidgetProps = {
  archetype: string;
  track: string;
  artist: string;
  trackUri: string;
  action: string;
};

export default function MusicPersonalityWidgetView(props: MusicPersonalityWidgetProps) {
  'widget';
  return (
    <VStack spacing={8}>
      <Text>{props.archetype}</Text>
      <Text>{props.track}</Text>
      <Text>{props.artist}</Text>
      <HStack spacing={12}>
        <Button label="Play" target="play" onPress={() => ({ ...props, action: 'play' })} />
        <Button label="Pause" target="pause" onPress={() => ({ ...props, action: 'pause' })} />
      </HStack>
    </VStack>
  );
}
