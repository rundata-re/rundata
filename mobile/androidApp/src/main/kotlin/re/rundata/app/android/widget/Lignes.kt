package re.rundata.app.android.widget

import re.rundata.app.Alerte
import re.rundata.app.Pastille
import re.rundata.app.Quand
import re.rundata.app.pastillesDe

/** Les lignes du widget « La journée », de haut en bas. */
data class Lignes(
    val titre: String,
    val grande: String?,
    val detail: String?,
    /** Une pastille par phénomène que la phrase de la zone nomme, chacune dans sa couleur ; aucune sans vigilance émise. */
    val vigilance: List<Pastille>,
    /** « zone Nord » sous les pastilles ; « Pas de vigilance émise · zone Nord » quand rien n'est émis. */
    val zone: String?,
    val alerte: String?,
    val eau: String? = null,
    /** « Lu le 21/11 à 20:11 » : en haut, le jour et l'heure (de La Réunion) de la dernière lecture réussie. */
    val lue: String? = null,
    /** La mention du kit, mot pour mot, sous la vigilance : OFFICIEL. */
    val officiel: String? = null,
    /** « Prévision : … » : une PRÉVISION, jamais dite comme une alerte. */
    val prevision: String? = null,
)

/** La mention de Météo-France, une phrase entière avec ces mots exacts (le kit) : jamais une forme courte. */
const val OFFICIEL = "Consulter le site officiel de Météo-France"
/** Là où elle mène quand le résumé ne donne pas le lien (src/providers/vigilance.ts OFFICIEL_VIGILANCE). */
const val OFFICIEL_VIGILANCE = "https://vigilance.meteofrance.fr/fr/la-reunion"

const val CHOISIR = "Toucher pour choisir une commune."
const val LECTURE = "Lecture des données…"

/** Les mots du widget, d'après `d` ; `commune` : celle du widget, null quand aucune n'est choisie. */
fun lignes(d: Donnees?, commune: String?): Lignes {
    if (d == null || commune == null || d.commune != commune) {
        return Lignes(commune ?: "rundata.re", null, if (commune == null) CHOISIR else LECTURE, emptyList(), null, null)
    }
    // Les mots de la zone tels que le résumé les écrit, chacun dans la couleur qu'il nomme.
    val vigilance = pastillesDe(d.etat)
    val detail = when {
        d.temperature == null -> "Pas de mesure récente."
        else -> "mesurée" + (d.heure?.let { " " + Quand.a(it, d.lueA) } ?: "") + (d.station?.let { ", $it" } ?: "")
    }
    val zone = when {
        d.etat == null -> null
        vigilance.isNotEmpty() -> d.zone?.let { "zone $it" }
        else -> d.etat.replaceFirstChar(Char::uppercaseChar) + (d.zone?.let { " · zone $it" } ?: "")
    }
    return Lignes(d.commune, d.temperature, detail, vigilance, zone, horsLigne(d), d.eau, d.lueA?.let(Quand::lu), OFFICIEL.takeIf { d.etat != null }, d.prevision)
}

/** « rundata.re injoignable le 22/11 à 20:05 : mesure de 19:30. » ; null quand la dernière lecture a réussi. */
fun horsLigne(d: Donnees): String? = d.echecA?.let {
    when {
        d.temperature != null && d.heure != null -> "rundata.re injoignable ${Quand.a(it)} : mesure ${Quand.du(d.heure, it)}."
        d.lueA != null -> "rundata.re injoignable ${Quand.a(it)} : lu ${Quand.a(d.lueA, it)}."
        else -> "rundata.re injoignable ${Quand.a(it)}."
    }
}

/** La vigilance en un mot ou deux, pour le bandeau : « Vigilance verte », « Pas de vigilance émise ». */
fun vigilanceCourte(d: Donnees): Pair<String, Pastille?>? {
    val p = pastillesDe(d.etat)
    return when {
        d.etat == null -> null
        p.isEmpty() -> d.etat.replaceFirstChar(Char::uppercaseChar) to null
        else -> p.first().texte to p.first()
    }
}

/** Les sections du grand widget « Aujourd'hui » : un titre, des lignes, et ce qui se dit quand il n'y a rien. */
data class Section(val titre: String, val lignes: List<Ligne>, val vide: String?, val enPlus: Int = 0)

/** « Sortir », « Routes », « Eau », avec `n` lignes au plus chacune. */
fun sections(d: Donnees, n: Int): List<Section> {
    val sorties = d.sorties?.let { s ->
        Section("Sortir", s.take(n), "Aucun événement trouvé aujourd'hui dans les agendas lus par rundata.re.", (s.size - n).coerceAtLeast(0))
    } ?: Section("Sortir", emptyList(), "Agendas non lus pour l'instant.")
    val toutes = d.routes.orEmpty() + d.bus
    val routes = Section(
        "Routes et bus", toutes.take(n),
        if (d.routes == null) "Informations des médias non lues pour l'instant." else "Aucune information des médias sur les routes ces dernières heures.",
        (toutes.size - n).coerceAtLeast(0),
    )
    val eau = Section(
        "Eau", listOfNotNull(d.eau?.let { Ligne(it) }),
        "Pas d'avis de coupure récent ou à venir" + (d.distributeur?.let { ", d'après $it." } ?: "."),
        d.eauAutres,
    )
    return listOf(sorties, routes, eau)
}

/** « et 2 autres » sous une section coupée. */
fun enPlus(n: Int): String? = if (n <= 0) null else "et $n autre${if (n > 1) "s" else ""} sur rundata.re"

/** Le bandeau d'alerte : ce qu'elle dit, puis son heure (« bulletin du 22/11 à 16:21 », « avis du CMRS du 23/11 10:00 »). */
data class LigneAlerte(val texte: String, val heure: String?, val detail: String?, val alerte: Alerte?)

/** La vigilance pas lue : jamais « pas d'alerte ». La forme longue là où il y a la place. */
const val ALERTES_NON_LUES = "Vigilance pas encore lue"
const val ALERTES_NON_LUES_LONG = "Vigilance pas encore lue, réessai bientôt"
const val PAS_D_ALERTE = "Pas d'alerte en cours"

/** « bulletin du 22/11 à 16:21 », « avis du CMRS du 23/11 10:00 » : toujours avec le jour. */
fun heureAlerte(a: Alerte): String? = a.heure?.let { if (a.systeme) "avis du CMRS du $it" else "bulletin ${Quand.du(it)}" }

/**
 * Le widget « Alerte » : la plus grave, sa couleur et son heure ; « Pas d'alerte en cours », avec la zone et l'heure
 * du bulletin, seulement quand la vigilance a été lue ; « Vigilance pas encore lue » sinon, jamais un « rien » inventé.
 */
fun ligneAlerte(d: Donnees): LigneAlerte {
    val a = d.alertes?.firstOrNull()
    return when {
        a != null -> LigneAlerte(a.texte, heureAlerte(a), a.detail, a)
        d.alertes == null || !d.vigilanceLue -> LigneAlerte(ALERTES_NON_LUES, null, null, null)
        else -> LigneAlerte(PAS_D_ALERTE, d.alertesEmise?.let { "bulletin ${Quand.du(it)}" }, listOfNotNull(d.zone?.let { "zone $it" }, "d'après Météo-France").joinToString(" · "), null)
    }
}

/** « et 1 autre alerte » sous la plus grave. */
fun enPlusAlertes(n: Int): String? = if (n <= 0) null else "et $n autre${if (n > 1) "s" else ""} alerte${if (n > 1) "s" else ""}"
