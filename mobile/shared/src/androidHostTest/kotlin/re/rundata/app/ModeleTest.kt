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

    /** Le choix de la commune rouvert, puis Retour : la commune affichée revient, sans nouvelle lecture. */
    @Test
    fun retourDepuisLeChoixRevientALaCommune() = runTest {
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
        val prete = modele.etat.first { it is Etat.Prete }
        modele.changerDeCommune()
        assertEquals(true, modele.etat.value is Etat.Choix)
        assertEquals(true, modele.annulerChoix())
        assertEquals(prete, modele.etat.value)
        assertEquals(1, lectures)
        // Sans commune choisie (premier lancement), Retour n'a rien à rendre : l'appli se ferme, comme avant.
        val neuf = Modele(JourneeSource(mcp, copie = Copie(temps)), object : Reglages { override var commune: String? = null }, backgroundScope, temps)
        assertEquals(false, neuf.annulerChoix())
    }

    /** Le lien « Changer de commune » passe sous le nom avec un grand texte, à côté sinon. */
    @Test
    fun lEnTeteSeMetEnColonneAvecUnGrandTexte() {
        assertEquals(false, enColonne(1.0f))
        assertEquals(false, enColonne(1.15f))
        assertEquals(false, enColonne(1.3f))
        assertEquals(true, enColonne(1.5f))
        assertEquals(true, enColonne(2.0f))
    }

    /** Sans Internet, l'échec dit que le téléphone n'est pas connecté à Internet, et la dernière journée lue reste. */
    @Test
    fun sansReseauLEchecLeDit() = runTest {
        var enLigne = true
        val mcp = RundataMcp(HttpClient(MockEngine { r ->
            if (!enLigne) throw java.net.UnknownHostException("rundata.re")
            if ("\"name\":\"resume_du_jour\"" in (r.body as TextContent).text) respond(resume, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            else respond("", HttpStatusCode.ServiceUnavailable)
        }), "rundata.re-android/test")
        val reglages = object : Reglages { override var commune: String? = "saint-pierre" }
        val temps = TestTimeSource()
        val modele = Modele(JourneeSource(mcp, copie = Copie(temps)), reglages, backgroundScope, temps, reseau = { enLigne })
        val prete = modele.etat.first { it is Etat.Prete } as Etat.Prete
        enLigne = false
        temps += 11.minutes
        modele.rafraichir()
        val erreur = modele.etat.first { it is Etat.Erreur } as Etat.Erreur
        assertEquals(Modele.SANS_RESEAU, erreur.message)
        assertEquals(prete.journee, erreur.precedente)
    }

    @Test
    fun sansInternetLeTexteDitLHeureDesDernieresDonnees() {
        // Un téléphone en Wi-Fi sans Internet a du réseau : on dit qu'il n'est pas connecté à Internet.
        assertEquals("Ce téléphone n'est pas connecté à Internet\u00a0: dernières données de 10:30.", Mots.erreur(Modele.SANS_RESEAU, "24/11 11:20", "24/11 10:30"))
        assertEquals("Ce téléphone n'est pas connecté à Internet\u00a0: dernières données du 23/11 à 18:05.", Mots.erreur(Modele.SANS_RESEAU, "24/11 07:00", "23/11 18:05"))
        assertEquals("Ce téléphone n'est pas connecté à Internet.", Mots.erreur(Modele.SANS_RESEAU, "24/11 11:20", null))
        // Les autres échecs ne changent pas.
        assertEquals("À 11:20, rundata.re ne répond pas. Dernière lecture\u00a0: 24/11 10:30, ${Mots.HEURE}.", Mots.erreur("rundata.re ne répond pas", "24/11 11:20", "24/11 10:30"))
        assertEquals("rundata.re ne répond pas.", Mots.erreur("rundata.re ne répond pas", null, null))
    }

    @Test
    fun notificationsCoupeesLesMotsValides() {
        assertEquals("Notifications coupées\u00a0: ce téléphone ne vous préviendra pas des vigilances orange et rouge ni des alertes cycloniques.", Mots.NOTIFICATIONS_COUPEES)
    }
}
