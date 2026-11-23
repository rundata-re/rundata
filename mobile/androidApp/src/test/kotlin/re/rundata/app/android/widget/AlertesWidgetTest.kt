package re.rundata.app.android.widget

import re.rundata.app.Alerte
import re.rundata.app.Couleur
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AlertesWidgetTest {
    private val lue = Donnees("Saint-Pierre", "26 °C", "19:30", "Saint-Pierre Pierrefonds (aéroport)", "Sud", false, null, etat = "verte", slug = "saint-pierre")
    private val orange = Alerte("Vigilance orange vents forts", "orange du 23/11 06:00 au 23/11 18:00", Couleur.ORANGE, "05:47")
    private val jaune = Alerte("Vigilance jaune fortes pluies / orages", null, Couleur.JAUNE, "05:47")
    private val rouge = Alerte("Alerte cyclonique rouge", "« je me confine » : danger imminent", Couleur.ROUGE, "05:47", cyclonique = true)
    private val systeme = Alerte("Tempête tropicale modérée Bheki", null, Couleur.AUCUNE, "23/11 10:00", systeme = true)

    @Test
    fun leWidgetAlerteDitLaPlusGraveOuQuIlNYEnAPas() {
        assertEquals(LigneAlerte("Vigilance orange vents forts", "bulletin de 05:47", "orange du 23/11 06:00 au 23/11 18:00", orange), ligneAlerte(lue.copy(alertes = listOf(orange, jaune), vigilanceLue = true)))
        assertEquals(LigneAlerte(PAS_D_ALERTE, "bulletin de 05:47", "zone Sud · d'après Météo-France", null), ligneAlerte(lue.copy(alertes = emptyList(), alertesEmise = "05:47", vigilanceLue = true)))
        // Pas lues, ou la vigilance pas lue : jamais « pas d'alerte ».
        assertEquals(ALERTES_NON_LUES, ligneAlerte(lue).texte)
        assertEquals(ALERTES_NON_LUES, ligneAlerte(lue.copy(alertes = emptyList(), vigilanceLue = false)).texte)
        assertEquals("avis du CMRS du 23/11 10:00", heureAlerte(systeme))
        assertEquals("et 1 autre alerte", enPlusAlertes(1))
        assertEquals("et 2 autres alertes", enPlusAlertes(2))
        assertNull(enPlusAlertes(0))
    }

    @Test
    fun lesAlertesSontGardeesEtRelues() {
        val d = lue.copy(alertes = listOf(rouge, orange), alertesEmise = "05:47", vigilanceLue = true)
        assertEquals(d, Donnees.decoder(Donnees.encoder(d)))
    }

    @Test
    fun laNotificationUneFoisEtSeulementPourCeQuiCompte() {
        assertEquals("alertes-urgentes", Notifications.canal(rouge))
        assertEquals("alertes", Notifications.canal(orange))
        assertEquals("alertes", Notifications.canal(systeme))
        assertNull(Notifications.canal(jaune))
        val lues = listOf(rouge, orange, jaune).associateBy { Notifications.cle(it, "Sud") }
        val (nouvelles, parties) = Notifications.aFaire(lues, setOf(Notifications.cle(orange, "Sud"), "Sud|ancienne|JAUNE"))
        // L'orange déjà dite ne l'est pas deux fois ; le jaune, jamais ; l'ancienne est retirée.
        assertEquals(listOf(rouge), nouvelles.map { it.second })
        assertEquals(setOf("Sud|ancienne|JAUNE"), parties)
        // Une même alerte pour une autre zone est une autre notification.
        assertEquals(false, Notifications.cle(orange, "Sud") == Notifications.cle(orange, "Est"))
    }

    @Test
    fun lesFortesPluiesOrangeOuRougeDonnentLeurNotification() {
        // L'alerte pluie : la vigilance fortes pluies / orages de Météo-France, jamais une prévision de pluie.
        val pluieOrange = Alerte("Vigilance orange fortes pluies / orages", "orange du 23/11 06:00 au 23/11 18:00", Couleur.ORANGE, "05:47")
        val pluieRouge = Alerte("Vigilance rouge fortes pluies / orages", null, Couleur.ROUGE, "05:47")
        assertEquals("alertes", Notifications.canal(pluieOrange))
        assertEquals("alertes-urgentes", Notifications.canal(pluieRouge))
        val (nouvelles, _) = Notifications.aFaire(listOf(pluieOrange).associateBy { Notifications.cle(it, "Est") }, emptySet())
        assertEquals(listOf(pluieOrange), nouvelles.map { it.second })
        // Montée au rouge : une autre notification, en haut de l'écran.
        val (montee, _) = Notifications.aFaire(listOf(pluieRouge).associateBy { Notifications.cle(it, "Est") }, nouvelles.map { it.first }.toSet())
        assertEquals(listOf(pluieRouge), montee.map { it.second })
    }
}
