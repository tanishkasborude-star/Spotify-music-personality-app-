package expo.modules.soundprintwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class SoundprintWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    manager: AppWidgetManager,
    widgetIds: IntArray
  ) {
    widgetIds.forEach { widgetId ->
      manager.updateAppWidget(widgetId, createViews(context))
    }
  }

  companion object {
    const val PREFERENCES = "soundprint_widget"

    fun createViews(context: Context): RemoteViews {
      val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      val views = RemoteViews(context.packageName, resourceId(context, "layout", "soundprint_music_widget")).apply {
        setTextViewText(
          resourceId(context, "id", "widget_archetype"),
          preferences.getString("archetype", "Your music personality")
        )
        setTextViewText(resourceId(context, "id", "widget_track"), preferences.getString("track", "Connect Spotify"))
        setTextViewText(resourceId(context, "id", "widget_artist"), preferences.getString("artist", "Your next favorite"))
        val trackUri = preferences.getString("trackUri", "").orEmpty()
        setOnClickPendingIntent(resourceId(context, "id", "widget_play"), actionIntent(context, "play", trackUri, 1))
        setOnClickPendingIntent(resourceId(context, "id", "widget_pause"), actionIntent(context, "pause", trackUri, 2))
        setOnClickPendingIntent(resourceId(context, "id", "widget_open"), actionIntent(context, "", "", 0))
      }
      return views
    }

    private fun resourceId(context: Context, type: String, name: String): Int {
      val identifier = context.resources.getIdentifier(name, type, context.packageName)
      if (identifier == 0) {
        throw IllegalStateException("Missing Android widget resource: $type/$name")
      }
      return identifier
    }

    private fun actionIntent(
      context: Context,
      action: String,
      trackUri: String,
      requestCode: Int
    ): PendingIntent {
      val uri = Uri.Builder().scheme("spotify-personality").authority("widget").apply {
        if (action.isNotEmpty()) {
          appendQueryParameter("action", action)
          appendQueryParameter("trackUri", trackUri)
        }
      }.build()
      val intent = Intent(Intent.ACTION_VIEW, uri).setPackage(context.packageName)
      return PendingIntent.getActivity(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
  }
}
