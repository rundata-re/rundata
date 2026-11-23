package re.rundata.app.android.widget

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.compose.ui.graphics.toArgb
import re.rundata.app.Alerte
import re.rundata.app.CLAIR
import re.rundata.app.Couleur
import re.rundata.app.R
import re.rundata.app.teinte

/**
 * Les notifications d'alerte, décidées sur le téléphone d'après ce que la mise à jour vient de lire (MiseAJour) : rien
 * n'est envoyé par un serveur. Une alerte n'est dite qu'une fois, tant qu'elle dure ; partie, sa notification s'en va.
 *
 * - la vigilance rouge et l'alerte cyclonique : en haut de l'écran (importance haute), jamais par-dessus une appli
 *   ouverte en plein écran ;
 * - la vigilance orange (les fortes pluies comprises), et un système tropical suivi par le CMRS : une notification
 *   ordinaire ;
 * - le jaune : le bandeau seulement, sans notification.
 */
object Notifications {
    private const val URGENTES = "alertes-urgentes"
    private const val ORDINAIRES = "alertes"

    /** Ce qui donne une notification, et sur quel canal ; null : le bandeau seulement. */
    fun canal(a: Alerte): String? = when {
        a.urgente -> URGENTES
        a.couleur == Couleur.ORANGE || a.systeme -> ORDINAIRES
        else -> null
    }

    /** Ce qui distingue une alerte d'une autre : la même alerte pour une autre zone est une autre alerte. */
    fun cle(a: Alerte, zone: String?): String = "${zone ?: "île"}|${a.cle}"

    /**
     * Les notifications à montrer et à retirer, d'après les alertes lues (`lues`, par clé) et celles déjà dites
     * (`dites`). Sans effet de bord : testé à part.
     */
    fun aFaire(lues: Map<String, Alerte>, dites: Set<String>): Pair<List<Pair<String, Alerte>>, Set<String>> =
        lues.filter { (k, a) -> k !in dites && canal(a) != null }.toList() to (dites - lues.keys)

    fun creerCanaux(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val m = context.getSystemService(NotificationManager::class.java)
        m.createNotificationChannel(NotificationChannel(URGENTES, "Alertes rouges et cycloniques", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Vigilance rouge de Météo-France, alerte cyclonique de la préfecture (de la pré-alerte à la phase de sauvegarde)."
        })
        m.createNotificationChannel(NotificationChannel(ORDINAIRES, "Vigilances orange et systèmes tropicaux", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Vigilance orange de Météo-France pour la zone ; dépression, tempête ou cyclone suivi par le CMRS de La Réunion dans le sud-ouest de l'océan Indien, même loin de l'île."
        })
    }

    private fun prefs(context: Context) = context.getSharedPreferences("notifications", Context.MODE_PRIVATE)

    /**
     * Ce qu'une mise à jour fait des notifications, sans effet de bord (testé à part) : `nouvelles`, les alertes à
     * notifier, avec leur commune ; `retirees`, les clés dont la notification s'en va ; `dites`, ce qui est retenu.
     */
    data class Decision(val nouvelles: List<Pair<String, Pair<Alerte, Donnees>>>, val retirees: Set<String>, val dites: Set<String>)

    fun decider(lues: List<Donnees>, dites: Set<String>): Decision {
        // Une commune dont les alertes n'ont pas été lues en entier (vigilance ou cyclones sans réponse) ne retire rien :
        // on ne sait pas si son alerte est partie. Retirée à tort, elle serait renvoyée à la lecture suivante.
        val parCle = lues.filter { it.alertes != null && it.echecA == null }.flatMap { d -> d.alertes!!.map { cle(it, d.zone) to (it to d) } }.toMap()
        val nonLues = lues.any { it.alertes == null || it.echecA != null || !it.vigilanceLue || !it.cyclonesLus }
        val (nouvelles, parties) = aFaire(parCle.mapValues { it.value.first }, dites)
        val retirees = if (nonLues) emptySet() else parties
        return Decision(nouvelles.map { (k, _) -> k to parCle.getValue(k) }, retirees, dites - retirees + nouvelles.map { it.first })
    }

    /** Après une mise à jour : `lues`, les alertes de chaque commune lue, avec la zone de sa vigilance. */
    fun signaler(context: Context, lues: List<Donnees>) {
        val (nouvelles, retirees, dites) = decider(lues, prefs(context).getStringSet("dites", emptySet()).orEmpty())
        val gestion = NotificationManagerCompat.from(context)
        val permise = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (permise && gestion.areNotificationsEnabled()) {
            creerCanaux(context)
            for ((k, ad) in nouvelles) gestion.notify(k.hashCode(), construire(context, ad.first, ad.second))
        }
        for (k in retirees) gestion.cancel(k.hashCode())
        prefs(context).edit { putStringSet("dites", dites) }
    }

    private fun construire(context: Context, a: Alerte, d: Donnees): android.app.Notification {
        val ouvrir = PendingIntent.getActivity(
            context, a.cle.hashCode(), Intent(Intent.ACTION_VIEW, Uri.parse(a.page)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val ou = if (a.cyclonique || a.systeme) "La Réunion" else d.zone?.let { "zone $it" } ?: d.commune
        val texte = listOfNotNull(ou, heureAlerte(a)).joinToString(" · ") + (a.detail?.let { "\n$it" } ?: "")
        return NotificationCompat.Builder(context, canal(a)!!)
            .setSmallIcon(R.drawable.ic_alerte)
            .setContentTitle(a.texte)
            .setContentText(texte.substringBefore('\n'))
            .setStyle(NotificationCompat.BigTextStyle().bigText(texte))
            .setColor(a.couleur.teinte(CLAIR).first.toArgb())
            .setPriority(if (a.urgente) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(ouvrir)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build()
    }
}
