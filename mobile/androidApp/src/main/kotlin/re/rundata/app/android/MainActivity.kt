package re.rundata.app.android

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import re.rundata.app.EcranPrincipal
import re.rundata.app.Modele
import re.rundata.app.ThemeRundata
import re.rundata.app.android.widget.MiseAJour
import re.rundata.app.android.widget.RecepteurWidget

/** L'écran principal, commun à Android et à l'iPhone (shared/Ecran.kt), dans une activité. */
class MainActivity : ComponentActivity() {
    class Etat(app: RundataApp) : ViewModel() {
        private val reglages = PrefsReglages(app)
        val modele = Modele(app.source, reglages, viewModelScope)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val app = application as RundataApp
        val modele = ViewModelProvider(this, object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = Etat(app) as T
        })[Etat::class.java].modele
        setContent {
            val etat by modele.etat.collectAsState()
            ThemeRundata(isSystemInDarkTheme()) {
                EcranPrincipal(
                    etat,
                    choisir = { commune ->
                        modele.choisir(commune)
                        // Le widget suit la commune choisie, sans attendre sa demi-heure.
                        MiseAJour.maintenant(this)
                    },
                    changer = modele::changerDeCommune,
                    rafraichir = modele::rafraichir,
                    ouvrir = ::ouvrir,
                )
            }
        }
    }

    /** À chaque ouverture de l'appli, un widget posé est relu (sa dernière lecture peut dater). */
    override fun onResume() {
        super.onResume()
        val poses = AppWidgetManager.getInstance(this).getAppWidgetIds(ComponentName(this, RecepteurWidget::class.java))
        if (poses.isNotEmpty()) MiseAJour.maintenant(this)
    }

    /** Une page du site dans un onglet du navigateur. */
    private fun ouvrir(adresse: String) {
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, adresse.toUri())
    }
}
