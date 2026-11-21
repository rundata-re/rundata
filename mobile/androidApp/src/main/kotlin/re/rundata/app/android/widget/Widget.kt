package re.rundata.app.android.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.currentState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.background
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import re.rundata.app.CLAIR
import re.rundata.app.SOMBRE
import re.rundata.app.android.MainActivity
import re.rundata.app.android.PrefsReglages
import re.rundata.app.communeDe
import re.rundata.app.teinte

/** Le widget d'écran d'accueil : la température mesurée de la commune choisie, son heure, la vigilance de sa zone. */
class WidgetRundata : GlanceAppWidget() {
    // Un compteur dans l'état Glance : chaque écriture du worker le change (redessiner), et le contenu est relu.
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val encre = ColorProvider(day = CLAIR.encre, night = SOMBRE.encre)
        val attenue = ColorProvider(day = CLAIR.attenue, night = SOMBRE.attenue)
        provideContent {
            // Lu ici, dans le contenu, et non avant : une session Glance déjà ouverte se recompose sans repasser par
            // provideGlance ; lues avant, les données restaient celles de son ouverture (« Lecture des données… »).
            currentState<Preferences>()[LECTURE]
            val choisie = communeDe(PrefsReglages(context).commune)?.nom
            val d = Donnees.lire(context)
            val l = lignes(d, choisie)
            Column(
                GlanceModifier.fillMaxSize().background(CLAIR.fond, SOMBRE.fond).cornerRadius(20.dp).padding(14.dp)
                    .clickable(actionStartActivity<MainActivity>()),
                verticalAlignment = Alignment.Top,
            ) {
                // L'heure de lecture en haut, à droite du nom : elle reste visible quand le reste ne tient pas.
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(l.titre, modifier = GlanceModifier.defaultWeight(), style = TextStyle(color = encre, fontSize = 15.sp, fontWeight = FontWeight.Medium), maxLines = 1)
                    l.lue?.let { Text(it, style = TextStyle(color = attenue, fontSize = 11.sp), maxLines = 1) }
                }
                l.grande?.let { Text(it, style = TextStyle(color = encre, fontSize = 36.sp, fontWeight = FontWeight.Bold), maxLines = 1) }
                l.detail?.let { Text(it, style = TextStyle(color = attenue, fontSize = 12.sp), maxLines = 2) }
                // La vigilance, touchée : le site officiel de Météo-France.
                val officiel = GlanceModifier.clickable(actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(d?.officielLien ?: OFFICIEL_VIGILANCE))))
                for (p in l.vigilance) {
                    Spacer(GlanceModifier.height(4.dp))
                    val (fondClair, encreClair) = p.couleur.teinte(CLAIR)
                    val (fondSombre, encreSombre) = p.couleur.teinte(SOMBRE)
                    Box(officiel.background(fondClair, fondSombre).cornerRadius(6.dp).padding(horizontal = 6.dp, vertical = 2.dp)) {
                        Text(p.texte, style = TextStyle(color = ColorProvider(day = encreClair, night = encreSombre), fontSize = 12.sp, fontWeight = FontWeight.Medium), maxLines = 2)
                    }
                }
                l.zone?.let { Text(it, modifier = officiel, style = TextStyle(color = attenue, fontSize = 11.sp), maxLines = 2) }
                l.officiel?.let { Text(it, modifier = officiel, style = TextStyle(color = ColorProvider(day = CLAIR.lien, night = SOMBRE.lien), fontSize = 11.sp), maxLines = 2) }
                l.eau?.let {
                    Spacer(GlanceModifier.height(6.dp))
                    // Touchée : l'avis du distributeur.
                    val avis = d?.eauLien?.let { lien -> GlanceModifier.clickable(actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(lien)))) } ?: GlanceModifier
                    Text(it, modifier = avis, style = TextStyle(color = encre, fontSize = 12.sp), maxLines = 3)
                }
                l.alerte?.let {
                    Spacer(GlanceModifier.height(4.dp))
                    Text(it, style = TextStyle(color = ColorProvider(day = CLAIR.lave, night = SOMBRE.lave), fontSize = 11.sp), maxLines = 2)
                }
            }
        }
    }

    companion object {
        private val LECTURE = longPreferencesKey("lecture")

        /** Redessine chaque widget posé avec ce qui vient d'être écrit (Donnees.ecrire). */
        suspend fun redessiner(context: Context) {
            for (id in GlanceAppWidgetManager(context).getGlanceIds(WidgetRundata::class.java)) {
                updateAppWidgetState(context, id) { it[LECTURE] = System.currentTimeMillis() }
                WidgetRundata().update(context, id)
            }
        }
    }
}

class RecepteurWidget : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WidgetRundata()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        MiseAJour.planifier(context)
    }

    /** Au placement d'un widget (et à chaque demande du système) : la journée est lue tout de suite. */
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        MiseAJour.planifier(context)
        MiseAJour.maintenant(context)
    }

    /**
     * Après une mise à jour de l'appli, le système redessine le widget avec son écran d'attente : il est relu et
     * redessiné tout de suite, sans attendre sa demi-heure.
     */
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            MiseAJour.planifier(context)
            MiseAJour.maintenant(context)
        }
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        MiseAJour.annuler(context)
    }
}

