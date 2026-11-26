package re.rundata.app.android.widget

import re.rundata.app.AvisEau
import re.rundata.app.Couleur
import re.rundata.app.InfoRoute
import re.rundata.app.Pastille
import re.rundata.app.Prevision
import re.rundata.app.Sortie
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class LignesTest {
    private val lue = Donnees("Saint-Pierre", "26 °C", "19:30", "Saint-Pierre Pierrefonds (aéroport)", "Sud", false, null, etat = "verte", slug = "saint-pierre")

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
        // Le bandeau 4×1 : la première pastille, ou les mots tels quels.
        assertEquals("Vigilance orange vents forts" to Pastille("Vigilance orange vents forts", Couleur.ORANGE), vigilanceCourte(lue.copy(etat = "orange vents forts, jaune fortes pluies / orages")))
        assertEquals("Pas de vigilance émise" to null, vigilanceCourte(lue.copy(etat = "pas de vigilance émise")))
        assertNull(vigilanceCourte(lue.copy(etat = null)))
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
        assertEquals("rundata.re injoignable à 20:05 : mesure de 19:30.", l.alerte)
        assertEquals("rundata.re injoignable à 20:05 : lu à 19:35.", horsLigne(lue.copy(temperature = null, lueA = "19:35", echecA = "20:05")))
    }

    @Test
    fun jamaisUneValeurInventee() {
        val rien = Donnees("Cilaos", null, null, null, null, false, "08:00", slug = "cilaos")
        val l = lignes(rien, "Cilaos")
        assertNull(l.grande)
        assertEquals(emptyList(), l.vigilance)
        assertEquals("rundata.re injoignable à 08:00.", l.alerte)
        // Une autre commune que celle du widget : sa mesure n'est pas montrée.
        assertNull(lignes(lue, "Cilaos").grande)
        assertEquals("Toucher pour choisir une commune.", lignes(null, null).detail)
    }

    @Test
    fun laPrevisionEstDiteCommeUnePrevision() {
        assertEquals("Prévision : de 24,1 °C à 25,2 °C, pas de pluie prévue de 20 h à minuit.", lignePrevision(Prevision("24,1 °C", "25,2 °C", "pas de pluie prévue de 20 h à minuit")))
        assertEquals("Prévision : 26 °C.", lignePrevision(Prevision("26 °C", "26 °C", null)))
        assertNull(lignePrevision(Prevision(null, null, null)))
        // Grand widget seulement, jamais à la place d'une vigilance.
        assertEquals("Prévision : 26 °C.", lignes(lue.copy(prevision = "Prévision : 26 °C."), "Saint-Pierre").prevision)
    }

    @Test
    fun leGrandWidgetSortirLesRoutesEtLEau() {
        val d = lue.copy(
            sorties = listOf(
                ligneSortie(Sortie("Concert au théâtre", "à 20 h", "Théâtre Luc Donat", "ANNULÉ", null)),
                ligneSortie(Sortie("Marché forain de Saint-Pierre", "de 5 h à 12 h", null, null, null, marche = true)),
                ligneSortie(Sortie("Marché couvert", "de 7 h à 17 h", null, null, null, marche = true)),
            ),
            routes = emptyList(),
            bus = listOf(ligneRoute(InfoRoute("Arrêt Barachois non desservi", null, "Car Jaune O2", null))),
            distributeur = "runéo",
        )
        val (sortir, routes, eau) = sections(d, 2)
        // ANNULÉ en premier, puis quand et où.
        assertEquals(Ligne("ANNULÉ · Concert au théâtre", "à 20 h · Théâtre Luc Donat"), sortir.lignes.first())
        assertEquals(1, sortir.enPlus)
        assertEquals("et 1 autre sur rundata.re", enPlus(sortir.enPlus))
        assertEquals(listOf(Ligne("Arrêt Barachois non desservi", "Car Jaune O2")), routes.lignes)
        // Pas d'avis lu : « pas d'avis de coupure », jamais « pas de coupure ».
        assertEquals(emptyList(), eau.lignes)
        assertEquals("Pas d'avis de coupure récent ou à venir, d'après runéo.", eau.vide)
        // Les médias lus, rien sur les routes ; pas lus : dit autrement.
        assertEquals("Aucune information des médias sur les routes ces dernières heures.", sections(d.copy(bus = emptyList()), 1)[1].vide)
        assertEquals("Informations des médias non lues pour l'instant.", sections(d.copy(routes = null), 1)[1].vide)
        assertEquals("Agendas non lus pour l'instant.", sections(d.copy(sorties = null), 1)[0].vide)
    }

    @Test
    fun ceQuiEstGardeSeRelitEtUnAncienFormatEstRelu() {
        val d = lue.copy(sorties = listOf(Ligne("Marché", "de 5 h à 12 h")), routes = null, mer = "27 °C")
        assertEquals(d, Donnees.decoder(Donnees.encoder(d)))
        assertNull(Donnees.decoder(Donnees.encoder(d.copy(format = 3))))
        assertNull(Donnees.decoder("{illisible"))
        assertNull(Donnees.decoder(null))
    }

    @Test
    fun laLigneDEauDitQuoiQuandEtOu() {
        val boire = AvisEau("Qualité de l'eau", nePasBoire = true, lien = "https://dioneo.re/flash-info/qualite-de-leau-15", secteurs = listOf("TRAITEMENT ST FRANCOIS"))
        assertEquals("Eau à ne pas boire, secteur Traitement St Francois.", ligneEau(boire))
        val travaux = AvisEau(
            "Travaux sur le réseau", false, null, de = "lundi 23/11 à 21:00", a = "mardi 24/11 à 04:00", etat = "à venir",
            secteurs = listOf("CHEMIN DE BOIS ROUGE", "CHEMIN DE LA ROSERAIE", "CHEMIN DU VERGER"),
        )
        assertEquals("Coupure d'eau du lundi 23/11 à 21:00 au mardi 24/11 à 04:00 (à venir), secteurs Chemin de Bois Rouge et 2 autres.", ligneEau(travaux))
        // Ni date ni secteur : le titre de l'avis.
        assertEquals("Coupure d'eau : Lavage de réservoir.", ligneEau(AvisEau("Lavage de réservoir", false, null)))
        assertEquals("Rue Michel Ha-Sam", nomDeSecteur("RUE MICHEL HA-SAM"))
        assertEquals("Les Hauts de Sainte-Marie", nomDeSecteur("Les Hauts de Sainte-Marie"))
    }

    @Test
    fun uneMesureDUnAutreJourLeDit() {
        val l = lignes(lue.copy(heure = "20/11 23:50", lueA = "21/11 00:05"), "Saint-Pierre")
        assertEquals("mesurée le 20/11 à 23:50, Saint-Pierre Pierrefonds (aéroport)", l.detail)
        assertEquals("Lu le 21/11 à 00:05", l.lue)
        assertEquals("mesurée à 00:02, Saint-Pierre Pierrefonds (aéroport)", lignes(lue.copy(heure = "21/11 00:02", lueA = "21/11 00:05"), "Saint-Pierre").detail)
        assertEquals(
            "rundata.re injoignable le 22/11 à 08:00\u00a0: mesure du 21/11 à 23:50.",
            horsLigne(lue.copy(heure = "21/11 23:50", lueA = "21/11 23:55", echecA = "22/11 08:00")),
        )
    }

    /** La mer du widget dit le jour du passage du satellite (avant 0.3.4 : « mer, par satellite », sans date). */
    @Test
    fun laMerDitLeJourDeSaMesure() {
        kotlin.test.assertEquals("mer, vue par satellite le 21/11", libelleMer("21/11"))
        kotlin.test.assertEquals("mer, vue par satellite", libelleMer(null))
    }

    /**
     * Une bouée mesure près de la commune : le widget dit la bouée et l'heure de sa mesure, pas le satellite. Sans son nom :
     * « mer, bouée Saint-Pierre (large) à 22:50 » était coupé dans le 4×1 (émulateur, 24/11) ; le nom est sur la page /mer.
     */
    @Test
    fun laMerDitLaBoueeQuandElleMesure() {
        // « à » et l'heure ne se séparent pas : à 200 %, le libellé passe sur trois lignes et l'heure n'y est jamais seule ni perdue (item 2132).
        kotlin.test.assertEquals("mer, bouée à\u00a022:50", libelleMer(null, bouee = "Saint-Pierre (large)", heure = "22:50"))
        kotlin.test.assertTrue(libelleMer(null, bouee = "Saint-Pierre (large)", heure = "22:50").length <= "mer, vue par satellite".length)
    }

    /**
     * Les grands nombres (température, mer) grossissent avec la taille du texte d'Android jusqu'à 130 %, pas au-delà :
     * à 200 %, le 4×1 coupait « 25,1 °C » en « 25,… » (émulateur, 24/11). Les petits textes, eux, suivent le réglage.
     */
    @Test
    fun lesGrandsNombresRestentEntiersQuandLeTexteGrossit() {
        kotlin.test.assertEquals(22f, tailleChiffre(22f, 1f))
        kotlin.test.assertEquals(22f, tailleChiffre(22f, 1.3f))
        // À 200 % : 22 × 1,3 = 28,6 à l'écran, donc 14,3 avant le réglage.
        kotlin.test.assertEquals(28.6f, tailleChiffre(22f, 2f) * 2f, 0.01f)
        kotlin.test.assertEquals(34f, tailleChiffre(34f, 0.85f))
    }
}
