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
        val j = JourneeSource(serveur(mapOf("resume_du_jour" to enregistree("resume-saint-pierre-2"), "vigilance_meteo" to enregistree("vigilance-saint-pierre")), vues)).journee(saintPierre)
        assertEquals(Mesure("26\u00a0°C", "Saint-Pierre Pierrefonds (aéroport)", 5.9, "21/11 19:30"), j.mesure)
        assertEquals("19:30", j.mesure!!.heureSeule)
        val v = assertNotNull(j.vigilance)
        assertEquals("Sud", v.zone)
        assertEquals(Couleur.VERT, v.couleur)
        assertFalse(v.enPremier)
        assertTrue(v.texte.startsWith("Vigilance météo\u00a0: verte pour le Sud"))
        assertEquals(emptyList(), j.coupures)
        // Saint-Pierre n'est pas une commune du volcan : le résumé n'en dit rien.
        assertNull(j.volcan)
        assertEquals("21/11 19:35", j.lueA)
        assertTrue(j.sources.any { "Météo-France" in it.nom && it.licence != null })
        // Citer : rundata.re et les producteurs, et l'heure de lecture.
        assertEquals("Source\u00a0: rundata.re, d'après Météo-France et d'autres sources. Lu à 19:35, heure de La Réunion.", Mots.source(j))
        assertEquals("mesurée à 19:30, heure de La Réunion, station Saint-Pierre Pierrefonds (aéroport), à 5,9 km", Mots.mesureA(j.mesure!!))
        // Deux appels : la mesure était dans le résumé. Le User-Agent dit qui lit.
        assertEquals(2, vues.size)
        assertTrue(vues.all { it.headers[HttpHeaders.UserAgent] == "rundata.re-android/test" })
    }

    @Test
    fun laMesureDeMeteoActuelleQuandLeResumeLaLaisseDeCote() = runTest {
        // 19:35 : « météo mesurée et prévue : copie de 21/11 14:40, trop ancienne », dans non_inclus.
        val j = JourneeSource(serveur(mapOf(
            "resume_du_jour" to enregistree("resume-saint-pierre"),
            "vigilance_meteo" to enregistree("vigilance-saint-pierre"),
            "meteo_actuelle" to enregistree("meteo-saint-pierre"),
        ))).journee(saintPierre)
        assertEquals(Mesure("26\u00a0°C", "Saint-Pierre Pierrefonds (aéroport)", 5.9, "21/11 19:30"), j.mesure)
    }

    @Test
    fun sansVigilanceDeLOutilLaCouleurNestPasInventee() = runTest {
        val j = JourneeSource(serveur(mapOf("resume_du_jour" to enregistree("resume-saint-pierre-2"), "vigilance_meteo" to null))).journee(saintPierre)
        assertEquals(Couleur.AUCUNE, j.vigilance?.couleur)
        assertNotNull(j.mesure)
    }

    @Test
    fun uneErreurDuServeurEstDite() = runTest {
        assertFailsWith<McpErreur> {
            JourneeSource(serveur(mapOf("resume_du_jour" to null, "vigilance_meteo" to null))).journee(saintPierre)
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
        val j = JourneeSource(serveur(mapOf("resume_du_jour" to enregistree("resume-saint-denis"), "vigilance_meteo" to null))).journee(communeDe("saint-denis")!!)
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
}
