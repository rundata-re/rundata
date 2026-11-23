package re.rundata.app.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.edit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import re.rundata.app.android.widget.MiseAJour
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * La version d'essai seulement (jamais publiée) : une alerte simulée, pour les captures du bandeau, des widgets et des
 * notifications quand aucune n'est en cours. Elle remplace les réponses de `vigilance_meteo` et de `cyclones` ; tout le
 * reste (journée, météo) est lu de rundata.re.
 *
 *     adb shell am broadcast -n re.rundata.app.essai/re.rundata.app.android.Simuler --es alerte orange
 *
 * `orange` : vigilance orange fortes pluies / orages (zone Sud) ; `cyclone` : alerte cyclonique orange ; `aucune` : les
 * vraies réponses.
 */
fun alertesSimulees(context: Context): () -> Pair<JsonObject?, JsonObject?>? = {
    when (prefs(context).getString("alerte", null)) {
        "orange" -> vigilance("""{"phenomene":"Fortes pluies / orages","maintenant":"orange","a_venir":["orange du ${jour(0)} au ${jour(12)}"]},{"phenomene":"Vents forts","maintenant":"jaune"}""") to SANS_CYCLONE
        "cyclone" -> vigilance(
            """{"phenomene":"Vents forts","maintenant":"orange"},{"phenomene":"Fortes pluies / orages","maintenant":"orange"}""",
            "ALERTE CYCLONIQUE orange, « je me prépare » : danger cyclonique dans les 24 heures.",
        ) to SANS_CYCLONE
        else -> null
    }
}

class Simuler : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        prefs(context).edit { putString("alerte", intent.getStringExtra("alerte")) }
        MiseAJour.maintenant(context)
    }
}

private fun prefs(context: Context) = context.getSharedPreferences("simulation", Context.MODE_PRIVATE)

private val SANS_CYCLONE = Json.parseToJsonElement("""{"alerte_cyclonique":"Pas d'alerte cyclonique en cours."}""").jsonObject

private fun jour(heures: Long): String =
    ZonedDateTime.now(ZoneId.of("Indian/Reunion")).plusHours(heures).format(DateTimeFormatter.ofPattern("dd/MM HH:00"))

private fun vigilance(niveaux: String, cyclone: String = "Pas d'alerte cyclonique en cours."): JsonObject {
    val emise = ZonedDateTime.now(ZoneId.of("Indian/Reunion")).minusMinutes(20).format(DateTimeFormatter.ofPattern("dd/MM HH:mm"))
    return Json.parseToJsonElement(
        """{"zone_vigilance":"Sud : Saint-Pierre, Le Tampon","emise":"$emise heure de La Réunion","alerte_cyclonique":"$cyclone",
        "niveaux":[$niveaux],"vagues_submersion":"pas de vigilance particulière sur le littoral",
        "officiel":"Consulter le site officiel de Météo-France : https://vigilance.meteofrance.fr/fr/la-reunion"}""",
    ).jsonObject
}
