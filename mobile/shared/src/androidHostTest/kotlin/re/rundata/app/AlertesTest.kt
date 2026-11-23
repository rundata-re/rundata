package re.rundata.app

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Les alertes du bandeau, tirées des réponses de vigilance_meteo et de cyclones, telles que le serveur les donne. */
class AlertesTest {
    private fun json(texte: String): JsonObject = Json.parseToJsonElement(texte).jsonObject

    private fun vigilance(niveaux: String, cyclone: String = "Pas d'alerte cyclonique en cours.", cote: String = "\"pas de vigilance particulière sur le littoral\"") = json(
        """{"zone_vigilance":"Sud : Saint-Pierre, Le Tampon","emise":"23/11 05:47 heure de La Réunion","alerte_cyclonique":"$cyclone",
        "niveaux":[$niveaux],"vagues_submersion":$cote,"officiel":"Consulter le site officiel de Météo-France : https://vigilance.meteofrance.fr/fr/la-reunion"}""",
    )

    private val vert = """{"phenomene":"Vents forts","maintenant":"vert"},{"phenomene":"Fortes pluies / orages","maintenant":"vert"}"""
    private val horsSaison = json("""{"alerte_cyclonique":"Pas d'alerte cyclonique en cours.","saison_en_cours":{"nom":"2026-2027","systemes":[]}}""")

    @Test
    fun toutVertNiCycloneRienAuBandeau() {
        val a = alertesDe(vigilance(vert), horsSaison)
        assertEquals(emptyList(), a.liste)
        assertEquals("Sud", a.zone)
        assertEquals("23/11 05:47", a.emise)
        assertTrue(a.vigilanceLue)
    }

    @Test
    fun uneVigilanceOrangeDansSaCouleurAvecSonHeure() {
        val a = alertesDe(
            vigilance("""{"phenomene":"Vents forts","maintenant":"orange","a_venir":["orange du 23/11 06:00 au 23/11 18:00"]},{"phenomene":"Fortes pluies / orages","maintenant":"jaune"}"""),
            horsSaison,
        )
        assertEquals(
            listOf(
                Alerte("Vigilance orange vents forts", "orange du 23/11 06:00 au 23/11 18:00", Couleur.ORANGE, "23/11 05:47"),
                Alerte("Vigilance jaune fortes pluies / orages", null, Couleur.JAUNE, "23/11 05:47"),
            ),
            a.liste,
        )
        assertFalse(a.premiere!!.urgente)
    }

    @Test
    fun unePeriodeAVenirEstDiteAVenir() {
        val a = alertesDe(vigilance("""{"phenomene":"Fortes pluies / orages","maintenant":"vert","a_venir":["jaune à partir du 23/11 18:00"]}"""), null)
        assertEquals(Alerte("Vigilance jaune fortes pluies / orages à venir", "jaune à partir du 23/11 18:00", Couleur.JAUNE, "23/11 05:47"), a.premiere)
    }

    @Test
    fun lesVaguesSubmersionDeLaCote() {
        val a = alertesDe(vigilance(vert, cote = """[{"zone":"Zone côtière du Sud","phenomene":"Vagues - submersion","couleur_max":"jaune","periodes":["jaune du 23/11 12:00 au 24/11 06:00"]}]"""), null)
        assertEquals(Alerte("Vigilance jaune vagues-submersion", "zone côtière du Sud, jaune du 23/11 12:00 au 24/11 06:00", Couleur.JAUNE, "23/11 05:47"), a.premiere)
    }

    @Test
    fun lAlerteCycloniqueEnPremierEtUrgente() {
        val a = alertesDe(
            vigilance(
                """{"phenomene":"Vents forts","maintenant":"rouge"}""",
                cyclone = "ALERTE CYCLONIQUE rouge, « je me confine » : danger imminent.",
            ),
            null,
        )
        assertEquals(Alerte("Alerte cyclonique rouge", "« je me confine » : danger imminent", Couleur.ROUGE, "23/11 05:47", cyclonique = true), a.liste[0])
        assertEquals("Vigilance rouge vents forts", a.liste[1].texte)
        assertTrue(a.liste.all { it.urgente })
        assertEquals("$SITE/cyclones", a.liste[0].page)
    }

    @Test
    fun lesPaliersDeLAlerteCyclonique() {
        assertNull(alerteCycloniqueDe("Pas d'alerte cyclonique en cours.", null))
        assertEquals(Alerte("Pré-alerte cyclonique", "« je m'informe » : menace potentielle dans les jours à venir", Couleur.AUCUNE, null, cyclonique = true),
            alerteCycloniqueDe("ALERTE CYCLONIQUE pré-alerte, « je m'informe » : menace potentielle dans les jours à venir.", null))
        assertEquals(Couleur.VIOLET, alerteCycloniqueDe("ALERTE CYCLONIQUE violette, « je me confine strictement » : même les secours ne circulent plus.", null)!!.couleur)
        assertEquals("Phase de sauvegarde cyclonique", alerteCycloniqueDe("ALERTE CYCLONIQUE phase de sauvegarde : le cyclone s'éloigne, le danger demeure.", null)!!.texte)
        val prevue = alerteCycloniqueDe("Alerte cyclonique prévue : orange à partir du 24/11 06:00.", "05:47")!!
        assertEquals(Alerte("Alerte cyclonique orange prévue", "orange à partir du 24/11 06:00", Couleur.ORANGE, "05:47", cyclonique = true), prevue)
        // Un texte d'une autre forme : tel quel, sans couleur inventée.
        assertEquals(Alerte("Alerte cyclonique en cours", null, Couleur.AUCUNE, null, cyclonique = true), alerteCycloniqueDe("Alerte cyclonique en cours.", null))
    }

    @Test
    fun unSystemeActifSansAlerteEstUneInformation() {
        val c = json("""{"alerte_cyclonique":"Pas d'alerte cyclonique en cours.","systemes_actifs":[{"nom":"Bheki","stade":"tempête tropicale modérée","dernier_avis":"23/11 10:00 (heure de La Réunion)"}]}""")
        val a = alertesDe(vigilance(vert), c)
        assertEquals(listOf(Alerte("Tempête tropicale modérée Bheki", null, Couleur.AUCUNE, "23/11 10:00", systeme = true)), a.liste)
        assertFalse(a.premiere!!.urgente)
    }

    @Test
    fun laVigilanceNonLueNeDitPasQuIlNYARien() {
        val a = alertesDe(null, horsSaison)
        assertFalse(a.vigilanceLue)
        assertEquals(emptyList(), a.liste)
        // L'alerte cyclonique des cyclones, à défaut de celle de la vigilance.
        val c = json("""{"alerte_cyclonique":"ALERTE CYCLONIQUE orange, « je me prépare » : danger dans les 24 heures."}""")
        assertEquals("Alerte cyclonique orange", alertesDe(null, c).premiere!!.texte)
    }

    @Test
    fun jamaisLaPrevisionDePluie() {
        // Le résumé du jour peut prévoir de la pluie : il n'est pas lu pour le bandeau, seules la vigilance et les cyclones le sont.
        val a = alertesDe(vigilance(vert), horsSaison)
        assertTrue(a.liste.none { "prévu" in it.texte.lowercase() })
    }

    @Test
    fun laVigilanceVaDuJauneAuRougeLeVioletEstCyclonique() {
        // Une vigilance violette n'existe pas à La Réunion : seul le dispositif cyclonique de la préfecture a le violet.
        val a = alertesDe(vigilance("""{"phenomene":"Vents forts","maintenant":"violet"}"""), null)
        assertEquals(emptyList(), a.liste)
        val pluie = alertesDe(vigilance("""{"phenomene":"Fortes pluies / orages","maintenant":"orange"}"""), null).premiere!!
        assertEquals(Alerte("Vigilance orange fortes pluies / orages", null, Couleur.ORANGE, "23/11 05:47"), pluie)
        assertTrue(alertesDe(vigilance("""{"phenomene":"Fortes pluies / orages","maintenant":"rouge"}"""), null).premiere!!.urgente)
        assertTrue(alerteCycloniqueDe("ALERTE CYCLONIQUE violette, « je me confine strictement » : même les secours ne circulent plus.", null)!!.let { it.cyclonique && it.urgente })
    }

    @Test
    fun laLigneDHeureDuBandeau() {
        assertEquals("Bulletin de Météo-France de 03:31", Mots.heureAlerte(Alerte("Vigilance orange vents forts", null, Couleur.ORANGE, "03:31")))
        assertEquals(
            "Alerte de la préfecture · bulletin de Météo-France de 03:31",
            Mots.heureAlerte(Alerte("Alerte cyclonique orange", null, Couleur.ORANGE, "03:31", cyclonique = true)),
        )
        assertEquals("Avis du CMRS du 23/11 10:00", Mots.heureAlerte(Alerte("Tempête tropicale modérée Bheki", null, Couleur.AUCUNE, "23/11 10:00", systeme = true)))
        // Le bulletin lu porte son jour : un écran ou un widget de la veille le dit.
        assertEquals("Bulletin de Météo-France du 22/11 à 16:21", Mots.heureAlerte(Alerte("Vigilance orange vents forts", null, Couleur.ORANGE, "22/11 16:21")))
    }

    /**
     * Le serveur répond pour toute l'île, sans « niveaux » ni zone, quand il ne rattache le lieu à aucune zone : rien n'est
     * dit de la zone de la commune, jamais « pas d'alerte ».
     */
    @Test
    fun uneVigilanceDeToutLIleNEstPasCelleDeLaZone() {
        val ile = json(
            """{"resume":"Pas d'alerte cyclonique en cours. Vigilances au-dessus du vert : orange vents forts pour Sud.","emise":"23/11 05:47 heure de La Réunion",
            "alerte_cyclonique":"Pas d'alerte cyclonique en cours.","vigilances":[{"zone":"Sud","phenomene":"Vents forts","couleur_max":"orange"}]}""",
        )
        val a = alertesDe(ile, horsSaison)
        assertFalse(a.vigilanceLue)
        assertEquals(emptyList(), a.liste)
        assertTrue(a.cyclonesLus)
        assertFalse(alertesDe(vigilance(vert), null).cyclonesLus)
    }
}
