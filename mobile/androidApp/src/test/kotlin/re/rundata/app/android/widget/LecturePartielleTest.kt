package re.rundata.app.android.widget

import re.rundata.app.Alerte
import re.rundata.app.Couleur
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Une lecture où `vigilance_meteo` ou `cyclones` n'a pas répondu ne dit pas qu'une alerte est partie : sa notification
 * reste, et elle n'est pas renvoyée à la lecture suivante.
 */
class LecturePartielleTest {
    private val orange = Alerte("Vigilance orange vents forts", "orange du 23/11 06:00 au 23/11 18:00", Couleur.ORANGE, "05:47")
    private val systeme = Alerte("Tempête tropicale modérée Bheki", null, Couleur.AUCUNE, "23/11 10:00", systeme = true)
    private val complete = Donnees("Saint-Pierre", "26 °C", "19:30", "Saint-Pierre Pierrefonds (aéroport)", "Sud", false, null, slug = "saint-pierre", alertesEmise = "05:47", vigilanceLue = true, cyclonesLus = true)

    @Test
    fun uneVigilanceNonLueNeRetireNiNeRenvoieLaNotification() {
        val premiere = Notifications.decider(listOf(complete.copy(alertes = listOf(orange))), emptySet())
        assertEquals(listOf(Notifications.cle(orange, "Sud")), premiere.nouvelles.map { it.first })
        // vigilance_meteo n'a pas répondu, cyclones si : rien de la zone n'est connu.
        val partielle = Notifications.decider(listOf(complete.copy(alertes = emptyList(), vigilanceLue = false, alertesEmise = null)), premiere.dites)
        assertEquals(emptySet(), partielle.retirees)
        val suivante = Notifications.decider(listOf(complete.copy(alertes = listOf(orange))), partielle.dites)
        assertEquals(emptyList(), suivante.nouvelles.map { it.first })
        // Lue en entier sans elle : partie.
        val finie = Notifications.decider(listOf(complete.copy(alertes = emptyList())), suivante.dites)
        assertEquals(setOf(Notifications.cle(orange, "Sud")), finie.retirees)
        assertEquals(emptySet(), finie.dites)
    }

    @Test
    fun desCyclonesNonLusNeRetirentNiNeRenvoientLeSysteme() {
        val premiere = Notifications.decider(listOf(complete.copy(alertes = listOf(systeme))), emptySet())
        val partielle = Notifications.decider(listOf(complete.copy(alertes = emptyList(), cyclonesLus = false)), premiere.dites)
        assertEquals(emptySet(), partielle.retirees)
        assertEquals(emptyList(), Notifications.decider(listOf(complete.copy(alertes = listOf(systeme))), partielle.dites).nouvelles)
    }

    @Test
    fun uneAutreCommuneLueEnEntierNeRetirePasCeQuUneLecturePartielleIgnore() {
        val pierre = complete.copy(alertes = listOf(orange))
        val denis = complete.copy(commune = "Saint-Denis", slug = "saint-denis", zone = "Nord", alertes = emptyList())
        val premiere = Notifications.decider(listOf(pierre, denis), emptySet())
        val partielle = Notifications.decider(listOf(pierre.copy(alertes = emptyList(), vigilanceLue = false), denis), premiere.dites)
        assertEquals(emptySet(), partielle.retirees)
    }
}
