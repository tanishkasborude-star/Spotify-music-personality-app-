const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const providerName = 'expo.modules.soundprintwidget.SoundprintWidgetProvider';

function withWidgetReceiver(config) {
  return withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application manifest entry was not found.');
    application.receiver ??= [];
    const exists = application.receiver.some((receiver) => receiver.$?.['android:name'] === providerName);
    if (!exists) {
      application.receiver.push({
        $: {
          'android:name': providerName,
          'android:exported': 'true',
          'android:label': 'Soundprint',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/soundprint_music_personality_widget_info',
            },
          },
        ],
      });
    }
    return modConfig;
  });
}

function withWidgetResources(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const source = path.join(modConfig.modRequest.projectRoot, 'plugins', 'android-widget-resources');
      const target = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const resourceType of ['layout', 'xml', 'drawable']) {
        const sourceDirectory = path.join(source, resourceType);
        if (!fs.existsSync(sourceDirectory)) continue;
        const targetDirectory = path.join(target, resourceType);
        fs.mkdirSync(targetDirectory, { recursive: true });
        for (const filename of fs.readdirSync(sourceDirectory)) {
          fs.copyFileSync(path.join(sourceDirectory, filename), path.join(targetDirectory, filename));
        }
      }
      return modConfig;
    },
  ]);
}

module.exports = function withAndroidMusicWidget(config) {
  return withWidgetResources(withWidgetReceiver(config));
};
