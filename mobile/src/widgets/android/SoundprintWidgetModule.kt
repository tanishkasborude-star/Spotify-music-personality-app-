package expo.modules.soundprintwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SoundprintWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SoundprintAndroidWidget")

    Function("updateWidget") { archetype: String, track: String, artist: String, trackUri: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Android app context is unavailable.")
      context.getSharedPreferences(SoundprintWidgetProvider.PREFERENCES, Context.MODE_PRIVATE)
        .edit()
        .putString("archetype", archetype)
        .putString("track", track)
        .putString("artist", artist)
        .putString("trackUri", trackUri)
        .apply()

      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, SoundprintWidgetProvider::class.java)
      manager.getAppWidgetIds(component).forEach { widgetId ->
        manager.updateAppWidget(widgetId, SoundprintWidgetProvider.createViews(context))
      }
    }
  }
}
