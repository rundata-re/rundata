package re.rundata.app.android.widget

import android.content.Context
import androidx.core.content.edit
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import re.rundata.app.Alerte
import re.rundata.app.AvisEau
import re.rundata.app.InfoRoute
import re.rundata.app.Journee
import re.rundata.app.Mots
import re.rundata.app.Sortie
import re.rundata.app.avisEnPremier

/** Une ligne d'une liste du widget : ce qu'elle dit, et ce qui la suit en plus petit (quand, où, quel média). */
@Serializable
data class Ligne(val texte: String, val apres: String? = null)

/**
 * Ce que les widgets montrent d'une commune, gardé d'une mise à jour à l'autre : la dernière lecture réussie reste, avec
 * son heure, quand la suivante échoue. Jamais une valeur inventée. Une par commune : chaque widget a la sienne.
 */
@Serializable
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
    /** L'avis d'eau sur le site du distributeur. */
    val eauLien: String? = null,
    /** Le lien du champ officiel de la vigilance (vigilance.meteofrance.fr). */
    val officielLien: String? = null,
    val slug: String? = null,
    /** « 27 °C » : la mer au large de la commune, mesurée par satellite. */
    val mer: String? = null,
    /** « Prévision : de 24,1 °C à 25,2 °C, pas de pluie prévue de 20 h à minuit. » : une PRÉVISION, dite comme telle. */
    val prevision: String? = null,
    /** Les autres avis d'eau, après celui qui est dit. */
    val eauAutres: Int = 0,
    /** « runéo ». */
    val distributeur: String? = null,
    /** Les événements puis les marchés du jour ; null : les agendas n'ont pas été lus. */
    val sorties: List<Ligne>? = null,
    /** Les informations des médias sur les routes ; null : les médias n'ont pas été lus. */
    val routes: List<Ligne>? = null,
    /** Les avis des réseaux de bus. */
    val bus: List<Ligne> = emptyList(),
    /** Le texte de l'alerte cyclonique, tel quel, quand il y en a une. */
    val alerteCyclonique: String? = null,
    /** Les alertes du bandeau, la plus grave en premier ; null : pas lues (jamais « pas d'alerte »). */
    val alertes: List<Alerte>? = null,
    /** « 16:21 » : le bulletin de vigilance d'où elles viennent ; null quand la vigilance n'a pas été lue. */
    val alertesEmise: String? = null,
    val vigilanceLue: Boolean = false,
    val format: Int = FORMAT,
) {
    companion object {
        /**
         * Le format de ce qui est gardé : une donnée d'un format plus ancien n'est pas montrée, elle est relue.
         * 4 : une par commune, avec la mer, la prévision, les sorties et les routes (0.2.0).
         */
        const val FORMAT = 4

        private val JSON = Json { ignoreUnknownKeys = true }

        fun de(j: Journee): Donnees {
            val eau = avisEnPremier(j.coupures, mois())
            return Donnees(
                commune = j.commune.nom,
                slug = j.commune.slug,
                temperature = j.mesure?.temperature,
                heure = j.mesure?.heureSeule,
                station = j.mesure?.station,
                etat = j.vigilance?.etat,
                zone = j.vigilance?.zone,
                vigilanceEnPremier = j.vigilance?.enPremier == true,
                alerteCyclonique = j.vigilance?.alerteCyclonique,
                echecA = null,
                eau = eau?.let(::ligneEau),
                eauLien = eau?.lien,
                eauAutres = if (eau == null) 0 else j.coupures.size - 1,
                distributeur = j.distributeur,
                officielLien = j.vigilance?.officiel?.let { o -> o.indexOf("https://").takeIf { it >= 0 }?.let { o.substring(it).trim() } },
                lueA = j.lueA?.let { it.substringAfter(" ", it) },
                mer = j.mer?.temperature,
                prevision = j.prevision?.let(::lignePrevision),
                sorties = j.sorties?.map(::ligneSortie),
                routes = j.routes?.infos?.map(::ligneRoute),
                bus = j.routes?.bus.orEmpty().map(::ligneRoute),
                alertes = j.alertes?.liste,
                alertesEmise = j.alertes?.emise,
                vigilanceLue = j.alertes?.vigilanceLue == true,
            )
        }

        private fun mois(): Int = java.time.ZonedDateTime.now(java.time.ZoneId.of("Indian/Reunion")).monthValue

        private fun prefs(context: Context) = context.getSharedPreferences("widget", Context.MODE_PRIVATE)

        /** Ce qui est gardé pour la commune `slug`, ou null : rien, ou d'un format plus ancien. */
        fun lire(context: Context, slug: String): Donnees? = decoder(prefs(context).getString("journee.$slug", null))

        fun ecrire(context: Context, d: Donnees) {
            val slug = d.slug ?: return
            prefs(context).edit { putString("journee.$slug", JSON.encodeToString(serializer(), d)) }
        }

        fun decoder(texte: String?): Donnees? = texte?.let { runCatching { JSON.decodeFromString(serializer(), it) }.getOrNull() }?.takeIf { it.format >= FORMAT }

        fun encoder(d: Donnees): String = JSON.encodeToString(serializer(), d)
    }
}

/** « Prévision : de 24,1 °C à 25,2 °C, pas de pluie prévue de 20 h à minuit. » */
fun lignePrevision(p: re.rundata.app.Prevision): String? {
    val temp = when {
        p.min != null && p.max != null && p.min != p.max -> "de ${p.min} à ${p.max}"
        else -> p.max ?: p.min
    }
    val mots = listOfNotNull(temp, p.pluie).takeIf { it.isNotEmpty() } ?: return null
    return "Prévision : " + mots.joinToString(", ") + "."
}

/** « ANNULÉ · Concert de … », puis « de 5 h à 12 h · Musée Léon Dierx ». */
fun ligneSortie(s: Sortie): Ligne = Ligne(
    (s.statut?.let { "$it · " } ?: "") + s.titre,
    listOfNotNull(s.quand, s.lieu).joinToString(" · ").takeIf { it.isNotEmpty() },
)

/** « Route du Littoral fermée… », puis « Clicanoo · 21/11 18:40 ». */
fun ligneRoute(i: InfoRoute): Ligne = Ligne(i.titre, listOfNotNull(i.media, i.quand).joinToString(" · ").takeIf { it.isNotEmpty() })

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
        a.nePasBoire || Mots.quand(a) == null -> "$quoi : ${a.titre}."
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
