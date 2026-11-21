package re.rundata.app.android.widget

import android.content.Context
import androidx.core.content.edit
import re.rundata.app.AvisEau
import re.rundata.app.Journee
import re.rundata.app.Mots
import re.rundata.app.Pastille
import re.rundata.app.avisEnPremier
import re.rundata.app.pastillesDe

/**
 * Ce que le widget montre, gardé d'une mise à jour à l'autre : la dernière mesure lue reste, avec son heure, quand la
 * lecture suivante échoue. Jamais une valeur inventée.
 */
data class Donnees(
    val commune: String,
    val temperature: String?,
    /** « 19:30 », heure de La Réunion. */
    val heure: String?,
    val station: String?,
    val zone: String?,
    val vigilanceEnPremier: Boolean,
    /** « 20:05 » : la dernière lecture qui a échoué, après celle-ci ; null quand la dernière a réussi. */
    val echecA: String?,
    /** L'avis d'eau à dire (avisEnPremier), déjà écrit : « Coupure d'eau du lundi 23/11 à 21:00 (à venir) ». */
    val eau: String? = null,
    /** « 20:11 » : quand rundata.re a lu ces données, heure de La Réunion. */
    val lueA: String? = null,
    /** « verte », « orange vents forts, jaune fortes pluies / orages » : Vigilance.etat, tel quel. */
    val etat: String? = null,
    /** L'avis d'eau sur le site du distributeur, ouvert quand on touche la ligne d'eau. */
    val eauLien: String? = null,
    /** Le lien du champ officiel de la vigilance (vigilance.meteofrance.fr), ouvert quand on touche la vigilance. */
    val officielLien: String? = null,
) {
    companion object {
        /**
         * Le format de ce qui est gardé : une donnée d'un format plus ancien (sans vigilance lue dans le résumé, sans lien
         * d'eau) n'est pas montrée, elle est relue.
         */
        const val FORMAT = 3

        fun de(j: Journee) = Donnees(
            commune = j.commune.nom,
            temperature = j.mesure?.temperature,
            heure = j.mesure?.heureSeule,
            station = j.mesure?.station,
            etat = j.vigilance?.etat,
            zone = j.vigilance?.zone,
            vigilanceEnPremier = j.vigilance?.enPremier == true,
            echecA = null,
            eau = avisEnPremier(j.coupures, mois())?.let(::ligneEau),
            eauLien = avisEnPremier(j.coupures, mois())?.lien,
            officielLien = j.vigilance?.officiel?.substringAfter(" : ", "")?.trim()?.takeIf { it.startsWith("https://") },
            lueA = j.lueA?.let { it.substringAfter(" ", it) },
        )

        private fun mois(): Int = java.time.ZonedDateTime.now(java.time.ZoneId.of("Indian/Reunion")).monthValue

        private fun prefs(context: Context) = context.getSharedPreferences("widget", Context.MODE_PRIVATE)

        fun lire(context: Context): Donnees? {
            val p = prefs(context)
            if (p.getInt("format", 1) < FORMAT) return null
            val commune = p.getString("commune", null) ?: return null
            return Donnees(
                commune, p.getString("temperature", null), p.getString("heure", null), p.getString("station", null),
                p.getString("zone", null), p.getBoolean("en_premier", false),
                p.getString("echec_a", null), p.getString("eau", null), p.getString("lue_a", null), p.getString("etat", null),
                p.getString("eau_lien", null), p.getString("officiel_lien", null),
            )
        }

        fun ecrire(context: Context, d: Donnees) {
            prefs(context).edit {
                putString("commune", d.commune).putString("temperature", d.temperature).putString("heure", d.heure)
                putString("station", d.station).putString("zone", d.zone).putString("etat", d.etat)
                putBoolean("en_premier", d.vigilanceEnPremier).putString("echec_a", d.echecA)
                putString("eau", d.eau).putString("lue_a", d.lueA).putString("eau_lien", d.eauLien).putString("officiel_lien", d.officielLien).putInt("format", FORMAT)
            }
        }
    }
}

/**
 * La ligne d'eau du widget : quoi, quand et où. « Eau à ne pas boire, secteur Traitement St Francois. », « Coupure d'eau
 * du lundi 23/11 à 21:00 (à venir), secteurs Chemin de Bois Rouge et 5 autres. ». Le titre de l'avis quand il ne dit ni
 * date ni secteur.
 */
fun ligneEau(a: AvisEau): String {
    val ou = a.secteurs.takeIf { it.isNotEmpty() }?.let { s ->
        (if (s.size == 1) "secteur " else "secteurs ") + nomDeSecteur(s[0]) + if (s.size > 1) " et ${s.size - 1} autre${if (s.size > 2) "s" else ""}" else ""
    }
    val quoi = if (a.nePasBoire) "Eau à ne pas boire" else "Coupure d'eau" + (Mots.quand(a)?.let { " $it" } ?: "")
    return when {
        ou != null -> "$quoi, $ou."
        a.nePasBoire || Mots.quand(a) == null -> "$quoi\u00a0: ${a.titre}."
        else -> "$quoi."
    }
}

private val PETITS = setOf("de", "du", "des", "la", "le", "les", "et", "d", "l")

/** « TRAITEMENT ST FRANCOIS » → « Traitement St Francois » : un secteur en capitales, écrit comme un nom ; tel quel sinon. */
fun nomDeSecteur(s: String): String {
    if (s != s.uppercase()) return s
    return s.lowercase().split(' ').mapIndexed { i, mot ->
        if (i > 0 && mot in PETITS) mot else mot.split('-').joinToString("-") { it.replaceFirstChar(Char::uppercaseChar) }
    }.joinToString(" ")
}

/** Les lignes du widget, de haut en bas. */
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
    /** « Lu à 20:11 » : en bas, l'heure (de La Réunion) de la dernière lecture réussie. */
    val lue: String? = null,
    /** La mention du kit, mot pour mot, sous la vigilance : OFFICIEL. */
    val officiel: String? = null,
)

/** La mention de Météo-France, une phrase entière avec ces mots exacts (le kit) : jamais une forme courte. */
const val OFFICIEL = "Consulter le site officiel de Météo-France"
/** Là où elle mène quand le résumé ne donne pas le lien (src/providers/vigilance.ts OFFICIEL_VIGILANCE). */
const val OFFICIEL_VIGILANCE = "https://vigilance.meteofrance.fr/fr/la-reunion"

/** Les mots du widget, d'après `d` ; null : aucune commune choisie dans l'appli. */
fun lignes(d: Donnees?, communeChoisie: String?): Lignes {
    if (d == null || communeChoisie == null || d.commune != communeChoisie) {
        return Lignes(communeChoisie ?: "rundata.re", null, if (communeChoisie == null) "Choisir une commune dans l'appli." else "Lecture des données…", emptyList(), null, null)
    }
    // Les mots de la zone tels que le résumé les écrit, chacun dans la couleur qu'il nomme.
    val vigilance = pastillesDe(d.etat)
    val detail = when {
        d.temperature == null -> "Pas de mesure récente."
        else -> "mesurée à ${d.heure}" + (d.station?.let { ", $it" } ?: "")
    }
    val alerte = d.echecA?.let { if (d.temperature != null) "rundata.re injoignable à $it\u00a0: mesure de ${d.heure}." else "rundata.re injoignable à $it." }
    val zone = when {
        d.etat == null -> null
        vigilance.isNotEmpty() -> d.zone?.let { "zone $it" }
        else -> d.etat.replaceFirstChar(Char::uppercaseChar) + (d.zone?.let { " · zone $it" } ?: "")
    }
    return Lignes(d.commune, d.temperature, detail, vigilance, zone, alerte, d.eau, d.lueA?.let { "Lu à $it" }, OFFICIEL.takeIf { d.etat != null })
}
