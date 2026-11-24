package re.rundata.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.window.ComposeUIViewController
import kotlinx.coroutines.MainScope
import platform.Foundation.NSDate
import platform.Foundation.NSDateFormatter
import platform.Foundation.NSNotificationCenter
import platform.Foundation.NSTimeZone
import platform.Foundation.localTimeZone
import platform.Foundation.timeZoneWithName
import platform.Foundation.NSOperationQueue
import platform.Foundation.NSURL
import platform.Foundation.NSUserDefaults
import platform.UIKit.UIApplication
import platform.UIKit.UIApplicationWillEnterForegroundNotification
import platform.UIKit.UIViewController

/** La commune choisie, dans les réglages de l'appli (NSUserDefaults). */
class ReglagesIos : Reglages {
    private val d = NSUserDefaults.standardUserDefaults
    override var commune: String?
        get() = d.stringForKey("commune")
        set(v) = d.setObject(v, forKey = "commune")

    override fun journeeGardee(slug: String): String? = d.stringForKey("journee-$slug")
    override fun garderJournee(slug: String, json: String) = d.setObject(json, forKey = "journee-$slug")
}

/** « 24/11 09:12 », maintenant, heure de La Réunion. */
private fun heureDeLaReunion(): String = NSDateFormatter().apply {
    dateFormat = "dd/MM HH:mm"
    timeZone = NSTimeZone.timeZoneWithName("Indian/Reunion") ?: NSTimeZone.localTimeZone
}.stringFromDate(NSDate())

/** L'écran principal commun, pour l'hôte SwiftUI (iosApp/) ; `version` : celle de l'appli, pour le User-Agent. */
fun ecranPrincipal(version: String): UIViewController {
    val modele = Modele(JourneeSource(RundataMcp(clientHttp(), "rundata.re-ios/$version")), ReglagesIos(), MainScope(), horloge = ::heureDeLaReunion)
    // Au retour au premier plan, l'écran est relu s'il date (Modele.revenir).
    NSNotificationCenter.defaultCenter.addObserverForName(UIApplicationWillEnterForegroundNotification, null, NSOperationQueue.mainQueue) { _ -> modele.revenir() }
    return ComposeUIViewController {
        val etat by modele.etat.collectAsState()
        ThemeRundata(isSystemInDarkTheme()) {
            EcranPrincipal(etat, modele::choisir, modele::changerDeCommune, modele::rafraichir, ouvrir = { adresse ->
                NSURL.URLWithString(adresse)?.let { UIApplication.sharedApplication.openURL(it, emptyMap<Any?, Any?>(), null) }
            })
        }
    }
}
