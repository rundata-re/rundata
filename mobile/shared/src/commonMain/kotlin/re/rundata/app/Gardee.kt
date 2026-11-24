package re.rundata.app

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * La dernière journée lue d'une commune, gardée sur le téléphone (Reglages) pour être montrée hors ligne, avec son heure
 * de lecture : jamais une valeur inventée, jamais sans son heure.
 */
object Gardee {
    /** Le format de ce qui est gardé : une journée d'un autre format n'est pas montrée (elle sera relue). */
    const val FORMAT = 1

    @Serializable
    private data class Enveloppe(val format: Int, val journee: Journee)

    private val JSON = Json { ignoreUnknownKeys = true }

    fun enJson(j: Journee): String = JSON.encodeToString(Enveloppe.serializer(), Enveloppe(FORMAT, j))

    fun de(json: String?): Journee? =
        json?.let { runCatching { JSON.decodeFromString(Enveloppe.serializer(), it) }.getOrNull() }?.takeIf { it.format == FORMAT }?.journee
}
