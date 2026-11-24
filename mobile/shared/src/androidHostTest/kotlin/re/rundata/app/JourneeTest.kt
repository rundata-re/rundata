package re.rundata.app

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Sur des réponses réelles du serveur MCP de rundata.re, enregistrées le 21/11/2026 vers 19:35 (heure de La Réunion)
 * pour Saint-Pierre ; seuls les titres des infos routes en ont été retirés.
 */
class JourneeTest {
    private fun enregistree(nom: String): String =
        requireNotNull(javaClass.getResource("/mcp/$nom.json")) { "réponse enregistrée $nom absente" }.readText()

    private val saintPierre = communeDe("saint-pierre")!!

    /** Un serveur qui rend la réponse enregistrée de chaque outil, et note les requêtes. */
    private fun serveur(reponses: Map<String, String?>, vues: MutableList<HttpRequestData> = mutableListOf()) =
        RundataMcp(HttpClient(MockEngine { requete ->
            vues += requete
            val corps = (requete.body as TextContent).text
            val outil = reponses.keys.first { "\"name\":\"$it\"" in corps }
            val r = reponses[outil]
            if (r == null) respond("", HttpStatusCode.ServiceUnavailable)
            else respond(r, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }), "rundata.re-android/test")

    @Test
    fun laJourneeDuResumeAvecLaMesureLaVigilanceEtLesSources() = runTest {
        val vues = mutableListOf<HttpRequestData>()
        val j = JourneeSource(serveur(mapOf("resume_du_jour" to enregistree("resume-saint-pierre-2")), vues)).journee(saintPierre)
        assertEquals(Mesure("26\u00a0°C", "Saint-Pierre Pierrefonds (aéroport)", 5.9, "21/11 19:30"), j.mesure)
        assertEquals("19:30", j.mesure!!.heureSeule)
        val v = assertNotNull(j.vigilance)
        assertEquals("Sud", v.zone)
        assertEquals(listOf(Pastille("Vigilance verte", Couleur.VERT)), v.pastilles)
        assertEquals("verte", v.etat)
        assertFalse(v.enPremier)
        assertTrue(v.texte.startsWith("Vigilance météo\u00a0: verte pour le Sud"))
        assertEquals(emptyList(), j.coupures)
        // Saint-Pierre n'est pas une commune du volcan : le résumé n'en dit rien.
        assertNull(j.volcan)
        assertEquals("21/11 19:35", j.lueA)
        assertTrue(j.sources.any { "Météo-France" in it.nom && it.licence != null })
        // Citer : rundata.re et les producteurs, et l'heure de lecture.
        assertEquals("Source\u00a0: rundata.re, d'après Météo-France et d'autres sources. Lu le 21/11 à 19:35, heure de La Réunion.", Mots.source(j))
        // La mesure du jour de la lecture dit son heure seule ; sans lecture à laquelle la rapporter, son jour aussi.
        assertEquals("mesurée à 19:30, heure de La Réunion, station Saint-Pierre Pierrefonds (aéroport), à 5,9 km", Mots.mesureA(j.mesure!!, j.lueA))
        assertEquals("mesurée le 21/11 à 19:30, heure de La Réunion, station Saint-Pierre Pierrefonds (aéroport), à 5,9 km", Mots.mesureA(j.mesure!!))
        // Un seul appel : la mesure était dans le résumé, et la vigilance s'y lit. Le User-Agent dit qui lit.
        assertEquals(1, vues.size)
        assertTrue(vues.all { it.headers[HttpHeaders.UserAgent] == "rundata.re-android/test" })
    }

    @Test
    fun laMesureDeMeteoActuelleQuandLeResumeLaLaisseDeCote() = runTest {
        // 19:35 : « météo mesurée et prévue : copie de 21/11 14:40, trop ancienne », dans non_inclus.
        val j = JourneeSource(serveur(mapOf(
            "resume_du_jour" to enregistree("resume-saint-pierre"),
            "meteo_actuelle" to enregistree("meteo-saint-pierre"),
        ))).journee(saintPierre)
        assertEquals(Mesure("26\u00a0°C", "Saint-Pierre Pierrefonds (aéroport)", 5.9, "21/11 19:30"), j.mesure)
    }

    @Test
    fun laPastilleDitLeTexteDeLaZoneEtSaCouleur() {
        // Les formes que le serveur écrit (src/tools/vigilance.ts, zoneText) : la pastille reprend le texte mot pour mot.
        val vert = "Vigilance météo\u00a0: verte pour le Sud (Météo-France), la zone de Saint-Pierre."
        assertEquals("verte", etatDe(vert))
        assertEquals(listOf(Pastille("Vigilance verte", Couleur.VERT)), pastillesDe(etatDe(vert)))
        val deux = "Vigilance météo\u00a0: orange vents forts, jaune fortes pluies / orages pour l'Est (Météo-France), la zone de Saint-Benoît."
        assertEquals("orange vents forts, jaune fortes pluies / orages", etatDe(deux))
        // Deux phénomènes : deux pastilles, chacune dans la couleur que la phrase lui donne, jamais l'orange pour la pluie.
        assertEquals(
            listOf(Pastille("Vigilance orange vents forts", Couleur.ORANGE), Pastille("Vigilance jaune fortes pluies / orages", Couleur.JAUNE)),
            pastillesDe(etatDe(deux)),
        )
        assertEquals(listOf(Pastille("Vigilance violette vents forts", Couleur.VIOLET)), pastillesDe("violette vents forts"))
        // Rien d'émis : ni couleur, ni vert inventé.
        val rien = "Vigilance météo\u00a0: pas de vigilance émise pour le Nord (Météo-France), la zone de Saint-Denis."
        assertEquals("pas de vigilance émise", etatDe(rien))
        assertEquals(emptyList(), pastillesDe(etatDe(rien)))
        assertNull(etatDe("Vigilance indisponible."))
        assertEquals(emptyList(), pastillesDe(null))
    }

    @Test
    fun uneErreurDuServeurEstDite() = runTest {
        assertFailsWith<McpErreur> {
            JourneeSource(serveur(mapOf("resume_du_jour" to null))).journee(saintPierre)
        }
        assertFailsWith<McpErreur> {
            lireReponse("""{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"erreur\":\"Lieu inconnu\"}"}],"isError":true}}""", false)
        }
    }

    @Test
    fun uneReponseEnFluxDEvenementsEstLue() {
        val o = lireReponse("event: message\ndata: " + enregistree("vigilance-saint-pierre").trim() + "\n\n", true)
        assertTrue("niveaux" in o)
    }

    @Test
    fun lesCoupuresDEauAvecLeursDatesEtLeursSecteurs() = runTest {
        val j = JourneeSource(serveur(mapOf("resume_du_jour" to enregistree("resume-saint-denis")))).journee(communeDe("saint-denis")!!)
        assertEquals(6, j.coupures.size)
        val boire = j.coupures.first()
        assertTrue(boire.nePasBoire)
        assertEquals(listOf("TRAITEMENT ST FRANCOIS"), boire.secteurs)
        val travaux = j.coupures[1]
        // Les heures telles que le serveur les écrit, avec une espace insécable après « à ».
        assertEquals("du jeudi 26/11 à\u00a021:00 au vendredi 27/11 à\u00a004:00 (à\u00a0venir)", Mots.quand(travaux))
        assertEquals("Secteurs\u00a0: RUE SAINTE ANNE, RUE MICHEL HA-SAM", Mots.secteurs(travaux))
        assertEquals("Secteurs\u00a0: RUE LORY LES HAUTS, RUE LORY LES BAS, RUE GABRIEL LAHUPPE et 4 autres", Mots.secteurs(j.coupures[3]))
        assertNull(Mots.secteurs(j.coupures.last()))
    }

    @Test
    fun lesAvisDEauVontDuPlusProcheAuPlusLointain() = runTest {
        val j = JourneeSource(serveur(mapOf("resume_du_jour" to enregistree("resume-saint-denis")))).journee(communeDe("saint-denis")!!)
        // Dionéo les donne du plus récent au plus ancien : l'écran disait le 26/11 avant la coupure de ce soir (24/11/2026).
        val ordre = avisDansLOrdre(j.coupures, 11).map { it.titre to it.de }
        assertEquals(
            listOf(
                "Qualité de l'eau" to null,
                "Travaux sur le réseau AEP Chemin Bois Rouge La bretagne" to "lundi 23/11 à\u00a021:00",
                "Travaux sur le réseau" to "mardi 24/11 à\u00a021:00",
                "Lavage de réservoir" to "mercredi 25/11 à\u00a008:00",
                "Travaux sur le réseau" to "mercredi 25/11 à\u00a021:00",
                "Travaux sur le réseau" to "jeudi 26/11 à\u00a021:00",
            ),
            ordre,
        )
        // Une coupure terminée en dernier, une en cours avant celles à venir.
        val fin = j.coupures[1].copy(titre = "Finie", etat = "terminée")
        val enCours = j.coupures[2].copy(titre = "En cours", etat = "en cours")
        assertEquals(listOf("Qualité de l'eau", "En cours"), avisDansLOrdre(listOf(fin) + j.coupures + enCours, 11).map { it.titre }.take(2))
        assertEquals("Finie", avisDansLOrdre(listOf(fin) + j.coupures, 11).last().titre)
    }

    @Test
    fun lAvisDEauDitEnPremierQuandLaPlaceManque() = runTest {
        val j = JourneeSource(serveur(mapOf("resume_du_jour" to enregistree("resume-saint-denis")))).journee(communeDe("saint-denis")!!)
        // L'eau à ne pas boire d'abord.
        assertEquals("Qualité de l'eau", avisEnPremier(j.coupures, 11)?.titre)
        // Sans elle, la prochaine coupure : le lundi 23/11, bien que donnée en dernier des travaux.
        val coupures = j.coupures.filterNot { it.nePasBoire }
        assertEquals("Travaux sur le réseau AEP Chemin Bois Rouge La bretagne", avisEnPremier(coupures, 11)?.titre)
        // En cours avant à venir ; janvier après décembre.
        val enCours = coupures.last().copy(etat = "en cours")
        assertEquals(enCours, avisEnPremier(coupures + enCours, 11))
        val janvier = AvisEau("Janvier", false, null, de = "lundi 04/01 à\u00a008:00")
        val decembre = AvisEau("Décembre", false, null, de = "jeudi 31/12 à\u00a008:00")
        assertEquals("Décembre", avisEnPremier(listOf(janvier, decembre), 12)?.titre)
        assertNull(avisEnPremier(emptyList(), 11))
    }

    @Test
    fun uneCoupureTermineeNEstJamaisLaProchaine() {
        // Le serveur garde les avis récents : une coupure finie hier commence avant celle de demain.
        val finie = AvisEau("Finie", false, null, de = "dimanche 22/11 à 21:00", a = "lundi 23/11 à 04:00", etat = "terminée")
        val demain = AvisEau("Demain", false, null, de = "mardi 24/11 à 21:00", a = "mercredi 25/11 à 04:00", etat = "à venir")
        assertEquals("Demain", avisEnPremier(listOf(finie, demain), 11)?.titre)
        assertNull(avisEnPremier(listOf(finie), 11))
    }

    @Test
    fun lesDistancesCommeLeSiteLesEcrit() {
        assertEquals("5,9 km", Mots.km(5.9))
        assertEquals("6 km", Mots.km(6.04))
        assertEquals("13 km", Mots.km(13.2))
    }

    @Test
    fun lesVingtQuatreCommunesEtLeursPages() {
        assertEquals(24, COMMUNES.size)
        assertEquals(24, COMMUNES.map { it.slug }.toSet().size)
        assertEquals("https://rundata.re/aujourdhui/l-etang-sale", communeDe("l-etang-sale")!!.pageDuJour)
    }

    @Test
    fun laMerLaPrevisionLesSortiesEtLesRoutesDuResume() = runTest {
        val j = JourneeSource(serveur(mapOf("resume_du_jour" to enregistree("resume-saint-denis")))).journee(communeDe("saint-denis")!!)
        assertEquals(Mer("27\u00a0°C", "Saint-Denis", "21/11"), j.mer)
        // Une PRÉVISION, gardée à part de la mesure.
        assertEquals(Prevision("24,1\u00a0°C", "25,2\u00a0°C", "pas de pluie prévue de 20\u00a0h à minuit"), j.prevision)
        val sorties = assertNotNull(j.sorties)
        assertEquals("Exposition Hugues Savalli - 2026", sorties.first().titre)
        assertEquals("Musée Léon Dierx", sorties.first().lieu)
        assertEquals("https://www.departement974.fr/agenda/exposition-hugues-savalli-2026", sorties.first().lien)
        val routes = assertNotNull(j.routes)
        // Lues, et rien sur les routes : une liste vide, pas null.
        assertEquals(emptyList(), routes.infos)
        assertEquals(InfoRoute("Arrêt \"Barachois\" non desservi et reporté", null, "Car Jaune O2", null), routes.bus.single())
        assertTrue(routes.littoral!!.startsWith("Pas d'annonce récente sur la route du Littoral"))
        assertEquals("Dionéo", j.distributeur)
        // Les marchés du jour suivent les événements.
        val sp = JourneeSource(serveur(mapOf("resume_du_jour" to enregistree("resume-saint-pierre")))).journee(saintPierre)
        assertEquals(listOf("Marché forain de Saint-Pierre", "Marché couvert de Saint-Pierre"), sp.sorties!!.map { it.titre })
        assertEquals("de 5\u00a0h à\u00a012\u00a0h", sp.sorties!!.first().quand)
        assertTrue(sp.sorties!!.all { it.marche })
    }
}
