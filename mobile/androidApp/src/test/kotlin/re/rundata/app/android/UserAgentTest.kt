package re.rundata.app.android

import re.rundata.app.BuildConfig
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Le widget s'annonce comme widget : le site compte à part ce qu'il lit en arrière-plan (« rundata.re-android/0.3.3
 * widget »), comme il l'attend (src/appli.ts, appliDe).
 */
class UserAgentTest {
    @Test
    fun lAppliEtLeWidgetSAnnoncentChacun() {
        assertEquals("rundata.re-android/${BuildConfig.VERSION_NAME}", RundataApp.userAgent(widget = false))
        assertEquals("rundata.re-android/${BuildConfig.VERSION_NAME} widget", RundataApp.userAgent(widget = true))
    }
}
