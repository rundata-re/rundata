package re.rundata.app.android.widget

import re.rundata.app.Alerte
import re.rundata.app.Couleur
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Une alerte vue pendant que les notifications sont coupées n'est pas retenue comme dite ; une alerte de toute l'île
 * n'est dite qu'une fois, quelle que soit la zone des communes suivies.
 */
class PermissionEtIleTest {
    private val orange = Alerte("Vigilance orange vents forts", null, Couleur.ORANGE, "23/11 05:47")
    private val cyclone = Alerte("Alerte cyclonique orange", null, Couleur.ORANGE, "23/11 05:47", cyclonique = true)
    private val systeme = Alerte("Tempête tropicale modérée Bheki", null, Couleur.AUCUNE, "23/11 10:00", systeme = true)
    private val pierre = Donnees("Saint-Pierre", "26 °C", "23/11 19:30", null, "Sud", false, null, slug = "saint-pierre", vigilanceLue = true, cyclonesLus = true)
    private val denis = pierre.copy(commune = "Saint-Denis", slug = "saint-denis", zone = "Nord")

    @Test
    fun sansPermissionLAlerteNEstPasDiteEtLeSeraQuandElleEstPermise() {
        val coupee = Notifications.decider(listOf(pierre.copy(alertes = listOf(orange))), emptySet()) { false }
        assertEquals(emptyList(), coupee.nouvelles)
        assertEquals(emptySet(), coupee.dites)
        val permise = Notifications.decider(listOf(pierre.copy(alertes = listOf(orange))), coupee.dites) { true }
        assertEquals(listOf(Notifications.cle(orange, "Sud")), permise.nouvelles.map { it.first })
    }

    @Test
    fun unCanalCoupeNeRetientQueSesAlertes() {
        val d = Notifications.decider(listOf(pierre.copy(alertes = listOf(cyclone, orange))), emptySet()) { !it.urgente }
        assertEquals(setOf(Notifications.cle(orange, "Sud")), d.dites)
    }

    @Test
    fun uneAlerteDeToutLIleNEstDiteQuUneFois() {
        val d = Notifications.decider(listOf(pierre.copy(alertes = listOf(cyclone, systeme, orange)), denis.copy(alertes = listOf(cyclone, systeme))), emptySet())
        assertEquals(setOf("île|${cyclone.cle}", "île|${systeme.cle}", "Sud|${orange.cle}"), d.nouvelles.map { it.first }.toSet())
        assertEquals(3, d.nouvelles.size)
    }

    /** Un système suivi sans alerte : la notification dit qu'il n'y a pas d'alerte, et ne le place pas sur l'île. */
    @Test
    fun laNotificationDUnSystemeDitQuIlNYAPasDAlerte() {
        val suivi = systeme.copy(detail = "Pas d'alerte cyclonique en cours")
        kotlin.test.assertEquals("Pas d'alerte cyclonique en cours · avis du CMRS du 23/11 10:00", texteNotification(suivi, "Sud", "Le Tampon"))
        kotlin.test.assertEquals("avis du CMRS du 23/11 10:00", texteNotification(systeme, "Sud", "Le Tampon"))
    }
}
