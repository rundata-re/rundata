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

    /** La dernière journée lue de la commune `slug` (Gardee.enJson) ; null : aucune, ou d'un format plus ancien. */
    fun journeeGardee(slug: String): String? = null

    fun garderJournee(slug: String, json: String) {}
}

/** Ce que montre l'écran principal. */
sealed interface Etat {
    /** Aucune commune choisie, ou le choix rouvert. */
    data class Choix(val actuelle: Commune?) : Etat
    data class Chargement(val commune: Commune, val precedente: Journee?) : Etat
    data class Prete(val journee: Journee) : Etat
    /**
     * La lecture a échoué : la dernière journée lue reste montrée avec son heure, jamais une valeur inventée, même après un
     * redémarrage (Gardee). `a` : « 24/11 09:12 », l'heure de l'échec.
     */
    data class Erreur(val commune: Commune, val message: String, val precedente: Journee?, val a: String? = null) : Etat
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
    /** « 24/11 09:12 », heure de La Réunion : l'heure de l'échec, dite avec lui. */
    private val horloge: () -> String? = { null },
    /** Le téléphone a un réseau (Android : ConnectivityManager) ; faux, l'échec le dit au lieu d'accuser rundata.re. */
    private val reseau: () -> Boolean = { true },
) {
    /** La dernière journée lue de la commune : celle gardée sur le téléphone au lancement, montrée hors ligne. */
    private var derniere: Journee? = communeDe(reglages.commune)?.let(::gardee)
    private val _etat = MutableStateFlow<Etat>(communeDe(reglages.commune)?.let { Etat.Chargement(it, derniere) } ?: Etat.Choix(null))
    val etat: StateFlow<Etat> = _etat
    private var lecture: Job? = null
    /** La dernière lecture lancée, réussie ou non. */
    private var lanceeA: TimeMark? = null

    init {
        (etat.value as? Etat.Chargement)?.let { lire(it.commune) }
    }

    fun choisir(commune: Commune) {
        avantChoix = null
        reglages.commune = commune.slug
        if (derniere?.commune != commune) derniere = gardee(commune)
        lire(commune)
    }

    /** L'écran d'avant le choix rouvert, rendu par Retour (annulerChoix). */
    private var avantChoix: Etat? = null

    fun changerDeCommune() {
        val avant = _etat.value
        if (avant !is Etat.Choix) avantChoix = avant
        lecture?.cancel()
        _etat.value = Etat.Choix(communeDe(reglages.commune))
    }

    /**
     * Retour sur le choix de la commune : l'écran d'avant revient, la commune affichée (relue si sa lecture avait été
     * interrompue par le choix). False quand il n'y a rien à rendre (aucune commune encore choisie) : Retour ferme
     * alors l'appli, comme sur tout premier écran.
     */
    fun annulerChoix(): Boolean {
        if (_etat.value !is Etat.Choix) return false
        val avant = avantChoix ?: return false
        avantChoix = null
        if (avant is Etat.Chargement) lire(avant.commune) else _etat.value = avant
        return true
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

        const val SANS_RESEAU = "Ce téléphone n'est pas connecté à Internet"
    }

    private fun lire(commune: Commune) {
        lecture?.cancel()
        _etat.value = Etat.Chargement(commune, derniere)
        lanceeA = temps.markNow()
        lecture = portee.launch {
            _etat.value = try {
                val j = source.journeeEtAlertes(commune)
                derniere = j
                reglages.garderJournee(commune.slug, Gardee.enJson(j))
                Etat.Prete(j)
            } catch (e: McpErreur) {
                // Sans réseau, c'est le téléphone qui ne peut pas lire, pas rundata.re qui ne répond pas (mode avion, 24/11/2026).
                Etat.Erreur(commune, if (!reseau()) SANS_RESEAU else e.message ?: "rundata.re ne répond pas", derniere, horloge())
            }
        }
    }

    /** La journée gardée de `commune`, si elle est bien la sienne et d'un format lisible. */
    private fun gardee(commune: Commune): Journee? = Gardee.de(reglages.journeeGardee(commune.slug))?.takeIf { it.commune == commune }
}
