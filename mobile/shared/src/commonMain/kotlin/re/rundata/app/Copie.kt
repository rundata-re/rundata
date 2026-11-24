package re.rundata.app

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.TimeMark
import kotlin.time.TimeSource

/**
 * Les réponses des outils lues il y a moins de `duree`, par outil et par lieu, gardées en mémoire : l'écran, chaque widget
 * et la mise à jour de fond ne relisent pas ce que le site vient de donner, lui qui ne relit ses sources que toutes les
 * quelques minutes. Les cyclones, les mêmes pour toute l'île, sont lus une fois pour toutes les communes. Un échec n'est
 * jamais gardé : il est relu à la fois suivante.
 */
class Copie(private val temps: TimeSource = TimeSource.Monotonic, private val duree: Duration = DUREE) {
    private val verrou = Mutex()
    private val reponses = mutableMapOf<String, Pair<TimeMark, JsonObject>>()

    suspend fun lire(cle: String, lecture: suspend () -> JsonObject): JsonObject {
        verrou.withLock { reponses[cle]?.takeIf { it.first.elapsedNow() < duree }?.let { return it.second } }
        val r = lecture()
        verrou.withLock { reponses[cle] = temps.markNow() to r }
        return r
    }

    companion object {
        val DUREE = 5.minutes
    }
}
