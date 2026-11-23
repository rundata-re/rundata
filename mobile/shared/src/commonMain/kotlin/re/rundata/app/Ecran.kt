package re.rundata.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToLong

/** Les mots de l'écran, repris du site. */
object Mots {
    const val TITRE = "rundata.re"
    const val SOUS_TITRE = "La Réunion en direct, d'après les données publiques."
    const val CHOISIR = "Choisir une commune"
    const val CHANGER = "Changer de commune"
    const val CHARGEMENT = "Lecture des données…"
    const val REESSAYER = "Réessayer"
    const val MESURE = "Température mesurée"
    const val PAS_DE_MESURE = "Pas de mesure récente\u00a0: la page météo de la commune donne les stations."
    const val VOLCAN = "Piton de la Fournaise"
    const val COUPURES = "Coupures d'eau"
    const val NE_PAS_BOIRE = "Eau à ne pas boire"
    const val JOURNEE = "La journée sur rundata.re"
    const val HEURE = "heure de La Réunion"
    /** « 5,9 km », « 13 km ». */
    fun km(d: Double): String {
        val dixiemes = (d * 10).roundToLong()
        return if (dixiemes >= 100 || dixiemes % 10 == 0L) "${(dixiemes + 5) / 10} km" else "${dixiemes / 10},${dixiemes % 10} km"
    }
    fun mesureA(m: Mesure, lueA: String? = null): String = "mesurée ${Quand.a(m.heure, lueA)}, $HEURE, station ${m.station}" + (m.distanceKm?.let { ", à ${km(it)}" } ?: "") + (if (m.amateur) " (station amateur)" else "")
    /** « Source : rundata.re, d'après Météo-France et d'autres sources. Lu le 21/11 à 19:35, heure de La Réunion. » */
    fun source(j: Journee): String = "Source\u00a0: " + (j.citer?.substringBefore(" (liste dans sources)") ?: "rundata.re, d'après les données publiques") +
        (j.lueA?.let { ". ${Quand.lu(it)}, $HEURE." } ?: ".")
    /** « du jeudi 26/11 à 21:00 au vendredi 27/11 à 04:00 (à venir) ». */
    fun quand(a: AvisEau): String? = a.de?.let { de -> "du $de" + (a.a?.let { " au $it" } ?: "") + (a.etat?.let { " (${it.replace(' ', '\u00a0')})" } ?: "") }
    /** Les secteurs, trois au plus, puis leur nombre. */
    fun secteurs(a: AvisEau): String? = a.secteurs.takeIf { it.isNotEmpty() }?.let { s ->
        "Secteurs\u00a0: " + s.take(3).joinToString(", ") + if (s.size > 3) " et ${s.size - 3} autres" else ""
    }
    /**
     * « Bulletin de Météo-France du 22/11 à 16:21 », « Avis du CMRS du 23/11 10:00 » ; l'alerte cyclonique, décidée par
     * la préfecture et lue dans le bulletin de Météo-France : « Alerte de la préfecture · bulletin de Météo-France du 23/11 à 03:31 ».
     */
    fun heureAlerte(a: Alerte): String = when {
        a.cyclonique -> "Alerte de la préfecture · " + (a.heure?.let { "bulletin de Météo-France ${Quand.du(it)}" } ?: "d'après Météo-France")
        a.heure == null -> if (a.systeme) "D'après le CMRS de La Réunion" else "D'après Météo-France"
        a.systeme -> "Avis du CMRS du ${a.heure}"
        else -> "Bulletin de Météo-France ${Quand.du(a.heure)}"
    }
    fun licence(s: Source): String = s.nom + (s.licence?.let { "\u00a0: $it" } ?: "")
}

/** L'écran principal, le même sur Android et sur l'iPhone. `ouvrir` : une page du site (un onglet du navigateur). */
@Composable
fun EcranPrincipal(etat: Etat, choisir: (Commune) -> Unit, changer: () -> Unit, rafraichir: () -> Unit, ouvrir: (String) -> Unit) {
    val c = LocalCouleurs.current
    Box(Modifier.fillMaxSize().background(c.fond).windowInsetsPadding(WindowInsets.safeDrawing)) {
        when (etat) {
            is Etat.Choix -> ListeDesCommunes(etat.actuelle, choisir)
            is Etat.Chargement -> Carte(etat.commune, etat.precedente, Mots.CHARGEMENT, null, changer, ouvrir)
            is Etat.Prete -> Carte(etat.journee.commune, etat.journee, null, null, changer, ouvrir)
            is Etat.Erreur -> Carte(etat.commune, etat.precedente, null, etat.message, changer, ouvrir, rafraichir)
        }
    }
}

@Composable
private fun Texte(texte: String, taille: TextUnit = 16.sp, couleur: Color = LocalCouleurs.current.encre, gras: Boolean = false, modifier: Modifier = Modifier) {
    BasicText(texte, modifier, style = TextStyle(fontSize = taille, color = couleur, fontWeight = if (gras) FontWeight.SemiBold else FontWeight.Normal, lineHeight = taille * 1.35f))
}

@Composable
private fun EnTete(sous: String) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp)) {
        Texte(Mots.TITRE, 28.sp, gras = true)
        Texte(sous, 15.sp, LocalCouleurs.current.attenue)
    }
}

/** La liste des 24 communes, seule à l'écran : le choix de la commune d'un widget, quand on le pose. */
@Composable
fun ChoixDeCommune(titre: String, sous: String, actuelle: Commune?, choisir: (Commune) -> Unit) {
    Box(Modifier.fillMaxSize().background(LocalCouleurs.current.fond).windowInsetsPadding(WindowInsets.safeDrawing)) {
        ListeDesCommunes(actuelle, choisir, titre, sous)
    }
}

@Composable
private fun ListeDesCommunes(actuelle: Commune?, choisir: (Commune) -> Unit, titre: String = Mots.CHOISIR, sous: String = Mots.SOUS_TITRE) {
    val c = LocalCouleurs.current
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { EnTete(sous) }
        item { Texte(titre, 20.sp, gras = true, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) }
        items(COMMUNES, key = { it.slug }) { commune ->
            Row(
                Modifier.fillMaxWidth().clickable(role = Role.Button) { choisir(commune) }.padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Texte(commune.nom, 18.sp, gras = commune == actuelle, modifier = Modifier.weight(1f))
                if (commune == actuelle) Box(Modifier.size(10.dp).background(c.lien, CircleShape))
            }
        }
    }
}

@Composable
private fun Bloc(lien: String?, ouvrir: (String) -> Unit, fond: Color = LocalCouleurs.current.surface, contenu: @Composable () -> Unit) {
    val c = LocalCouleurs.current
    val forme = RoundedCornerShape(14.dp)
    Column(
        Modifier.fillMaxWidth().background(fond, forme).border(1.dp, c.trait, forme)
            .then(if (lien != null) Modifier.clickable(role = Role.Button) { ouvrir(lien) } else Modifier)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) { contenu() }
}

@Composable
private fun Carte(commune: Commune, j: Journee?, enCours: String?, erreur: String?, changer: () -> Unit, ouvrir: (String) -> Unit, rafraichir: (() -> Unit)? = null) {
    val c = LocalCouleurs.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Texte(Mots.TITRE, 15.sp, c.attenue)
                Texte(commune.nom, 28.sp, gras = true)
            }
            Texte(Mots.CHANGER, 15.sp, c.lien, modifier = Modifier.clickable(role = Role.Button, onClick = changer).padding(8.dp))
        }
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (enCours != null) Texte(enCours, 15.sp, c.attenue)
            if (erreur != null) {
                Bloc(null, ouvrir, c.avertissementFond) {
                    Texte(erreur + (j?.lueA?.let { ". Dernière lecture\u00a0: $it, ${Mots.HEURE}." } ?: "."), 15.sp)
                    if (rafraichir != null) Texte(Mots.REESSAYER, 15.sp, c.lien, gras = true, modifier = Modifier.clickable(role = Role.Button, onClick = rafraichir))
                }
            }
            if (j == null) return@Column
            // Les alertes tout en haut, dans leur couleur officielle, avec leur heure.
            j.alertes?.liste?.forEach { BandeauAlerte(it, ouvrir) }
            // La vigilance en premier quand il y en a une, avec le lien officiel de Météo-France.
            val v = j.vigilance
            if (v != null && v.enPremier) BlocVigilance(v, ouvrir)
            Bloc(commune.pageMeteo, ouvrir) {
                Texte(Mots.MESURE, 14.sp, c.attenue)
                val m = j.mesure
                if (m != null) {
                    Texte(m.temperature, 44.sp, gras = true)
                    Texte(Mots.mesureA(m, j.lueA), 15.sp, c.attenue)
                } else Texte(Mots.PAS_DE_MESURE, 15.sp)
            }
            if (v != null && !v.enPremier) BlocVigilance(v, ouvrir)
            j.volcan?.let { vo ->
                Bloc(vo.page, ouvrir, if (vo.alerte) c.avertissementFond else c.surface) {
                    Texte(Mots.VOLCAN, 14.sp, c.attenue)
                    vo.eruption?.let { Texte("Éruption en cours\u00a0: $it", 17.sp, c.lave, gras = true) }
                    vo.niveau?.let { Texte("Niveau du plan ORSEC\u00a0: $it", 16.sp) }
                }
            }
            if (j.coupures.isNotEmpty()) {
                Bloc(commune.pageCoupures, ouvrir, if (j.coupures.any { it.nePasBoire }) c.avertissementFond else c.surface) {
                    Texte(Mots.COUPURES, 14.sp, c.attenue)
                    j.coupures.forEach { a ->
                        Column {
                            Texte((if (a.nePasBoire) "${Mots.NE_PAS_BOIRE}\u00a0: " else "") + a.titre, 15.sp, gras = true)
                            Mots.quand(a)?.let { Texte(it, 14.sp) }
                            Mots.secteurs(a)?.let { Texte(it, 13.sp, c.attenue) }
                        }
                    }
                }
            }
            j.resume?.let { r ->
                Bloc(commune.pageDuJour, ouvrir) {
                    Texte(Mots.JOURNEE, 14.sp, c.attenue)
                    Texte(r.substringBefore(" Source\u00a0: "), 15.sp)
                }
            }
            Spacer(Modifier.size(4.dp))
            Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Texte(Mots.source(j), 13.sp, c.attenue)
                j.sources.forEach { Texte(Mots.licence(it), 12.sp, c.attenue) }
            }
        }
    }
}

/** Une alerte en bandeau : sa couleur officielle (gris sans couleur), ses mots, son heure ; touchée, sa page. */
@Composable
fun BandeauAlerte(a: Alerte, ouvrir: (String) -> Unit) {
    val c = LocalCouleurs.current
    val (teinte, encre) = a.couleur.teinte(c)
    Column(
        Modifier.fillMaxWidth().background(teinte, RoundedCornerShape(12.dp)).clickable(role = Role.Button) { ouvrir(a.page) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Texte(a.texte, 17.sp, encre, gras = true)
        a.detail?.let { Texte(it, 14.sp, encre) }
        Texte(Mots.heureAlerte(a), 13.sp, encre)
    }
}

@Composable
private fun BlocVigilance(v: Vigilance, ouvrir: (String) -> Unit) {
    val c = LocalCouleurs.current
    Bloc("$SITE/vigilance", ouvrir, if (v.enPremier) c.avertissementFond else c.surface) {
        // Une pastille par phénomène nommé, chacune dans sa couleur ; puis la zone.
        for (p in v.pastilles) {
            val (teinte, encre) = p.couleur.teinte(c)
            Box(Modifier.background(teinte, RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                Texte(p.texte, 14.sp, encre, gras = true)
            }
        }
        v.zone?.let { Texte("zone $it", 14.sp, c.attenue) }
        v.alerteCyclonique?.let { Texte(it, 16.sp, gras = true) }
        Texte(v.texte, 15.sp)
        v.officiel?.let { Texte(it, 13.sp, c.attenue) }
    }
}
