package re.rundata.app

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Une réponse lue reste en copie quelques minutes sur le téléphone : l'écran, chaque widget et la mise à jour de fond
 * ne relisent pas ce que le site vient de donner (le site lui-même ne relit ses sources que toutes les quelques minutes).
 */
class CopieTest {
    private val resume = requireNotNull(javaClass.getResource("/mcp/resume-saint-pierre-2.json")).readText()
    private val vigilance = requireNotNull(javaClass.getResource("/mcp/vigilance-saint-pierre.json")).readText()

    /** Le serveur de l'essai : compte les lectures de chaque outil ; `panne` : il ne répond plus. */
    private class Serveur(val resume: String, val vigilance: String) {
        val lectures = mutableMapOf<String, Int>()
        var panne = false
        val mcp = RundataMcp(HttpClient(MockEngine { r ->
            val corps = (r.body as TextContent).text
            val outil = Regex("\"name\":\"([a-z_]+)\"").find(corps)!!.groupValues[1]
            lectures[outil] = (lectures[outil] ?: 0) + 1
            val texte = when (outil) {
                "resume_du_jour" -> resume
                "vigilance_meteo" -> vigilance
                else -> null
            }
            if (panne || texte == null) respond("", HttpStatusCode.ServiceUnavailable)
            else respond(texte, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }), "rundata.re-android/test")
    }

    private val saintPierre = COMMUNES.first { it.slug == "saint-pierre" }
    private val saintDenis = COMMUNES.first { it.slug == "saint-denis" }

    @Test
    fun uneCommuneRelueToutDeSuiteNeRelitPasLeSite() = runTest {
        val s = Serveur(resume, vigilance)
        val source = JourneeSource(s.mcp)
        val a = source.journeeEtAlertes(saintPierre)
        val b = source.journeeEtAlertes(saintPierre)
        assertEquals(a, b)
        assertEquals(1, s.lectures["resume_du_jour"])
        assertEquals(1, s.lectures["vigilance_meteo"])
    }

    @Test
    fun apresCinqMinutesLaCommuneEstRelue() = runTest {
        val s = Serveur(resume, vigilance)
        val temps = kotlin.time.TestTimeSource()
        val source = JourneeSource(s.mcp, copie = Copie(temps))
        source.journeeEtAlertes(saintPierre)
        temps += kotlin.time.Duration.parse("4m")
        source.journeeEtAlertes(saintPierre)
        assertEquals(1, s.lectures["resume_du_jour"])
        temps += kotlin.time.Duration.parse("2m")
        source.journeeEtAlertes(saintPierre)
        assertEquals(2, s.lectures["resume_du_jour"])
    }

    @Test
    fun unEchecNEstPasGarde() = runTest {
        val s = Serveur(resume, vigilance)
        val source = JourneeSource(s.mcp)
        s.panne = true
        kotlin.runCatching { source.journeeEtAlertes(saintPierre) }
        s.panne = false
        source.journeeEtAlertes(saintPierre)
        assertEquals(2, s.lectures["resume_du_jour"])
    }

    @Test
    fun lesCyclonesDeLIleSontLusUneFoisPourToutesLesCommunes() = runTest {
        val s = Serveur(resume, vigilance)
        val source = JourneeSource(s.mcp)
        source.journeeEtAlertes(saintPierre)
        source.journeeEtAlertes(saintDenis)
        // `cyclones` ne répond pas ici : un échec n'est pas gardé, il est relu.
        assertEquals(2, s.lectures["cyclones"])
        assertEquals(2, s.lectures["resume_du_jour"])
    }
}
