package re.rundata.app

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.TimeMark
import kotlin.time.TimeSource

/** Ce que l'appli garde d'une fois sur l'autre (SharedPreferences sur Android, NSUserDefaults sur l'iPhone). */
interface Reglages {
    var commune: String?
}

/** Ce que montre l'écran principal. */
sealed interface Etat {
    /** Aucune commune choisie, ou le choix rouvert. */
    data class Choix(val actuelle: Commune?) : Etat
    data class Chargement(val commune: Commune, val precedente: Journee?) : Etat
    data class Prete(val journee: Journee) : Etat
    /** La lecture a échoué : la dernière journée lue reste montrée avec son heure, jamais une valeur inventée. */
    data class Erreur(val commune: Commune, val message: String, val precedente: Journee?) : Etat
}

/**
 * L'état de l'écran principal, commun aux deux téléphones. `temps` : l'horloge qui dit depuis quand l'écran a été lu
 * (remplacée dans les tests).
 */
class Modele(
    private val source: JourneeSource,
    private val reglages: Reglages,
    private val portee: CoroutineScope,
    private val temps: TimeSource = TimeSource.Monotonic,
) {
    private val _etat = MutableStateFlow<Etat>(communeDe(reglages.commune)?.let { Etat.Chargement(it, null) } ?: Etat.Choix(null))
    val etat: StateFlow<Etat> = _etat
    private var lecture: Job? = null
    private var derniere: Journee? = null
    /** La dernière lecture lancée, réussie ou non. */
    private var lanceeA: TimeMark? = null

    init {
        (etat.value as? Etat.Chargement)?.let { lire(it.commune) }
    }

    fun choisir(commune: Commune) {
        reglages.commune = commune.slug
        if (derniere?.commune != commune) derniere = null
        lire(commune)
    }

    fun changerDeCommune() {
        lecture?.cancel()
        _etat.value = Etat.Choix(communeDe(reglages.commune))
    }

    fun rafraichir() {
        communeDe(reglages.commune)?.let(::lire)
    }

    /**
     * L'écran revient au premier plan : relu si sa dernière lecture date de plus de `RELIRE_APRES`. Sans ça, un écran
     * laissé ouvert en arrière-plan montrerait au retour une mesure ou une alerte de la veille. Rien pendant une lecture
     * en cours, ni sur le choix de la commune.
     */
    fun revenir() {
        if (_etat.value !is Etat.Prete && _etat.value !is Etat.Erreur) return
        val depuis = lanceeA?.elapsedNow() ?: Duration.INFINITE
        if (depuis >= RELIRE_APRES) rafraichir()
    }

    companion object {
        /** Le site relit ses sources toutes les quelques minutes : relire plus souvent ne montrerait rien de neuf. */
        val RELIRE_APRES = 10.minutes
    }

    private fun lire(commune: Commune) {
        lecture?.cancel()
        _etat.value = Etat.Chargement(commune, derniere)
        lanceeA = temps.markNow()
        lecture = portee.launch {
            _etat.value = try {
                val j = source.journeeEtAlertes(commune)
                derniere = j
                Etat.Prete(j)
            } catch (e: McpErreur) {
                Etat.Erreur(commune, e.message ?: "rundata.re ne répond pas", derniere)
            }
        }
    }
}
