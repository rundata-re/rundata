package re.rundata.app.android.widget

import re.rundata.app.AvisEau
import re.rundata.app.Couleur
import re.rundata.app.Pastille
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class LignesTest {
    private val lue = Donnees("Saint-Pierre", "26 °C", "19:30", "Saint-Pierre Pierrefonds (aéroport)", "Sud", false, null, etat = "verte")

    @Test
    fun laMesureSonHeureEtLaVigilanceDeLaZone() {
        val l = lignes(lue, "Saint-Pierre")
        assertEquals("26 °C", l.grande)
        assertEquals("mesurée à 19:30, Saint-Pierre Pierrefonds (aéroport)", l.detail)
        // La couleur est celle de la zone de Météo-France, jamais donnée à la commune.
        assertEquals(listOf(Pastille("Vigilance verte", Couleur.VERT)), l.vigilance)
        assertEquals("zone Sud", l.zone)
        // La mention du kit, mot pour mot, sous la vigilance.
        assertEquals("Consulter le site officiel de Météo-France", l.officiel)
        assertNull(l.alerte)
    }

    @Test
    fun laPastilleDitLeTexteDuResumeMotPourMot() {
        val deux = lignes(lue.copy(etat = "orange vents forts, jaune fortes pluies / orages", zone = "Est"), "Saint-Pierre")
        // Une pastille par phénomène, chacune dans sa couleur : jamais l'orange pour la pluie.
        assertEquals(listOf(Pastille("Vigilance orange vents forts", Couleur.ORANGE), Pastille("Vigilance jaune fortes pluies / orages", Couleur.JAUNE)), deux.vigilance)
        assertEquals("zone Est", deux.zone)
        // Rien d'émis : pas de pastille, pas de vert inventé.
        val rien = lignes(lue.copy(etat = "pas de vigilance émise"), "Saint-Pierre")
        assertEquals(emptyList(), rien.vigilance)
        assertEquals("Pas de vigilance émise · zone Sud", rien.zone)
        assertEquals("Consulter le site officiel de Météo-France", rien.officiel)
        // Sans vigilance lue, rien de Météo-France n'est dit.
        assertNull(lignes(lue.copy(etat = null), "Saint-Pierre").officiel)
    }

    @Test
    fun lAvisDEauEtLHeureDeLecture() {
        val l = lignes(lue.copy(eau = "Coupure d'eau du lundi 23/11 à 21:00 (à venir)", lueA = "20:11"), "Saint-Pierre")
        assertEquals("Coupure d'eau du lundi 23/11 à 21:00 (à venir)", l.eau)
        assertEquals("Lu à 20:11", l.lue)
    }

    @Test
    fun horsLigneLaDerniereMesureResteAvecSonHeure() {
        val l = lignes(lue.copy(echecA = "20:05"), "Saint-Pierre")
        assertEquals("26 °C", l.grande)
        assertEquals("rundata.re injoignable à 20:05\u00a0: mesure de 19:30.", l.alerte)
    }

    @Test
    fun jamaisUneValeurInventee() {
        val rien = Donnees("Cilaos", null, null, null, null, false, "08:00")
        val l = lignes(rien, "Cilaos")
        assertNull(l.grande)
        assertEquals(emptyList(), l.vigilance)
        assertEquals("rundata.re injoignable à 08:00.", l.alerte)
        // Une autre commune que la choisie : sa mesure n'est pas montrée.
        assertNull(lignes(lue, "Cilaos").grande)
        assertEquals("Choisir une commune dans l'appli.", lignes(null, null).detail)
    }

    @Test
    fun laLigneDEauDitQuoiQuandEtOu() {
        val boire = AvisEau("Qualité de l'eau", nePasBoire = true, lien = "https://dioneo.re/flash-info/qualite-de-leau-15", secteurs = listOf("TRAITEMENT ST FRANCOIS"))
        assertEquals("Eau à ne pas boire, secteur Traitement St Francois.", ligneEau(boire))
        val travaux = AvisEau(
            "Travaux sur le réseau", false, null, de = "lundi 23/11 à\u00a021:00", a = "mardi 24/11 à\u00a004:00", etat = "à venir",
            secteurs = listOf("CHEMIN DE BOIS ROUGE", "CHEMIN DE LA ROSERAIE", "CHEMIN DU VERGER"),
        )
        assertEquals("Coupure d'eau du lundi 23/11 à\u00a021:00 au mardi 24/11 à\u00a004:00 (à\u00a0venir), secteurs Chemin de Bois Rouge et 2 autres.", ligneEau(travaux))
        // Ni date ni secteur : le titre de l'avis.
        assertEquals("Coupure d'eau\u00a0: Lavage de réservoir.", ligneEau(AvisEau("Lavage de réservoir", false, null)))
        assertEquals("Rue Michel Ha-Sam", nomDeSecteur("RUE MICHEL HA-SAM"))
        assertEquals("Les Hauts de Sainte-Marie", nomDeSecteur("Les Hauts de Sainte-Marie"))
    }
}
