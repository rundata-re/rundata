package re.rundata.app

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

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

/** L'état de l'écran principal, commun aux deux téléphones. */
class Modele(private val source: JourneeSource, private val reglages: Reglages, private val portee: CoroutineScope) {
    private val _etat = MutableStateFlow<Etat>(communeDe(reglages.commune)?.let { Etat.Chargement(it, null) } ?: Etat.Choix(null))
    val etat: StateFlow<Etat> = _etat
    private var lecture: Job? = null
    private var derniere: Journee? = null

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

    private fun lire(commune: Commune) {
        lecture?.cancel()
        _etat.value = Etat.Chargement(commune, derniere)
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
