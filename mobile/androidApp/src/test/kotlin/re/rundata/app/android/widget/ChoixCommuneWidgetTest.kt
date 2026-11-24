package re.rundata.app.android.widget

import re.rundata.app.R
import kotlin.test.Test
import kotlin.test.assertEquals

/** L'écran qui choisit la commune d'un widget dit ce que montrera ce widget-là, pas toujours « la journée ». */
class ChoixCommuneWidgetTest {
    @Test
    fun chaqueWidgetDitCeQuilMontrera() {
        assertEquals(R.string.widget_alerte_nom to R.string.widget_alerte_description, sujetDuWidget(RecepteurAlerte::class.java.name))
        assertEquals(R.string.widget_bandeau_nom to R.string.widget_bandeau_description, sujetDuWidget(RecepteurBandeau::class.java.name))
        assertEquals(R.string.widget_temperature_nom to R.string.widget_temperature_description, sujetDuWidget(RecepteurTemperature::class.java.name))
        assertEquals(R.string.widget_aujourdhui_nom to R.string.widget_aujourdhui_description, sujetDuWidget(RecepteurAujourdhui::class.java.name))
        assertEquals(R.string.widget_nom to R.string.widget_description, sujetDuWidget(RecepteurWidget::class.java.name))
        // Un widget inconnu (une version plus récente) : la phrase générale.
        assertEquals(null, sujetDuWidget("re.rundata.app.android.widget.Autre"))
    }

    @Test
    fun leTitreNommeLeWidgetAvecUneSeulePaireDeGuillemets() {
        kotlin.test.assertEquals("Widget «\u00a0Alerte\u00a0»\u00a0: choisissez la commune", titreDuChoix("Alerte"))
        kotlin.test.assertEquals("Widget\u00a0: choisissez la commune", titreDuChoix(null))
    }
}
