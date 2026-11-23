package re.rundata.app

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Une alerte du bandeau : une vigilance de Météo-France au-dessus du vert pour la zone de la commune (fortes pluies /
 * orages, vents forts, vagues-submersion), l'alerte cyclonique, ou un système tropical actif d'après le CMRS. Toujours
 * les mots et la couleur de la source, avec son heure : jamais une prévision de modèle (la pluie prévue n'est pas une
 * alerte), jamais une couleur donnée à la commune elle-même.
 */
@Serializable
data class Alerte(
    /** « Vigilance orange vents forts », « Alerte cyclonique rouge », « Tempête tropicale modérée Bheki ». */
    val texte: String,
    /** « du 23/11 06:00 au 23/11 18:00 », « « je me confine » : danger imminent ». */
    val detail: String?,
    /** La couleur officielle ; AUCUNE quand la source n'en donne pas (pré-alerte, système actif). */
    val couleur: Couleur,
    /** « 16:21 » : l'heure du bulletin de Météo-France ; « 23/11 10:00 » : celle du dernier avis du CMRS. */
    val heure: String?,
    /** L'alerte cyclonique de la préfecture (pré-alerte, orange, rouge, violette, phase de sauvegarde). */
    val cyclonique: Boolean = false,
    /** Un système tropical actif, sans alerte cyclonique : une information, pas une consigne. */
    val systeme: Boolean = false,
) {
    /**
     * La notification la fait voir en haut de l'écran : la vigilance rouge et l'alerte cyclonique (de la pré-alerte à la
     * phase de sauvegarde ; le violet n'existe que là).
     */
    val urgente: Boolean get() = cyclonique || couleur == Couleur.ROUGE

    /** Ce qui la distingue d'une autre pour la notification : une même alerte n'est dite qu'une fois. */
    val cle: String get() = "$texte|${couleur.name}"

    /** La page de rundata.re qui la donne en entier. */
    val page: String get() = if (cyclonique || systeme) "$SITE/cyclones" else "$SITE/vigilance"
}

/**
 * Les alertes d'une commune, lues de `vigilance_meteo` (sa zone) et de `cyclones` (l'île) : la plus grave en premier.
 * Vide : rien au-dessus du vert, ni alerte cyclonique, ni système actif.
 */
data class Alertes(
    val liste: List<Alerte>,
    /** « Sud ». */
    val zone: String?,
    /** « 16:21 » : l'heure du bulletin de vigilance lu. */
    val emise: String?,
    /** « Consulter le site officiel de Météo-France : https://… ». */
    val officiel: String?,
    /**
     * La vigilance de la zone n'a pas pu être lue (pas de réponse, ou une réponse pour toute l'île) : rien n'est dit de
     * la zone, jamais « pas d'alerte ».
     */
    val vigilanceLue: Boolean = true,
    /** `cyclones` a été lu : sans lui, un système suivi par le CMRS n'est ni dit ni dit parti. */
    val cyclonesLus: Boolean = true,
) {
    val premiere: Alerte? get() = liste.firstOrNull()
}

private val GRAVITE = listOf(Couleur.VIOLET, Couleur.ROUGE, Couleur.ORANGE, Couleur.JAUNE, Couleur.AUCUNE)

/**
 * L'échelle de la vigilance de Météo-France à La Réunion : du jaune au rouge. Le violet appartient à l'alerte cyclonique
 * de la préfecture, jamais à une vigilance.
 */
private val Couleur.deVigilance: Boolean get() = this == Couleur.JAUNE || this == Couleur.ORANGE || this == Couleur.ROUGE

/**
 * Les alertes tirées des réponses de `vigilance_meteo` (avec la commune) et de `cyclones` ; l'une ou l'autre peut
 * manquer (non lue). L'alerte cyclonique vient de la vigilance, celle des cyclones à défaut.
 */
fun alertesDe(vigilance: JsonObject?, cyclones: JsonObject?): Alertes {
    val emise = vigilance?.texte("emise")?.let(::heureDe)
    val liste = buildList {
        val cyclonique = (vigilance?.texte("alerte_cyclonique") ?: cyclones?.texte("alerte_cyclonique"))?.let { alerteCycloniqueDe(it, emise) }
        cyclonique?.let(::add)
        vigilance?.let { v ->
            (v["niveaux"] as? JsonArray).orEmpty().forEach { n -> (n as? JsonObject)?.let { niveauDe(it, emise) }?.let(::add) }
            (v["vagues_submersion"] as? JsonArray).orEmpty().forEach { c -> (c as? JsonObject)?.let { coteDe(it, emise) }?.let(::add) }
        }
        // Un système suivi, sans alerte cyclonique : dit après les vigilances, sans couleur.
        if (cyclonique == null) {
            val actifs = (cyclones?.get("systemes_actifs") as? JsonArray).orEmpty() + (cyclones?.get("suivi_cmrs") as? JsonArray).orEmpty()
            actifs.mapNotNull { (it as? JsonObject)?.let(::systemeDe) }.forEach(::add)
        }
    }
    return Alertes(
        liste = liste.distinctBy { it.texte }.sortedWith(compareBy({ !it.cyclonique }, { it.systeme }, { GRAVITE.indexOf(it.couleur) })),
        zone = vigilance?.texte("zone_vigilance")?.substringBefore(' ')?.substringBefore(" :")?.trim(),
        emise = emise,
        officiel = vigilance?.texte("officiel"),
        // Sans « niveaux », le serveur a répondu pour toute l'île (lieu rattaché à aucune zone) : rien de la zone n'est lu.
        vigilanceLue = vigilance?.get("niveaux") is JsonArray,
        cyclonesLus = cyclones != null,
    )
}

/** « 22/11 16:21 heure de La Réunion » → « 16:21 ». */
internal fun heureDe(texte: String): String? = Regex("\\b(\\d{1,2}:\\d{2})\\b").find(texte)?.groupValues?.get(1)

/** « Fortes pluies / orages » → « fortes pluies / orages » ; « Vagues - submersion » → « vagues-submersion ». */
private fun phenomeneDit(nom: String): String = nom.replace(" - ", "-").lowercase()

/** Un phénomène de la zone : sa couleur maintenant, sinon la plus haute de ses périodes à venir (« orange du … au … »). */
private fun niveauDe(n: JsonObject, emise: String?): Alerte? {
    val phenomene = n.texte("phenomene") ?: return null
    val maintenant = Couleur.de(n.texte("maintenant"))
    val periodes = (n["a_venir"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
    val detail = periodes.takeIf { it.isNotEmpty() }?.joinToString(", ")
    if (maintenant.deVigilance) return Alerte("Vigilance ${maintenant.feminin} ${phenomeneDit(phenomene)}", detail, maintenant, emise)
    val aVenir = periodes.map { Couleur.de(it.substringBefore(' ')) }.filter { it.deVigilance }.minByOrNull { GRAVITE.indexOf(it) } ?: return null
    return Alerte("Vigilance ${aVenir.feminin} ${phenomeneDit(phenomene)} à venir", detail, aVenir, emise)
}

/** Une zone côtière en vagues-submersion : la plus haute couleur du bulletin, avec la zone et les périodes. */
private fun coteDe(c: JsonObject, emise: String?): Alerte? {
    val couleur = Couleur.de(c.texte("couleur_max")).takeIf { it.deVigilance } ?: return null
    val zone = c.texte("zone")?.let { it.replaceFirstChar(Char::lowercaseChar) }
    val periodes = (c["periodes"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
    return Alerte("Vigilance ${couleur.feminin} vagues-submersion", listOfNotNull(zone, periodes.joinToString(", ").takeIf { it.isNotEmpty() }).joinToString(", "), couleur, emise)
}

private val PALIERS = listOf(
    "pré-alerte" to ("Pré-alerte cyclonique" to Couleur.AUCUNE),
    "orange" to ("Alerte cyclonique orange" to Couleur.ORANGE),
    "rouge" to ("Alerte cyclonique rouge" to Couleur.ROUGE),
    "violette" to ("Alerte cyclonique violette" to Couleur.VIOLET),
    "phase de sauvegarde" to ("Phase de sauvegarde cyclonique" to Couleur.AUCUNE),
)

/**
 * « ALERTE CYCLONIQUE rouge, « je me confine » : danger imminent. » → « Alerte cyclonique rouge », en rouge, avec ce
 * qu'elle veut dire ; « Alerte cyclonique prévue : orange à partir du … » → « Alerte cyclonique orange prévue ». null :
 * « Pas d'alerte cyclonique en cours. ». Un autre texte est dit tel quel, sans couleur.
 */
fun alerteCycloniqueDe(texte: String, heure: String?): Alerte? {
    val t = texte.trim()
    if (t.isEmpty() || t.startsWith("Pas d'alerte", ignoreCase = true)) return null
    val enCours = Regex("^ALERTE CYCLONIQUE\\s+(.+?)\\.?$").find(t)?.groupValues?.get(1)
    if (enCours != null) {
        val (mot, palier) = PALIERS.firstOrNull { enCours.startsWith(it.first) } ?: return Alerte(t.trimEnd('.'), null, Couleur.AUCUNE, heure, cyclonique = true)
        val reste = enCours.removePrefix(mot).trimStart(',', ' ', ' ', ':').takeIf { it.isNotEmpty() }
        return Alerte(palier.first, reste, palier.second, heure, cyclonique = true)
    }
    val prevue = Regex("^Alerte cyclonique prévue[\\s\u00a0]*:[\\s\u00a0]*(.+?)\\.?$").find(t)?.groupValues?.get(1)
    if (prevue != null) {
        val palier = PALIERS.firstOrNull { prevue.startsWith(it.first) }?.second
        return Alerte((palier?.first ?: "Alerte cyclonique") + " prévue", prevue, palier?.second ?: Couleur.AUCUNE, heure, cyclonique = true)
    }
    return Alerte(t.trimEnd('.'), null, Couleur.AUCUNE, heure, cyclonique = true)
}

/** « Tempête tropicale modérée Bheki », d'après le dernier avis du CMRS, à son heure. */
private fun systemeDe(s: JsonObject): Alerte? {
    val nom = s.texte("systeme") ?: listOfNotNull(s.texte("stade"), s.texte("nom")).joinToString(" ").takeIf { it.isNotEmpty() } ?: return null
    val texte = nom.replaceFirstChar(Char::uppercaseChar)
    return Alerte(texte, null, Couleur.AUCUNE, s.texte("dernier_avis")?.substringBefore(" ("), systeme = true)
}

private fun JsonObject.texte(cle: String): String? = (this[cle] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

private fun JsonArray?.orEmpty(): List<kotlinx.serialization.json.JsonElement> = this ?: emptyList()
