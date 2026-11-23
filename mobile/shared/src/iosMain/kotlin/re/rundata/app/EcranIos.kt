package re.rundata.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.window.ComposeUIViewController
import kotlinx.coroutines.MainScope
import platform.Foundation.NSNotificationCenter
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
}

/** L'écran principal commun, pour l'hôte SwiftUI (iosApp/) ; `version` : celle de l'appli, pour le User-Agent. */
fun ecranPrincipal(version: String): UIViewController {
    val modele = Modele(JourneeSource(RundataMcp(clientHttp(), "rundata.re-ios/$version")), ReglagesIos(), MainScope())
    // Au retour au premier plan, l'écran est relu s'il date (Modele.revenir).
    NSNotificationCenter.defaultCenter.addObserverForName(UIApplicationWillEnterForegroundNotification, null, NSOperationQueue.mainQueue) { _ -> modele.revenir() }
    return ComposeUIViewController {
        val etat by modele.etat.collectAsState()
        ThemeRundata(isSystemInDarkTheme()) {
            EcranPrincipal(etat, modele::choisir, modele::changerDeCommune, modele::rafraichir) { adresse ->
                NSURL.URLWithString(adresse)?.let { UIApplication.sharedApplication.openURL(it, emptyMap<Any?, Any?>(), null) }
            }
        }
    }
}
