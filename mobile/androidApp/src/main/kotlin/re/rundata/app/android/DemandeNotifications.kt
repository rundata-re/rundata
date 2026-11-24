package re.rundata.app.android

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.edit
import re.rundata.app.LocalCouleurs

/**
 * Le texte dit avant la fenêtre d'Android qui demande d'autoriser les notifications (Android 13 et plus) : pourquoi elle
 * est demandée. « Continuer » ouvre la fenêtre, une fois pour toutes ; « Plus tard » le redit dans 7 jours.
 */
object DemandeNotifications {
    const val TEXTE = "rundata.re peut vous prévenir des vigilances orange et rouge de Météo-France pour votre commune, des alertes cycloniques " +
        "de la préfecture et des systèmes tropicaux suivis par le CMRS. Rien d'autre : ni publicité, ni rappel."
    const val CONTINUER = "Continuer"
    const val PLUS_TARD = "Plus tard"
    const val SEPT_JOURS = 7L * 24 * 3600 * 1000

    private fun prefs(context: Context) = context.getSharedPreferences("notifications", Context.MODE_PRIVATE)

    /** À montrer : la fenêtre d'Android n'a jamais été ouverte, et « Plus tard » n'a pas été touché ces 7 derniers jours. */
    fun aMontrer(context: Context, maintenant: Long = System.currentTimeMillis()): Boolean {
        val p = prefs(context)
        return aMontrer(p.getBoolean("demandee", false), p.getLong("plus_tard", 0L), maintenant)
    }

    /**
     * La même règle, sans effet de bord (testée à part) : « Plus tard » ne fait que retenir son heure ; rien n'est
     * planifié, aucune notification n'est envoyée ; le texte revient seulement à l'ouverture de l'appli, 7 jours après.
     */
    fun aMontrer(demandee: Boolean, plusTardA: Long, maintenant: Long): Boolean = !demandee && maintenant - plusTardA >= SEPT_JOURS

    /**
     * L'écran dit que les notifications sont coupées : refusées (`permises` faux) alors qu'elles ont déjà été demandées,
     * ou remises à plus tard. Avant la première demande, c'est le texte d'avant qui parle, pas cet avis.
     */
    fun coupees(permises: Boolean, demandee: Boolean, plusTardA: Long): Boolean = !permises && (demandee || plusTardA > 0L)

    fun coupees(context: Context, permises: Boolean): Boolean {
        val p = prefs(context)
        return coupees(permises, p.getBoolean("demandee", false), p.getLong("plus_tard", 0L))
    }

    fun demandee(context: Context) = prefs(context).edit { putBoolean("demandee", true) }

    fun plusTard(context: Context) = prefs(context).edit { putLong("plus_tard", System.currentTimeMillis()) }
}

/** Le texte, par-dessus l'écran, avec ses deux boutons. */
@Composable
fun AvantDemande(continuer: () -> Unit, plusTard: () -> Unit) {
    val c = LocalCouleurs.current
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)).clickable(enabled = false) {}, contentAlignment = Alignment.Center) {
        Column(
            Modifier.padding(24.dp).fillMaxWidth().background(c.surface, RoundedCornerShape(16.dp)).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            BasicText(DemandeNotifications.TEXTE, style = TextStyle(fontSize = 16.sp, color = c.encre, lineHeight = 22.sp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Bouton(DemandeNotifications.PLUS_TARD, c.attenue, plusTard)
                Bouton(DemandeNotifications.CONTINUER, c.lien, continuer)
            }
        }
    }
}

@Composable
private fun Bouton(texte: String, couleur: Color, action: () -> Unit) {
    BasicText(
        texte, Modifier.clickable(role = Role.Button, onClick = action).padding(horizontal = 12.dp, vertical = 10.dp),
        style = TextStyle(fontSize = 16.sp, color = couleur, fontWeight = FontWeight.SemiBold),
    )
}
