package re.rundata.app.android

import android.Manifest
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import re.rundata.app.EcranPrincipal
import re.rundata.app.Modele
import re.rundata.app.ThemeRundata
import re.rundata.app.android.widget.MiseAJour
import re.rundata.app.android.widget.Notifications
import re.rundata.app.android.widget.RecepteurAlerte
import re.rundata.app.android.widget.RecepteurAujourdhui
import re.rundata.app.android.widget.RecepteurBandeau
import re.rundata.app.android.widget.RecepteurTemperature
import re.rundata.app.android.widget.RecepteurWidget

/** L'écran principal, commun à Android et à l'iPhone (shared/Ecran.kt), dans une activité. */
class MainActivity : ComponentActivity() {
    class Etat(app: RundataApp) : ViewModel() {
        private val reglages = PrefsReglages(app)
        val modele = Modele(app.source, reglages, viewModelScope)
    }

    private lateinit var modele: Modele

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val app = application as RundataApp
        modele = ViewModelProvider(this, object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = Etat(app) as T
        })[Etat::class.java].modele
        Notifications.creerCanaux(this)
        setContent {
            val etat by modele.etat.collectAsState()
            var avant by remember { mutableStateOf(aDemander()) }
            ThemeRundata(isSystemInDarkTheme()) {
                EcranPrincipal(
                    etat,
                    choisir = { commune ->
                        modele.choisir(commune)
                        // Le widget suit la commune choisie, sans attendre sa demi-heure ; ses alertes sont suivies.
                        MiseAJour.planifier(this)
                        MiseAJour.maintenant(this)
                    },
                    changer = modele::changerDeCommune,
                    rafraichir = modele::rafraichir,
                    ouvrir = ::ouvrir,
                )
                if (avant) AvantDemande(
                    continuer = {
                        avant = false
                        DemandeNotifications.demandee(this)
                        permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    },
                    plusTard = {
                        avant = false
                        DemandeNotifications.plusTard(this)
                    },
                )
            }
        }
    }

    /**
     * À chaque ouverture de l'appli, les widgets posés et les alertes de la commune choisie sont relus (la dernière
     * lecture peut dater), et leur relecture toutes les 30 min est planifiée. L'écran lui-même est relu s'il date
     * (Modele.revenir).
     */
    override fun onResume() {
        super.onResume()
        modele.revenir()
        val m = AppWidgetManager.getInstance(this)
        val poses = RECEPTEURS.any { m.getAppWidgetIds(ComponentName(this, it)).isNotEmpty() }
        if (PrefsReglages(this).commune != null || poses) {
            MiseAJour.planifier(this)
            MiseAJour.maintenant(this)
        }
    }

    /** Les notifications d'alerte : Android 13 et plus les demande ; refusées, le bandeau reste. */
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** Le texte d'avant (DemandeNotifications) : Android 13 et plus, notifications pas encore permises. */
    private fun aDemander(): Boolean = Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
        DemandeNotifications.aMontrer(this)

    /** Une page du site dans un onglet du navigateur. */
    private fun ouvrir(adresse: String) {
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, adresse.toUri())
    }
}

private val RECEPTEURS = listOf(
    RecepteurTemperature::class.java, RecepteurBandeau::class.java, RecepteurWidget::class.java, RecepteurAujourdhui::class.java, RecepteurAlerte::class.java,
)
