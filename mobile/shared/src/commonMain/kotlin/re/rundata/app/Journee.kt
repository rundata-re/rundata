package re.rundata.app

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
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

    /** Jaune, orange, rouge ou violet : une alerte du bandeau. */
    val auDessusDuVert: Boolean get() = ordinal > VERT.ordinal

    companion object {
        /** « vert » ou « verte », « violet » ou « violette » ; AUCUNE pour tout autre mot. */
        fun de(mot: String?): Couleur = mot?.trim()?.lowercase().let { m -> entries.firstOrNull { it != AUCUNE && (it.mot == m || it.feminin == m) } } ?: AUCUNE
    }
}

/** Une température MESURÉE, avec sa station, sa distance et son heure, telle que rundata.re la donne. */
@Serializable
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
@Serializable
data class Vigilance(
    /** « Vigilance météo : verte pour le Sud (Météo-France), la zone de Saint-Pierre. » */
    val texte: String,
    /**
     * Ce que ce texte dit de la zone, tel quel : « verte », « orange vents forts, jaune fortes pluies / orages », « pas de
     * vigilance émise ».
     */
    val etat: String?,
    /** « Sud ». */
    val zone: String?,
    /**
     * Une pastille par couleur que `etat` nomme, chacune avec ses mots et sa couleur : « Vigilance orange vents forts » en
     * orange, « Vigilance jaune fortes pluies / orages » en jaune. Aucune quand il n'en nomme pas (« pas de vigilance
     * émise »). Jamais une couleur que le texte ne dit pas, ni une couleur pour un autre phénomène que le sien.
     */
    val pastilles: List<Pastille>,
    val auDessusDuVert: Boolean,
    /** Le texte de l'alerte cyclonique quand il y en a une. */
    val alerteCyclonique: String?,
    val emise: String?,
    val officiel: String?,
) {
    /** Dite en premier : une vigilance au-dessus du vert ou une alerte cyclonique. */
    val enPremier: Boolean get() = auDessusDuVert || alerteCyclonique != null
}

@Serializable
data class Volcan(val niveau: String?, val eruption: String?, val alerte: Boolean, val page: String)

@Serializable
data class Source(val nom: String, val licence: String?)

/** La température de la mer au large de la commune, mesurée par satellite (le jour de la mesure). */
@Serializable
data class Mer(val temperature: String, val auLargeDe: String?, /** « 21/11 » : le jour du passage du satellite. */ val jour: String? = null)

/**
 * Ce qui reste du jour d'après la PRÉVISION de modèle du résumé, jamais une mesure : « 24,1 °C », « 25,2 °C », « pas de
 * pluie prévue de 20 h à minuit ». Jamais dite comme une alerte.
 */
@Serializable
data class Prevision(val min: String?, val max: String?, val pluie: String?)

/** Une sortie du jour : un événement d'un agenda (avec son statut, « ANNULÉ »…) ou un marché, et son lien. */
@Serializable
data class Sortie(val titre: String, val quand: String?, val lieu: String?, val statut: String?, val lien: String?, val marche: Boolean = false)

/** Une information des médias sur les routes, ou un avis du réseau de bus, telle quelle, avec son heure et son média. */
@Serializable
data class InfoRoute(val titre: String, val quand: String?, val media: String?, val lien: String?)

/** Ce que le résumé dit des routes : ses informations, ou rien de lu (null : les médias n'ont pas été lus). */
@Serializable
data class Routes(val infos: List<InfoRoute>?, val bus: List<InfoRoute>, val littoral: String?)

@Serializable
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
@Serializable
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
    val mer: Mer? = null,
    val prevision: Prevision? = null,
    /** Les événements du jour puis les marchés ; null quand les agendas n'ont pas été lus. */
    val sorties: List<Sortie>? = null,
    val routes: Routes? = null,
    /** « runéo » : le distributeur d'eau de la commune. */
    val distributeur: String? = null,
    /** Les alertes du bandeau (vigilance_meteo, cyclones) ; null quand elles n'ont pas été lues. */
    val alertes: Alertes? = null,
)

/**
 * Lit la journée de `commune` : `resume_du_jour`, et `meteo_actuelle` si le résumé n'a pas la mesure. La vigilance, texte
 * et couleur, vient du seul champ `vigilance.maintenant` du résumé, pour qu'ils disent la même chose.
 */
class JourneeSource(
    private val mcp: RundataMcp,
    /** Les réponses de `vigilance_meteo` et de `cyclones` à montrer au lieu des vraies : la version d'essai seulement. */
    private val simulees: () -> Pair<JsonObject?, JsonObject?>? = { null },
    /** La copie des réponses, partagée par l'écran et les widgets (Copie). */
    private val copie: Copie = Copie(),
) {
    /** Un outil, lu du site ou de la copie de moins de 5 min. */
    private suspend fun appeler(outil: String, lieu: String? = null): JsonObject =
        copie.lire("$outil|${lieu.orEmpty()}") { mcp.appeler(outil, lieu?.let { mapOf("lieu" to it) } ?: emptyMap()) }

    suspend fun journee(commune: Commune): Journee = coroutineScope {
        val resume = appeler("resume_du_jour", commune.nom)
        val meteo = if (mesureDuResume(resume) == null) runCatching { appeler("meteo_actuelle", commune.nom) }.getOrNull() else null
        journeeDe(commune, resume, meteo)
    }

    /**
     * La journée et ses alertes, lues ensemble : `vigilance_meteo` pour la zone de la commune, `cyclones` pour l'île. Les
     * alertes qui n'ont pas pu être lues restent null : le bandeau n'en dit rien, jamais « pas d'alerte ».
     */
    suspend fun journeeEtAlertes(commune: Commune): Journee = coroutineScope {
        val essai = simulees()
        val vigilance = async { essai?.first ?: runCatching { appeler("vigilance_meteo", commune.nom) }.getOrNull() }
        val cyclones = async { essai?.second ?: runCatching { appeler("cyclones") }.getOrNull() }
        val j = journee(commune)
        val v = vigilance.await()
        val c = cyclones.await()
        j.copy(alertes = if (v == null && c == null) null else alertesDe(v, c))
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
        mer = (resume["mer"] as? JsonObject)?.let { m ->
            m.texte("temperature_eau")?.let {
                // « 2026-11-21 » → « 21/11 » : la mer se dit avec le jour de sa mesure, comme l'air avec son heure.
                val jour = m.texte("jour_mesure")?.let { d -> Regex("^\\d{4}-(\\d{2})-(\\d{2})").find(d)?.groupValues?.let { g -> "${g[2]}/${g[1]}" } }
                Mer(it, (m["au_large_de"] as? JsonArray)?.firstOrNull()?.let { (it as? JsonPrimitive)?.contentOrNull }, jour)
            }
        },
        prevision = ((resume["meteo"] as? JsonObject)?.get("prevision") as? JsonObject)?.get("aujourd_hui")?.let { it as? JsonObject }?.let {
            Prevision(it.texte("temperature_min"), it.texte("temperature_max"), it.texte("pluie"))
        },
        sorties = sortiesDe(resume),
        routes = (resume["circulation"] as? JsonObject)?.let { c ->
            Routes(
                infos = (c["infos_routes"] as? JsonArray)?.mapNotNull { (it as? JsonObject)?.let(::infoDe) },
                bus = (c["bus"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::infoDe) },
                littoral = c.texte("route_du_littoral"),
            )
        },
        distributeur = (resume["coupures_eau"] as? JsonObject)?.texte("distributeur"),
    )
}

/** Les événements du jour, tels quels, puis les marchés du jour : null quand ni l'un ni l'autre n'a été lu. */
private fun sortiesDe(resume: JsonObject): List<Sortie>? {
    val agenda = resume["evenements_du_jour"] as? JsonObject
    val marches = resume["marches_du_jour"] as? JsonObject
    if (agenda == null && marches == null) return null
    val evenements = (agenda?.get("liste") as? JsonArray).orEmpty().mapNotNull { e ->
        val o = e as? JsonObject ?: return@mapNotNull null
        Sortie(o.texte("titre") ?: return@mapNotNull null, o.texte("quand"), o.texte("lieu"), o.texte("statut"), o.texte("lien"))
    }
    val duJour = (marches?.get("liste") as? JsonArray).orEmpty() + (marches?.get("permanents") as? JsonArray).orEmpty()
    return evenements + duJour.mapNotNull { m ->
        val o = m as? JsonObject ?: return@mapNotNull null
        Sortie(o.texte("nom") ?: return@mapNotNull null, o.texte("horaires_aujourd_hui"), null, null, o.texte("lien"), marche = true)
    }
}

private fun infoDe(o: JsonObject): InfoRoute? {
    val titre = o.texte("titre") ?: return null
    val reseau = o.texte("reseau")?.let { r -> r + ((o["lignes"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }?.takeIf { it.isNotEmpty() }?.let { " " + it.joinToString(", ") } ?: "") }
    return InfoRoute(titre, o.texte("quand"), o.texte("media") ?: reseau, o.texte("lien"))
}

/**
 * L'avis d'eau à dire en premier, quand la place manque (le widget) : l'eau à ne pas boire, puis une coupure en cours,
 * puis la prochaine à venir (jamais une terminée), d'après sa date de début (« lundi 23/11 à 21:00 »). `mois` : le mois d'aujourd'hui, pour
 * placer après décembre une date de janvier.
 */
fun avisEnPremier(avis: List<AvisEau>, mois: Int): AvisEau? {
    avis.firstOrNull { it.nePasBoire }?.let { return it }
    avis.firstOrNull { it.etat == "en cours" }?.let { return it }
    val date = Regex("(\\d{1,2})/(\\d{1,2})\\D+(\\d{1,2}):(\\d{2})")
    // Le serveur garde aussi les avis récents : une coupure terminée commence avant la prochaine, elle n'en est jamais une.
    return avis.filter { it.etat != "terminée" }.mapNotNull { a ->
        val g = a.de?.let { date.find(it) }?.groupValues ?: return@mapNotNull null
        val m = g[2].toInt()
        val annee = if (m < mois - 6) 1 else 0
        a to (((annee * 13 + m) * 32 + g[1].toInt()) * 24 + g[3].toInt()) * 60 + g[4].toInt()
    }.minByOrNull { it.second }?.first
}

/**
 * Les avis d'eau dans l'ordre où l'écran les dit : l'eau à ne pas boire, les coupures en cours, puis celles à venir de
 * la plus proche à la plus lointaine (d'après leur début), les avis sans date, et les coupures terminées en dernier.
 * Les distributeurs les publient du plus récent au plus ancien : l'écran du 24/11/2026 disait le 26/11 avant la coupure
 * du soir même. `mois` : le mois d'aujourd'hui, pour placer après décembre une date de janvier.
 */
fun avisDansLOrdre(avis: List<AvisEau>, mois: Int): List<AvisEau> {
    val date = Regex("(\\d{1,2})/(\\d{1,2})\\D+(\\d{1,2}):(\\d{2})")
    fun debut(a: AvisEau): Int? {
        val g = a.de?.let { date.find(it) }?.groupValues ?: return null
        val m = g[2].toInt()
        val annee = if (m < mois - 6) 1 else 0
        return (((annee * 13 + m) * 32 + g[1].toInt()) * 24 + g[3].toInt()) * 60 + g[4].toInt()
    }
    fun rang(a: AvisEau) = when {
        a.nePasBoire -> 0
        a.etat == "en cours" -> 1
        a.etat == "terminée" -> 4
        debut(a) != null -> 2
        else -> 3
    }
    return avis.sortedWith(compareBy<AvisEau>({ rang(it) }, { debut(it) ?: 0 }))
}

/** Le mois de « 24/11 06:51 » (l'heure de lecture), ou 0 quand elle manque. */
fun moisDe(lueA: String?): Int = lueA?.let { Regex("^\\d{1,2}/(\\d{1,2})").find(it)?.groupValues?.get(1)?.toIntOrNull() } ?: 0

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

/** « Vigilance orange vents forts », en orange : une pastille de vigilance. */
@Serializable
data class Pastille(val texte: String, val couleur: Couleur)

/** Les pastilles de `etat` (voir Vigilance.pastilles), dans l'ordre du texte. */
fun pastillesDe(etat: String?): List<Pastille> =
    etat?.split(',').orEmpty().map { it.trim() }.mapNotNull { mots ->
        Couleur.de(mots.substringBefore(' ')).takeIf { it != Couleur.AUCUNE }?.let { Pastille("Vigilance $mots", it) }
    }

private fun vigilanceDe(v: JsonObject): Vigilance {
    val texte = v.texte("maintenant") ?: ""
    val etat = etatDe(texte)
    return Vigilance(
        texte = texte,
        etat = etat,
        zone = v.texte("zone"),
        pastilles = pastillesDe(etat),
        auDessusDuVert = (v["au_dessus_du_vert"] as? JsonPrimitive)?.booleanOrNull == true,
        alerteCyclonique = v.texte("alerte_cyclonique"),
        emise = v.texte("emise"),
        officiel = v.texte("officiel"),
    )
}

private fun JsonObject.texte(cle: String): String? = (this[cle] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

private fun JsonArray?.orEmpty(): List<JsonElement> = this ?: emptyList()
