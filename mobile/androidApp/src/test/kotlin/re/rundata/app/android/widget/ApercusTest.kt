package re.rundata.app.android.widget

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Les aperçus de la liste des widgets d'Android sont un exemple : aucun n'écrit une heure ou une date qui ressemblerait
 * à une mesure du jour (avant 0.3.4 : « à 20:48 », « bulletin de 16:21 », « Lu le 21/11 à 21:39 »).
 */
class ApercusTest {
    @Test
    fun aucunApercuNEcritUneHeureNiUneDate() {
        val xml = File("src/main/res/values/strings.xml").readText()
        val apercus = Regex("""<string name="(apercu_[^"]+)">([^<]*)</string>""").findAll(xml).map { it.groupValues[1] to it.groupValues[2] }.toList()
        val dates = apercus.filter { (_, texte) -> Regex("""\d{1,2}:\d{2}|\d{1,2}/\d{1,2}""").containsMatchIn(texte) }
        assertEquals(emptyList(), dates)
        assertEquals(true, apercus.size > 10)
    }

    @Test
    fun lesMotsValidesDesApercus() {
        val xml = File("src/main/res/values/strings.xml").readText()
        fun texte(nom: String) = Regex("""<string name="$nom">([^<]*)</string>""").find(xml)?.groupValues?.get(1)
        assertEquals("Exemple", texte("apercu_lue"))
        assertEquals("Mesure avec son heure", texte("apercu_mesure"))
        assertEquals("Mesure avec son heure", texte("apercu_heure"))
        assertEquals("25,5\u00a0°C air", texte("apercu_bandeau_air"))
        assertEquals("27,1\u00a0°C mer", texte("apercu_bandeau_mer"))
        assertEquals("Zone de la commune · d\\'après Météo-France · heure du bulletin", texte("apercu_alerte_detail"))
    }

    /**
     * Les aperçus de la liste des widgets sont des images fixes, de taille fixe : leurs textes sont en dp, pas en sp, et ne grossissent pas avec le texte d'Android.
     * À 200 %, « °C » passait sous « 25,5 » et « Saint-Denis » se coupait en « Sai / nt-D » dans la liste des widgets (item 2132). Le widget posé, lui, suit la taille du texte.
     */
    @Test
    fun lesTextesDesApercusNeSuiventPasLaTailleDuTexte() {
        val sp = File("src/main/res/layout").listFiles()!!.filter { it.name.startsWith("widget_apercu") }.sortedBy { it.name }.flatMap { f ->
            Regex("""android:textSize="(\d+)sp"""").findAll(f.readText()).map { "${f.name} ${it.groupValues[1]}sp" }
        }
        assertEquals(emptyList(), sp)
    }
}
