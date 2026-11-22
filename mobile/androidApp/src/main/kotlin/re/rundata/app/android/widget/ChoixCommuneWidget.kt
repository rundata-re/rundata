package re.rundata.app.android.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import re.rundata.app.ChoixDeCommune
import re.rundata.app.Commune
import re.rundata.app.ThemeRundata
import re.rundata.app.android.PrefsReglages

/**
 * La commune d'un widget, choisie quand on le pose (android:configure), et de nouveau d'un appui long sur lui
 * (reconfigurable). La commune de l'appli est proposée en premier ; sans elle, celle choisie ici le devient aussi.
 */
class ChoixCommuneWidget : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        // Quitté sans choisir : le widget n'est pas posé.
        setResult(Activity.RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return finish()
        val reglages = PrefsReglages(this)
        lifecycleScope.launch {
            val id = runCatching { GlanceAppWidgetManager(this@ChoixCommuneWidget).getGlanceIdBy(appWidgetId) }.getOrNull()
            val actuelle = id?.let { WidgetRundata.communeDuWidget(this@ChoixCommuneWidget, null) }
            setContent {
                ThemeRundata(isSystemInDarkTheme()) {
                    ChoixDeCommune("La commune du widget", "Ce widget montrera la journée de la commune choisie.", actuelle) { commune -> choisir(appWidgetId, commune, reglages) }
                }
            }
        }
    }

    private fun choisir(appWidgetId: Int, commune: Commune, reglages: PrefsReglages) {
        lifecycleScope.launch {
            val c = this@ChoixCommuneWidget
            if (reglages.commune == null) reglages.commune = commune.slug
            val id = GlanceAppWidgetManager(c).getGlanceIdBy(appWidgetId)
            updateAppWidgetState(c, id) { it[WidgetRundata.COMMUNE] = commune.slug }
            WidgetRundata.pour(c, appWidgetId)?.update(c, id)
            MiseAJour.planifier(c)
            MiseAJour.maintenant(c)
            setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
            finish()
        }
    }
}
