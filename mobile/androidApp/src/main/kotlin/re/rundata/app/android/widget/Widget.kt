package re.rundata.app.android.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.background
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider as Couleur
import re.rundata.app.Alerte
import re.rundata.app.CLAIR
import re.rundata.app.Commune
import re.rundata.app.Pages
import re.rundata.app.Pastille
import re.rundata.app.Quand
import re.rundata.app.SOMBRE
import re.rundata.app.android.PrefsReglages
import re.rundata.app.communeDe
import re.rundata.app.teinte

/** Les cinq widgets : chacun sa place sur l'écran d'accueil, et ce qu'il montre de sa commune. */
enum class Forme { TEMPERATURE, BANDEAU, JOURNEE, AUJOURDHUI, ALERTE }

/**
 * Un widget de rundata.re : la commune choisie quand on le pose (ChoixCommuneWidget), ce qui en a été lu en dernier
 * (Donnees) et une mise en page par taille (SizeMode.Responsive), qui remplit la place donnée.
 */
abstract class WidgetRundata(private val forme: Forme) : GlanceAppWidget() {
    // Un compteur dans l'état Glance : chaque écriture du worker le change (redessiner), et le contenu est relu.
    override val stateDefinition = PreferencesGlanceStateDefinition

    override val sizeMode: SizeMode = SizeMode.Responsive(
        when (forme) {
            Forme.TEMPERATURE -> setOf(DpSize(100.dp, 40.dp), DpSize(100.dp, 100.dp))
            Forme.BANDEAU -> setOf(DpSize(180.dp, 40.dp), DpSize(250.dp, 40.dp), DpSize(250.dp, 100.dp))
            Forme.JOURNEE -> setOf(DpSize(180.dp, 100.dp), DpSize(250.dp, 100.dp), DpSize(250.dp, 180.dp))
            Forme.AUJOURDHUI -> setOf(DpSize(250.dp, 180.dp), DpSize(250.dp, 280.dp), DpSize(250.dp, 400.dp))
            Forme.ALERTE -> setOf(DpSize(180.dp, 40.dp), DpSize(250.dp, 40.dp), DpSize(250.dp, 100.dp))
        },
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            // Lu ici, dans le contenu, et non avant : une session Glance déjà ouverte se recompose sans repasser par
            // provideGlance ; lues avant, les données restaient celles de son ouverture (« Lecture des données… »).
            val etat = currentState<Preferences>()
            etat[LECTURE_A]
            val commune = communeDuWidget(context, etat[COMMUNE])
            val d = commune?.let { Donnees.lire(context, it.slug) }
            // Le widget « Alerte » prend la couleur officielle de la plus grave ; les grands widgets partent du haut.
            val alerte = if (forme == Forme.ALERTE && commune != null && d != null) d.alertes?.firstOrNull() else null
            val action = when {
                commune == null -> choisir(context, id)
                forme == Forme.ALERTE -> ouvrir(alerte?.page ?: Pages.VIGILANCE)
                else -> ouvrir(commune.pageDuJour)
            }
            Cadre(action, alerte, enHaut = forme == Forme.JOURNEE || forme == Forme.AUJOURDHUI) {
                when (forme) {
                    Forme.TEMPERATURE -> Temperature(commune, d)
                    Forme.BANDEAU -> Bandeau(commune, d)
                    Forme.JOURNEE -> Journee(commune, d)
                    Forme.AUJOURDHUI -> Aujourdhui(commune, d)
                    Forme.ALERTE -> AlerteSeule(commune, d)
                }
            }
        }
    }

    companion object {
        /** La commune du widget, son slug ; sans elle, celle de l'appli. */
        val COMMUNE = stringPreferencesKey("commune")
        private val LECTURE_A = longPreferencesKey("lecture")

        val TOUS: List<Class<out WidgetRundata>> = listOf(WidgetTemperature::class.java, WidgetBandeau::class.java, WidgetJournee::class.java, WidgetAujourdhui::class.java, WidgetAlerte::class.java)

        fun communeDuWidget(context: Context, slug: String?): Commune? = communeDe(slug) ?: communeDe(PrefsReglages(context).commune)

        /** Chaque widget posé, avec sa commune. */
        suspend fun poses(context: Context): List<Pair<GlanceId, Commune?>> {
            val m = GlanceAppWidgetManager(context)
            return TOUS.flatMap { m.getGlanceIds(it) }.map { id ->
                id to communeDuWidget(context, getAppWidgetState(context, PreferencesGlanceStateDefinition, id)[COMMUNE])
            }
        }

        /** Le widget de la classe de `appWidgetId`. */
        fun pour(context: Context, appWidgetId: Int): WidgetRundata? =
            when (AppWidgetManager.getInstance(context).getAppWidgetInfo(appWidgetId)?.provider?.className) {
                RecepteurTemperature::class.java.name -> WidgetTemperature()
                RecepteurBandeau::class.java.name -> WidgetBandeau()
                RecepteurWidget::class.java.name -> WidgetJournee()
                RecepteurAujourdhui::class.java.name -> WidgetAujourdhui()
                RecepteurAlerte::class.java.name -> WidgetAlerte()
                else -> null
            }

        /** Redessine chaque widget posé avec ce qui vient d'être écrit (Donnees.ecrire). */
        suspend fun redessiner(context: Context) {
            val m = GlanceAppWidgetManager(context)
            for (classe in TOUS) {
                val widget = classe.getDeclaredConstructor().newInstance()
                for (id in m.getGlanceIds(classe)) {
                    updateAppWidgetState(context, id) { it[LECTURE_A] = System.currentTimeMillis() }
                    widget.update(context, id)
                }
            }
        }
    }
}

class WidgetTemperature : WidgetRundata(Forme.TEMPERATURE)
class WidgetBandeau : WidgetRundata(Forme.BANDEAU)
class WidgetJournee : WidgetRundata(Forme.JOURNEE)
class WidgetAujourdhui : WidgetRundata(Forme.AUJOURDHUI)
class WidgetAlerte : WidgetRundata(Forme.ALERTE)

// Les couleurs du site, claires de jour et sombres de nuit (le thème du téléphone).
private val ENCRE = ColorProvider(day = CLAIR.encre, night = SOMBRE.encre)
private val ATTENUE = ColorProvider(day = CLAIR.attenue, night = SOMBRE.attenue)
private val LIEN = ColorProvider(day = CLAIR.lien, night = SOMBRE.lien)
private val LAVE = ColorProvider(day = CLAIR.lave, night = SOMBRE.lave)

private fun ouvrir(adresse: String): Action = actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(adresse)))

/** Sans commune : l'écran du choix, pour ce widget. */
private fun choisir(context: Context, id: GlanceId): Action {
    val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
    return actionStartActivity(
        Intent(context, ChoixCommuneWidget::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).setData(Uri.parse("rundata-widget://choix/$appWidgetId")),
    )
}

/**
 * Le fond et les marges d'un widget. `alerte` : le fond prend sa couleur officielle (widget « Alerte »). `enHaut` : le
 * contenu part du haut, sans bande vide au-dessus (les grands widgets) ; centré en hauteur sinon.
 */
@Composable
private fun Cadre(action: Action, alerte: Alerte? = null, enHaut: Boolean = false, contenu: @Composable ColumnScope.() -> Unit) {
    val h = LocalSize.current.height
    val petit = h < 80.dp
    val fond = alerte?.let { it.couleur.teinte(CLAIR).first to it.couleur.teinte(SOMBRE).first } ?: (CLAIR.fond to SOMBRE.fond)
    Column(
        GlanceModifier.fillMaxSize().background(fond.first, fond.second).cornerRadius(20.dp)
            .padding(horizontal = if (petit) 12.dp else 14.dp, vertical = if (petit) 6.dp else if (h < 120.dp) 8.dp else 12.dp).clickable(action),
        verticalAlignment = if (enHaut) Alignment.Top else Alignment.CenterVertically,
        content = contenu,
    )
}

/** L'encre qui se lit sur la couleur de `a`. */
private fun encreDe(a: Alerte): Couleur = ColorProvider(day = a.couleur.teinte(CLAIR).second, night = a.couleur.teinte(SOMBRE).second)

/**
 * Le bandeau d'alerte des grands widgets : la plus grave, dans sa couleur officielle, avec son heure ; « et 1 autre »
 * quand il y en a plus. Touché : sa page. Rien quand il n'y a pas d'alerte, ou qu'elles n'ont pas été lues.
 */
@Composable
private fun BandeauAlerte(d: Donnees) {
    val liste = d.alertes.orEmpty()
    val a = liste.firstOrNull() ?: return
    val (fondClair, _) = a.couleur.teinte(CLAIR)
    val (fondSombre, _) = a.couleur.teinte(SOMBRE)
    val encre = encreDe(a)
    Column(GlanceModifier.fillMaxWidth().background(fondClair, fondSombre).cornerRadius(8.dp).padding(horizontal = 8.dp, vertical = 4.dp).clickable(ouvrir(a.page))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T(a.texte, 12.sp, encre, gras = true, lignes = 2, modifier = GlanceModifier.defaultWeight())
            heureAlerte(a)?.let { T("  $it", 10.sp, encre) }
        }
        enPlusAlertes(liste.size - 1)?.let { T(it, 10.sp, encre) }
    }
    Spacer(GlanceModifier.height(4.dp))
}

/** 4×1 « Alerte » : la plus grave dans sa couleur, ce qu'elle veut dire et son heure ; ou qu'il n'y en a pas, et d'après quel bulletin. */
@Composable
private fun ColumnScope.AlerteSeule(commune: Commune?, d: Donnees?) {
    if (Attente(commune, d)) return
    d!!
    val l = ligneAlerte(d)
    val haut = LocalSize.current.height >= 100.dp
    val encre = l.alerte?.let(::encreDe) ?: ENCRE
    val doux = l.alerte?.let(::encreDe) ?: ATTENUE
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        T(if (haut && l.texte == ALERTES_NON_LUES) ALERTES_NON_LUES_LONG else l.texte, if (haut) 16.sp else 14.sp, encre, gras = true, lignes = 2, modifier = GlanceModifier.defaultWeight())
        l.heure?.let { T("  $it", 11.sp, doux) }
    }
    val detail = listOfNotNull(l.detail, enPlusAlertes((d.alertes?.size ?: 0) - 1)).joinToString(" · ").takeIf { it.isNotEmpty() }
    detail?.let { T(it, 11.sp, doux, lignes = if (haut) 3 else 1) }
    if (haut) T(if (l.alerte == null) d.commune else "${d.commune}${d.zone?.let { " · zone $it" } ?: ""}", 11.sp, doux)
    horsLigne(d)?.let { T(it, 10.sp, if (l.alerte == null) LAVE else encre, lignes = 1) }
}

@Composable
private fun T(texte: String, taille: TextUnit, couleur: Couleur = ENCRE, gras: Boolean = false, lignes: Int = 1, modifier: GlanceModifier = GlanceModifier) {
    Text(texte, modifier = modifier, style = TextStyle(color = couleur, fontSize = taille, fontWeight = if (gras) FontWeight.Bold else FontWeight.Normal), maxLines = lignes)
}

/** Un grand nombre à `sp`, qui suit la taille du texte d'Android jusqu'à PLAFOND_CHIFFRES (tailleChiffre). */
@Composable
private fun chiffre(sp: Float): TextUnit = tailleChiffre(sp, LocalContext.current.resources.configuration.fontScale).sp

@Composable
private fun Puce(p: Pastille, action: Action, taille: TextUnit = 12.sp, lignes: Int = 2) {
    val (fondClair, encreClair) = p.couleur.teinte(CLAIR)
    val (fondSombre, encreSombre) = p.couleur.teinte(SOMBRE)
    Box(GlanceModifier.clickable(action).background(fondClair, fondSombre).cornerRadius(6.dp).padding(horizontal = 6.dp, vertical = 2.dp)) {
        Text(p.texte, style = TextStyle(color = ColorProvider(day = encreClair, night = encreSombre), fontSize = taille, fontWeight = FontWeight.Medium), maxLines = lignes)
    }
}

/** Rien à montrer encore : le nom, et ce qui se passe (« Lecture des données… », « Toucher pour choisir… »). */
@Composable
private fun Attente(commune: Commune?, d: Donnees?): Boolean {
    if (commune != null && d != null) return false
    val l = lignes(d, commune?.nom)
    T(l.titre, 14.sp, gras = true)
    l.detail?.let { T(it, 12.sp, ATTENUE, lignes = 2) }
    return true
}

/** 2×1 : la température mesurée, sa commune et son heure. Touché : la météo de la commune. */
@Composable
private fun ColumnScope.Temperature(commune: Commune?, d: Donnees?) {
    if (Attente(commune, d)) return
    commune!!; d!!
    val haut = LocalSize.current.height >= 100.dp
    // Pas de « Lu le … » sur ce petit widget : l'heure de la mesure porte toujours son jour.
    val heure = d.heure?.let { h -> d.echecA?.let { "mesure " + Quand.du(h) } ?: Quand.a(h) }
    val meteo = GlanceModifier.clickable(ouvrir(commune.pageMeteo))
    if (!haut) {
        Row(meteo.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            Column(GlanceModifier.defaultWeight()) {
                T(d.commune, 13.sp, gras = true)
                heure?.let { T(it, 11.sp, if (d.echecA != null) LAVE else ATTENUE) }
            }
            T(d.temperature ?: "–", chiffre(26f), gras = true)
        }
    } else {
        Column(meteo.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            T(d.commune, 14.sp, gras = true)
            T(d.temperature ?: "Pas de mesure récente", if (d.temperature != null) chiffre(34f) else 13.sp, gras = d.temperature != null)
            d.heure?.let { T("mesurée " + Quand.a(it) + (d.station?.let { s -> ", $s" } ?: ""), 11.sp, ATTENUE, lignes = 2) }
            horsLigne(d)?.let { T(it, 11.sp, LAVE, lignes = 2) }
        }
    }
}

/** 4×1 : la température, la mer et la vigilance côte à côte ; chacune touchée ouvre sa page. */
@Composable
private fun ColumnScope.Bandeau(commune: Commune?, d: Donnees?) {
    if (Attente(commune, d)) return
    commune!!; d!!
    val taille = LocalSize.current
    val haut = taille.height >= 100.dp
    val avecMer = taille.width >= 250.dp && d.mer != null
    if (haut) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T(d.commune, 14.sp, gras = true, modifier = GlanceModifier.defaultWeight())
            d.lueA?.let { T(Quand.lu(it), 11.sp, ATTENUE) }
        }
    }
    Row(GlanceModifier.fillMaxWidth().defaultWeight(), verticalAlignment = Alignment.CenterVertically) {
        Column(GlanceModifier.defaultWeight().fillMaxHeight().clickable(ouvrir(commune.pageMeteo)), verticalAlignment = Alignment.CenterVertically) {
            T(d.temperature ?: "–", chiffre(if (haut) 22f else 20f), gras = true)
            T(if (haut) "air, " + (d.heure?.let { h -> d.echecA?.let { "mesure " + Quand.du(h, d.lueA) } ?: Quand.a(h, d.lueA) } ?: "?") else (if (d.echecA != null) "mesure " + (d.heure?.let { Quand.du(it) } ?: "?") else d.commune), 11.sp, if (d.echecA != null) LAVE else ATTENUE)
        }
        if (avecMer) {
            Spacer(GlanceModifier.width(8.dp))
            Column(GlanceModifier.defaultWeight().fillMaxHeight().clickable(ouvrir(Pages.MER)), verticalAlignment = Alignment.CenterVertically) {
                T(d.mer, chiffre(if (haut) 22f else 20f), gras = true)
                // Deux lignes quand le widget est haut : « mer, vue par satellite le 21/11 » ne tient pas sur une à 411 dp.
                T(if (haut) libelleMer(d.merJour, d.merBouee, d.merHeure) else "mer", 11.sp, ATTENUE, lignes = if (haut) 2 else 1)
            }
        }
        Spacer(GlanceModifier.width(8.dp))
        val vigilance = ouvrir(Pages.VIGILANCE)
        Column(GlanceModifier.defaultWeight().fillMaxHeight().clickable(vigilance), verticalAlignment = Alignment.CenterVertically) {
            val v = vigilanceCourte(d)
            val cyclone = d.alertes?.firstOrNull()?.takeIf { it.cyclonique }
            when {
                cyclone != null -> Puce(Pastille(cyclone.texte, cyclone.couleur), ouvrir(cyclone.page), if (haut) 12.sp else 11.sp, lignes = if (haut) 3 else 2)
                v == null -> T("Vigilance non lue", 12.sp, ATTENUE, lignes = 2)
                v.second != null -> Puce(v.second!!, vigilance, if (haut) 12.sp else 11.sp, lignes = if (haut) 3 else 2)
                else -> T(v.first, 12.sp, lignes = 2)
            }
            if (haut) d.zone?.let { T("zone $it", 11.sp, ATTENUE) }
        }
    }
    if (haut) T(OFFICIEL, 10.sp, LIEN, modifier = GlanceModifier.clickable(ouvrir(d.officielLien ?: OFFICIEL_VIGILANCE)))
}

/** 4×2 : la journée de la commune, la mesure, la vigilance de sa zone, l'avis d'eau. Touché : la journée sur le site. */
@Composable
private fun ColumnScope.Journee(commune: Commune?, d: Donnees?) {
    if (Attente(commune, d)) return
    commune!!; d!!
    val l = lignes(d, commune.nom)
    val grand = LocalSize.current.height >= 180.dp
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        T(l.titre, 15.sp, gras = true, modifier = GlanceModifier.defaultWeight())
        l.lue?.let { T(it, 11.sp, ATTENUE) }
    }
    BandeauAlerte(d)
    Row(GlanceModifier.fillMaxWidth().clickable(ouvrir(commune.pageMeteo)), verticalAlignment = Alignment.CenterVertically) {
        l.grande?.let { T(it, chiffre(34f), gras = true) }
        Spacer(GlanceModifier.width(10.dp))
        l.detail?.let { T(it, 12.sp, ATTENUE, lignes = 2, modifier = GlanceModifier.defaultWeight()) }
    }
    val vigilance = ouvrir(Pages.VIGILANCE)
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        for (p in l.vigilance.take(if (grand) 3 else 2)) {
            Puce(p, vigilance, lignes = 1)
            Spacer(GlanceModifier.width(4.dp))
        }
        l.zone?.let { T(it, 11.sp, ATTENUE, modifier = GlanceModifier.clickable(vigilance)) }
    }
    l.officiel?.let { T(it, 11.sp, LIEN, modifier = GlanceModifier.clickable(ouvrir(d.officielLien ?: OFFICIEL_VIGILANCE))) }
    if (grand) l.prevision?.let { T(it, 11.sp, ATTENUE, lignes = 2, modifier = GlanceModifier.clickable(ouvrir(commune.pageMeteo))) }
    l.eau?.let {
        Spacer(GlanceModifier.height(4.dp))
        T(it, 12.sp, lignes = if (grand) 3 else 2, modifier = GlanceModifier.clickable(ouvrir(commune.pageCoupures)))
    }
    l.alerte?.let { T(it, 11.sp, LAVE, lignes = 2) }
}

/** Le grand widget : que faire aujourd'hui, sortir, les routes et l'eau. Chaque partie touchée ouvre sa page. */
@Composable
private fun ColumnScope.Aujourdhui(commune: Commune?, d: Donnees?) {
    if (Attente(commune, d)) return
    commune!!; d!!
    val h = LocalSize.current.height
    val n = when {
        h >= 400.dp -> 4
        h >= 280.dp -> 2
        else -> 1
    }
    Row(GlanceModifier.fillMaxWidth().clickable(ouvrir(commune.pageDuJour)), verticalAlignment = Alignment.CenterVertically) {
        T(d.commune, 15.sp, gras = true, modifier = GlanceModifier.defaultWeight())
        d.temperature?.let { T(it, 15.sp, gras = true) }
        d.lueA?.let { T("  " + Quand.lu(it), 11.sp, ATTENUE) }
    }
    BandeauAlerte(d)
    vigilanceCourte(d)?.let { (texte, p) ->
        val vigilance = ouvrir(Pages.VIGILANCE)
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (p != null) Puce(p, vigilance, 11.sp, lignes = 1) else T(texte, 11.sp, ATTENUE)
            d.zone?.let { T("  zone $it", 11.sp, ATTENUE, modifier = GlanceModifier.clickable(vigilance)) }
        }
    }
    val pages = listOf(commune.pageDuJour, Pages.TRAFIC, commune.pageCoupures)
    sections(d, n).forEachIndexed { i, s ->
        Spacer(GlanceModifier.height(6.dp))
        Column(GlanceModifier.fillMaxWidth().clickable(ouvrir(pages[i]))) {
            T(s.titre, 11.sp, LIEN, gras = true)
            if (s.lignes.isEmpty()) s.vide?.let { T(it, 12.sp, ATTENUE, lignes = 2) }
            for (l in s.lignes) {
                // L'avis d'eau entier (ses dates et ses secteurs) ; les autres lignes sur deux, sauf au plus grand.
                T(l.texte, 12.sp, lignes = if (i == 2) 3 else if (n >= 4) 1 else 2)
                l.apres?.let { T(it, 10.sp, ATTENUE) }
            }
            enPlus(s.enPlus)?.let { T(it, 10.sp, ATTENUE) }
        }
    }
    horsLigne(d)?.let {
        Spacer(GlanceModifier.height(4.dp))
        T(it, 11.sp, LAVE, lignes = 2)
    }
}

/** Les récepteurs : un par widget du sélecteur, chacun avec sa taille de départ et son aperçu (res/xml). */
abstract class RecepteurRundata(widget: GlanceAppWidget) : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = widget

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        MiseAJour.planifier(context)
    }

    /** Au placement d'un widget (et à chaque demande du système) : sa commune est lue tout de suite. */
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        MiseAJour.planifier(context)
        MiseAJour.maintenant(context)
    }

    /**
     * Après une mise à jour de l'appli, le système redessine le widget avec son écran d'attente : il est relu et
     * redessiné tout de suite, sans attendre sa demi-heure.
     */
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            MiseAJour.planifier(context)
            MiseAJour.maintenant(context)
        }
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        // Le dernier widget de ce genre enlevé : la relecture s'arrête quand il n'en reste plus aucun (MiseAJour).
        MiseAJour.maintenant(context)
    }
}

class RecepteurTemperature : RecepteurRundata(WidgetTemperature())
class RecepteurBandeau : RecepteurRundata(WidgetBandeau())
/** Le nom de 0.1 gardé : le widget « La journée ». */
class RecepteurWidget : RecepteurRundata(WidgetJournee())
class RecepteurAujourdhui : RecepteurRundata(WidgetAujourdhui())
class RecepteurAlerte : RecepteurRundata(WidgetAlerte())
