package re.rundata.app.android

import android.app.Application
import android.content.Context
import androidx.core.content.edit
import re.rundata.app.JourneeSource
import re.rundata.app.Reglages
import re.rundata.app.RundataMcp
import re.rundata.app.BuildConfig
import re.rundata.app.clientHttp

class RundataApp : Application() {
    /** Un client pour toute l'appli, écran et widget. */
    val source: JourneeSource by lazy { JourneeSource(RundataMcp(clientHttp(), USER_AGENT)) }

    companion object {
        /** Honnête : qui lit le serveur MCP public, et en quelle version. */
        val USER_AGENT = "rundata.re-android/${BuildConfig.VERSION_NAME}"
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
}

val Context.source: JourneeSource get() = (applicationContext as RundataApp).source
