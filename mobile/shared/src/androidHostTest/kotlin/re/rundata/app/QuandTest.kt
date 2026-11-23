package re.rundata.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Une heure d'un autre jour ne se montre jamais sans son jour. */
class QuandTest {
    @Test
    fun leJourEstGardeAvecLHeure() {
        assertEquals("21/11 15:42", Quand.de("21/11 15:42 heure de La Réunion"))
        assertEquals("16:21", Quand.de("16:21"))
        assertNull(Quand.de(null))
        assertEquals("21/11", Quand.jour("21/11 19:30"))
        assertNull(Quand.jour("19:30"))
    }

    @Test
    fun leJourEstDitQuandCeNEstPasCeluiDeLaLecture() {
        assertEquals("à 19:30", Quand.a("21/11 19:30", "21/11 19:35"))
        assertEquals("le 20/11 à 23:50", Quand.a("20/11 23:50", "21/11 00:05"))
        assertEquals("le 21/11 à 19:30", Quand.a("21/11 19:30"))
        assertEquals("de 19:30", Quand.du("21/11 19:30", "21/11 20:05"))
        assertEquals("du 20/11 à 19:30", Quand.du("20/11 19:30", "21/11 20:05"))
        // La lecture elle-même porte toujours son jour : c'est elle qui date tout le reste.
        assertEquals("Lu le 21/11 à 19:35", Quand.lu("21/11 19:35"))
    }
}
