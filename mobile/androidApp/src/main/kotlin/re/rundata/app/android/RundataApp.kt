package re.rundata.app.android

import android.app.Application
import android.content.Context
import androidx.core.content.edit
import re.rundata.app.Copie
import re.rundata.app.JourneeSource
import re.rundata.app.Reglages
import re.rundata.app.RundataMcp
import re.rundata.app.BuildConfig
import re.rundata.app.clientHttp

class RundataApp : Application() {
    /** Un client pour toute l'appli, écran et widget. */
    /** Une seule copie des réponses pour l'écran et les widgets (Copie). */
    private val copie = Copie()
    val source: JourneeSource by lazy { JourneeSource(RundataMcp(clientHttp(), userAgent(widget = false)), alertesSimulees(this), copie) }
    /** Ce que lit le widget en arrière-plan, sous son propre nom (le site le compte à part, sans rien du lieu). */
    val sourceWidget: JourneeSource by lazy { JourneeSource(RundataMcp(clientHttp(), userAgent(widget = true)), alertesSimulees(this), copie) }

    companion object {
        /** Honnête : qui lit le serveur MCP public, et en quelle version. */
        val USER_AGENT = "rundata.re-android/${BuildConfig.VERSION_NAME}"

        fun userAgent(widget: Boolean): String = if (widget) "$USER_AGENT widget" else USER_AGENT
    }
}

/** La commune choisie, gardée dans les préférences de l'appli ; le widget lit la même. */
class PrefsReglages(context: Context) : Reglages {
    private val prefs = context.getSharedPreferences("reglages", Context.MODE_PRIVATE)
    override var commune: String?
        get() = prefs.getString("commune", null)
        set(v) {
            prefs.edit { putString("commune", v) }
        }

    /** La dernière journée lue de chaque commune, à part : la montrer hors ligne. */
    private val journees = context.getSharedPreferences("journees", Context.MODE_PRIVATE)
    override fun journeeGardee(slug: String): String? = journees.getString(slug, null)
    override fun garderJournee(slug: String, json: String) = journees.edit { putString(slug, json) }
}

val Context.source: JourneeSource get() = (applicationContext as RundataApp).source
val Context.sourceWidget: JourneeSource get() = (applicationContext as RundataApp).sourceWidget

/** « 24/11 09:12 », maintenant, heure de La Réunion. */
fun heureDeLaReunion(): String = java.time.ZonedDateTime.now(java.time.ZoneId.of("Indian/Reunion")).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM HH:mm"))
