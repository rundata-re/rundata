package re.rundata.app.android

import java.io.File
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Le texte d'avant la fenêtre d'Android : « Plus tard » le remet à 7 jours, à l'ouverture de l'appli, sans notification. */
class DemandeNotificationsTest {
    private val jour = 24L * 3600 * 1000
    private val t0 = 1_800_000_000_000L

    @Test
    fun montreALaPremiereOuverture() {
        assertTrue(DemandeNotifications.aMontrer(demandee = false, plusTardA = 0L, maintenant = t0))
    }

    @Test
    fun plusTardLeRemetASeptJours() {
        assertFalse(DemandeNotifications.aMontrer(false, t0, t0))
        assertFalse(DemandeNotifications.aMontrer(false, t0, t0 + 6 * jour))
        assertFalse(DemandeNotifications.aMontrer(false, t0, t0 + 7 * jour - 1))
        assertTrue(DemandeNotifications.aMontrer(false, t0, t0 + 7 * jour))
    }

    @Test
    fun uneFoisDemandeeJamaisPlus() {
        assertFalse(DemandeNotifications.aMontrer(true, 0L, t0))
        assertFalse(DemandeNotifications.aMontrer(true, t0, t0 + 30 * jour))
    }

    /** « Plus tard » ne devient jamais une notification : ce fichier ne planifie rien et n'envoie rien. */
    @Test
    fun plusTardNeDevientJamaisUneNotification() {
        val source = File("src/main/kotlin/re/rundata/app/android/DemandeNotifications.kt").readText()
        for (interdit in listOf("notify(", "NotificationCompat", "NotificationManager", "WorkManager", "AlarmManager")) {
            assertFalse(interdit in source, "DemandeNotifications.kt ne doit pas contenir $interdit")
        }
        // Les notifications d'alerte (widget/Notifications.kt) ne sont pas appelées d'ici.
        assertFalse(Regex("(?<![A-Za-z])Notifications\\.").containsMatchIn(source))
        assertFalse("widget.Notifications" in source)
    }
}
