package re.rundata.app

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Duration.Companion.minutes
import kotlin.time.TestTimeSource

/** L'écran principal est relu quand il revient au premier plan et que sa lecture date. */
class ModeleTest {
    private val resume = requireNotNull(javaClass.getResource("/mcp/resume-saint-pierre-2.json")).readText()

    @Test
    fun lEcranEstReluAuRetourQuandIlDate() = runTest {
        var lectures = 0
        val mcp = RundataMcp(HttpClient(MockEngine { r ->
            if ("\"name\":\"resume_du_jour\"" in (r.body as TextContent).text) {
                lectures++
                respond(resume, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            } else respond("", HttpStatusCode.ServiceUnavailable)
        }), "rundata.re-android/test")
        val reglages = object : Reglages { override var commune: String? = "saint-pierre" }
        val temps = TestTimeSource()
        val modele = Modele(JourneeSource(mcp, copie = Copie(temps)), reglages, backgroundScope, temps)
        modele.etat.first { it is Etat.Prete }
        assertEquals(1, lectures)

        // Revenu tout de suite : rien de neuf à lire.
        temps += 2.minutes
        modele.revenir()
        assertEquals(1, lectures)
        assertEquals(true, modele.etat.value is Etat.Prete)

        // Revenu après plus de dix minutes : relu.
        temps += 9.minutes
        modele.revenir()
        modele.etat.first { it is Etat.Prete && lectures == 2 }
        assertEquals(2, lectures)
    }
}
