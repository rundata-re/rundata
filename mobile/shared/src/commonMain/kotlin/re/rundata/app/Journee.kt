package re.rundata.app

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/** Les couleurs de vigilance de Météo-France, de la moins à la plus grave (src/providers/vigilance.ts COLOURS). */
enum class Couleur(val mot: String) {
    AUCUNE(""), VERT("vert"), JAUNE("jaune"), ORANGE("orange"), ROUGE("rouge"), VIOLET("violet");

    /** « verte », « jaune » : accordé à « vigilance ». */
    val feminin: String get() = when (this) { VERT -> "verte"; VIOLET -> "violette"; else -> mot }

    companion object {
        /** « vert » ou « verte », « violet » ou « violette » ; AUCUNE pour tout autre mot. */
        fun de(mot: String?): Couleur = mot?.trim()?.lowercase().let { m -> entries.firstOrNull { it != AUCUNE && (it.mot == m || it.feminin == m) } } ?: AUCUNE
    }
}

/** Une température MESURÉE, avec sa station, sa distance et son heure, telle que rundata.re la donne. */
data class Mesure(
    val temperature: String,
    val station: String,
    val distanceKm: Double?,
    /** « 21/11 19:30 », heure de La Réunion. */
    val heure: String,
    val amateur: Boolean = false,
) {
    /** « 19:30 ». */
    val heureSeule: String get() = heure.substringAfter(' ', heure)
}

/** La vigilance de Météo-France pour la zone de la commune : jamais une couleur donnée à la commune elle-même. */
data class Vigilance(
    /** « Vigilance météo : verte pour le Sud (Météo-France), la zone de Saint-Pierre. » */
    val texte: String,
    /**
     * Ce que ce texte dit de la zone, tel quel : « verte », « orange vents forts, jaune fortes pluies / orages », « pas de
     * vigilance émise ». La pastille le reprend mot pour mot.
     */
    val etat: String?,
    /** « Sud ». */
    val zone: String?,
    /**
     * La couleur de la pastille, lue dans `etat` : celle qu'il nomme ; la plus grave quand il en nomme plusieurs, une par
     * phénomène ; AUCUNE quand il n'en nomme pas (« pas de vigilance émise »). Jamais une couleur que le texte ne dit pas.
     */
    val couleur: Couleur,
    val auDessusDuVert: Boolean,
    /** Le texte de l'alerte cyclonique quand il y en a une. */
    val alerteCyclonique: String?,
    val emise: String?,
    val officiel: String?,
) {
    /** Dite en premier : une vigilance au-dessus du vert ou une alerte cyclonique. */
    val enPremier: Boolean get() = auDessusDuVert || alerteCyclonique != null
}

data class Volcan(val niveau: String?, val eruption: String?, val alerte: Boolean, val page: String)

data class Source(val nom: String, val licence: String?)

data class AvisEau(
    val titre: String,
    val nePasBoire: Boolean,
    val lien: String?,
    /** « jeudi 26/11 à 21:00 », « vendredi 27/11 à 04:00 », tels que le distributeur les donne. */
    val de: String? = null,
    val a: String? = null,
    /** « à venir », « en cours ». */
    val etat: String? = null,
    val secteurs: List<String> = emptyList(),
)

/** La journée d'une commune, comme rundata.re la donne : ce que l'écran principal et le widget montrent. */
data class Journee(
    val commune: Commune,
    val resume: String?,
    val mesure: Mesure?,
    val vigilance: Vigilance?,
    val volcan: Volcan?,
    val coupures: List<AvisEau>,
    /** « rundata.re, d'après Météo-France et d'autres sources (liste dans sources) » : la façon de citer. */
    val citer: String?,
    /** Chaque source et sa licence, telles que rundata.re les donne. */
    val sources: List<Source>,
    /** « 21/11 19:35 » : quand rundata.re a lu ces données, heure de La Réunion. */
    val lueA: String?,
)

/**
 * Lit la journée de `commune` : `resume_du_jour`, et `meteo_actuelle` si le résumé n'a pas la mesure. La vigilance, texte
 * et couleur, vient du seul champ `vigilance.maintenant` du résumé, pour qu'ils disent la même chose.
 */
class JourneeSource(private val mcp: RundataMcp) {
    suspend fun journee(commune: Commune): Journee = coroutineScope {
        val resume = mcp.appeler("resume_du_jour", mapOf("lieu" to commune.nom))
        val meteo = if (mesureDuResume(resume) == null) runCatching { mcp.appeler("meteo_actuelle", mapOf("lieu" to commune.nom)) }.getOrNull() else null
        journeeDe(commune, resume, meteo)
    }
}

/** La journée tirée des réponses des outils ; `meteo` peut manquer. */
fun journeeDe(commune: Commune, resume: JsonObject, meteo: JsonObject?): Journee {
    val mesure = mesureDuResume(resume) ?: meteo?.let(::mesureDeMeteo)
    val sources = buildList<Source> {
        for (r in listOfNotNull(resume, meteo.takeIf { mesure != null && mesureDuResume(resume) == null })) {
            (r["sources"] as? JsonArray)?.forEach { s ->
                val o = s as? JsonObject ?: return@forEach
                val nom = o.texte("source") ?: return@forEach
                if (none { it.nom == nom }) add(Source(nom, o.texte("licence")))
            }
        }
    }
    return Journee(
        commune = commune,
        resume = resume.texte("resume"),
        mesure = mesure,
        vigilance = (resume["vigilance"] as? JsonObject)?.let { vigilanceDe(it) },
        volcan = (resume["volcan"] as? JsonObject)?.let { v ->
            Volcan(v.texte("niveau_orsec"), v.texte("eruption_en_cours"), (v["alerte"] as? JsonPrimitive)?.booleanOrNull == true, v.texte("page") ?: "$SITE/volcan")
        },
        coupures = ((resume["coupures_eau"] as? JsonObject)?.get("avis") as? JsonArray).orEmpty().mapNotNull { a ->
            val o = a as? JsonObject ?: return@mapNotNull null
            val titre = o.texte("titre") ?: return@mapNotNull null
            val coupure = o["coupure"] as? JsonObject
            AvisEau(
                titre, (o["ne_pas_boire"] as? JsonPrimitive)?.booleanOrNull == true, o.texte("lien"),
                coupure?.texte("de"), coupure?.texte("a"), coupure?.texte("etat"),
                (o["secteurs"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.contentOrNull },
            )
        },
        citer = resume.texte("citer"),
        sources = sources,
        lueA = (resume["fraicheur"] as? JsonObject)?.texte("lue_a") ?: meteo?.let { (it["fraicheur"] as? JsonObject)?.texte("lue_a") },
    )
}

internal fun mesureDuResume(resume: JsonObject): Mesure? {
    val m = (resume["meteo"] as? JsonObject)?.get("mesure") as? JsonObject ?: return null
    return mesureDe(m)
}

/** La première station de `meteo_actuelle` qui a une température : la plus proche qui vaille pour le lieu. */
internal fun mesureDeMeteo(meteo: JsonObject): Mesure? =
    (meteo["stations"] as? JsonArray).orEmpty().firstNotNullOfOrNull { (it as? JsonObject)?.let(::mesureDe) }

private fun mesureDe(m: JsonObject): Mesure? {
    val t = (m["mesures"] as? JsonObject)?.texte("temperature") ?: return null
    val station = m.texte("station") ?: return null
    val heure = m.texte("heure_mesure") ?: return null
    return Mesure(t, station, (m["distance_km"] as? JsonPrimitive)?.doubleOrNull, heure, (m["amateur"] as? JsonPrimitive)?.booleanOrNull == true)
}

/**
 * « verte », « orange vents forts, jaune fortes pluies / orages » : ce que « Vigilance météo : … pour le Sud (Météo-France)… »
 * dit de la zone ; null quand le texte n'a pas cette forme.
 */
internal fun etatDe(texte: String): String? {
    val apres = texte.substringAfter("Vigilance météo", "").trimStart(' ', '\u00a0', ':')
    return apres.substringBefore(" pour l", "").trim().takeIf { it.isNotEmpty() }
}

/** La couleur de la pastille pour `etat` (voir Vigilance.couleur). */
internal fun couleurDe(etat: String?): Couleur =
    etat?.split(',')?.map { Couleur.de(it.trim().substringBefore(' ')) }?.filter { it != Couleur.AUCUNE }?.maxByOrNull { it.ordinal } ?: Couleur.AUCUNE

private fun vigilanceDe(v: JsonObject): Vigilance {
    val texte = v.texte("maintenant") ?: ""
    val etat = etatDe(texte)
    return Vigilance(
        texte = texte,
        etat = etat,
        zone = v.texte("zone"),
        couleur = couleurDe(etat),
        auDessusDuVert = (v["au_dessus_du_vert"] as? JsonPrimitive)?.booleanOrNull == true,
        alerteCyclonique = v.texte("alerte_cyclonique"),
        emise = v.texte("emise"),
        officiel = v.texte("officiel"),
    )
}

private fun JsonObject.texte(cle: String): String? = (this[cle] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

private fun JsonArray?.orEmpty(): List<JsonElement> = this ?: emptyList()
