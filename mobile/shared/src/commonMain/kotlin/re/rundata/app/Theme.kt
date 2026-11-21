package re.rundata.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/** Les couleurs du site (src/web/pages.ts, :root et prefers-color-scheme: dark). */
data class Couleurs(
    val fond: Color,
    val surface: Color,
    val encre: Color,
    val attenue: Color,
    val trait: Color,
    val lien: Color,
    val lave: Color,
    val avertissementFond: Color,
    val vert: Color,
    val surVert: Color,
    val sombre: Boolean,
)

val CLAIR = Couleurs(
    fond = Color(0xFFF6F2EA), surface = Color(0xFFFFFFFF), encre = Color(0xFF14202B), attenue = Color(0xFF5A6672),
    trait = Color(0xFFE6DECE), lien = Color(0xFF1D4EA6), lave = Color(0xFFC0321F), avertissementFond = Color(0xFFFDEEE8),
    vert = Color(0xFF237534), surVert = Color(0xFFFFFFFF), sombre = false,
)

val SOMBRE = Couleurs(
    fond = Color(0xFF08121D), surface = Color(0xFF0F1D2C), encre = Color(0xFFE7EEF5), attenue = Color(0xFF9FB1C3),
    trait = Color(0xFF1F3247), lien = Color(0xFF8FB4FF), lave = Color(0xFFFF8A6B), avertissementFond = Color(0xFF2A1712),
    vert = Color(0xFF4CC765), surVert = Color(0xFF08121D), sombre = true,
)

/** Les couleurs des vigilances, celles des pastilles du site (--vg1 à --vg5), et l'encre qui se lit dessus. */
fun Couleur.teinte(c: Couleurs): Pair<Color, Color> = when (this) {
    Couleur.VERT -> c.vert to c.surVert
    Couleur.JAUNE -> Color(0xFFFFD400) to Color(0xFF1A1500)
    Couleur.ORANGE -> Color(0xFFF08A00) to Color(0xFF1A1000)
    Couleur.ROUGE -> Color(0xFFC8231A) to Color(0xFFFFFFFF)
    Couleur.VIOLET -> Color(0xFF6B2FA8) to Color(0xFFFFFFFF)
    Couleur.AUCUNE -> Color(0xFF5F6B75) to Color(0xFFFFFFFF)
}

val LocalCouleurs = staticCompositionLocalOf { CLAIR }

@Composable
fun ThemeRundata(sombre: Boolean, contenu: @Composable () -> Unit) {
    CompositionLocalProvider(LocalCouleurs provides if (sombre) SOMBRE else CLAIR, content = contenu)
}
