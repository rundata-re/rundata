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
import re.rundata.app.R
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
            // Ce que montrera ce widget-là, avec les mots de la liste des widgets d'Android (son nom, sa description).
            val sujet = AppWidgetManager.getInstance(this@ChoixCommuneWidget).getAppWidgetInfo(appWidgetId)?.provider?.className?.let(::sujetDuWidget)
            val titre = titreDuChoix(sujet?.let { getString(it.first) })
            val phrase = sujet?.let { getString(it.second) } ?: "Ce widget montrera la journée de la commune choisie."
            setContent {
                ThemeRundata(isSystemInDarkTheme()) {
                    ChoixDeCommune(titre, phrase, actuelle) { commune -> choisir(appWidgetId, commune, reglages) }
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

/**
 * Le nom et la description (ressources) du widget dont le récepteur est `classe`, tels que la liste des widgets d'Android
 * les montre ; null pour un récepteur inconnu. Avant 0.3.4, l'écran disait « la journée » pour tous, Alerte compris.
 */
fun sujetDuWidget(classe: String): Pair<Int, Int>? = when (classe) {
    RecepteurAlerte::class.java.name -> R.string.widget_alerte_nom to R.string.widget_alerte_description
    RecepteurBandeau::class.java.name -> R.string.widget_bandeau_nom to R.string.widget_bandeau_description
    RecepteurTemperature::class.java.name -> R.string.widget_temperature_nom to R.string.widget_temperature_description
    RecepteurAujourdhui::class.java.name -> R.string.widget_aujourdhui_nom to R.string.widget_aujourdhui_description
    RecepteurWidget::class.java.name -> R.string.widget_nom to R.string.widget_description
    else -> null
}

/** « Widget « Alerte » : choisissez la commune » : une seule paire de guillemets ; sans nom connu, « Widget : choisissez la commune ». */
fun titreDuChoix(nom: String?): String = (nom?.let { "Widget «\u00a0$it\u00a0»" } ?: "Widget") + "\u00a0: choisissez la commune"
