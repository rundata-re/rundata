package re.rundata.app.android.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import re.rundata.app.McpErreur
import re.rundata.app.android.PrefsReglages
import re.rundata.app.communeDe
import re.rundata.app.android.source
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/**
 * Relit, toutes les 30 min, la journée et les alertes de chaque commune d'un widget posé et de celle de l'appli, puis
 * décide des notifications d'alerte (Notifications). S'arrête quand il n'y a ni widget ni commune choisie.
 */
class MiseAJour(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val c = applicationContext
        val communes = (WidgetRundata.poses(c).mapNotNull { it.second } + listOfNotNull(communeDe(PrefsReglages(c).commune))).distinct()
        if (communes.isEmpty()) {
            annuler(c)
            return Result.success()
        }
        // Une lecture par commune, quel que soit le nombre de widgets qui la montrent.
        val lues = communes.map { commune ->
            val avant = Donnees.lire(c, commune.slug)
            val apres = try {
                Donnees.de(c.source.journeeEtAlertes(commune))
            } catch (e: McpErreur) {
                // La dernière lecture reste, avec son heure ; l'échec est dit.
                (avant ?: Donnees(commune.nom, null, null, null, null, false, null, slug = commune.slug)).copy(echecA = heureLocale())
            }
            Donnees.ecrire(c, apres)
            apres
        }
        WidgetRundata.redessiner(c)
        Notifications.signaler(c, lues)
        return Result.success()
    }

    companion object {
        private const val PERIODIQUE = "widget-periodique"
        private const val UNIQUE = "widget-maintenant"

        private fun heureLocale(): String = ZonedDateTime.now(ZoneId.of("Indian/Reunion")).format(DateTimeFormatter.ofPattern("dd/MM HH:mm"))

        fun planifier(context: Context) {
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIQUE, ExistingPeriodicWorkPolicy.KEEP, PeriodicWorkRequestBuilder<MiseAJour>(30, TimeUnit.MINUTES).build(),
            )
        }

        fun maintenant(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<MiseAJour>().build())
        }

        fun annuler(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIQUE)
        }
    }
}
