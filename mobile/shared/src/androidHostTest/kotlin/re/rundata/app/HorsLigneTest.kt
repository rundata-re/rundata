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
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/** La dernière journée lue reste sur le téléphone : ouverte sans réseau, l'appli la montre avec son heure. */
class HorsLigneTest {
    private val resume = requireNotNull(javaClass.getResource("/mcp/resume-saint-pierre-2.json")).readText()

    /** Les réglages d'un téléphone, gardés d'un lancement à l'autre. */
    private class Telephone : Reglages {
        override var commune: String? = "saint-pierre"
        val journees = mutableMapOf<String, String>()
        override fun journeeGardee(slug: String) = journees[slug]
        override fun garderJournee(slug: String, json: String) { journees[slug] = json }
    }

    private fun mcp(enLigne: () -> Boolean) = RundataMcp(HttpClient(MockEngine { r ->
        val corps = (r.body as TextContent).text
        // Le serveur de l'essai ne connaît que la journée de Saint-Pierre.
        if (enLigne() && "\"name\":\"resume_du_jour\"" in corps && "Saint-Pierre" in corps) {
            respond(resume, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        } else respond("", HttpStatusCode.ServiceUnavailable)
    }), "rundata.re-android/test")

    @Test
    fun laJourneeLueEstMontreeAuLancementSuivantSansReseau() = runTest {
        val telephone = Telephone()
        var enLigne = true
        val premier = Modele(JourneeSource(mcp { enLigne }), telephone, backgroundScope, horloge = { "24/11 08:00" })
        val lue = (premier.etat.first { it is Etat.Prete } as Etat.Prete).journee
        assertNotNull(telephone.journees["saint-pierre"], "la journée lue est gardée")

        // L'appli est relancée en mode avion : la journée gardée est là pendant la lecture, puis avec l'échec.
        enLigne = false
        val second = Modele(JourneeSource(mcp { enLigne }), telephone, backgroundScope, horloge = { "24/11 09:12" })
        val erreur = second.etat.first { it is Etat.Erreur } as Etat.Erreur
        assertEquals(lue, erreur.precedente)
        assertEquals(lue.lueA, erreur.precedente?.lueA)
        assertEquals("24/11 09:12", erreur.a)
    }

    @Test
    fun uneJourneeGardeeSeRelitTelleQuelle() {
        val j = journeeDe(COMMUNES.first { it.slug == "saint-pierre" }, lireReponse(resume, flux = false), null)
        assertEquals(j, Gardee.de(Gardee.enJson(j)))
        assertNull(Gardee.de("pas du json"))
        assertNull(Gardee.de(Gardee.enJson(j).replace("\"format\":${Gardee.FORMAT}", "\"format\":0")))
        assertNull(Gardee.de(null))
    }

    @Test
    fun laJourneeDUneAutreCommuneNEstPasMontree() = runTest {
        val telephone = Telephone()
        val modele = Modele(JourneeSource(mcp { true }), telephone, backgroundScope, horloge = { "24/11 08:00" })
        modele.etat.first { it is Etat.Prete }
        val saintDenis = COMMUNES.first { it.slug == "saint-denis" }
        modele.choisir(saintDenis)
        val e = modele.etat.first { it is Etat.Erreur } as Etat.Erreur
        assertEquals(saintDenis, e.commune)
        assertNull(e.precedente)
    }
}
