package re.rundata.app

/**
 * Le jour et l'heure d'une donnée, heure de La Réunion, tels que rundata.re les écrit : « 21/11 19:30 ». On les garde
 * entiers : un widget que le système n'a pas redessiné, ou un écran resté ouvert, ne doit jamais montrer une heure
 * d'un autre jour sans le jour.
 */
object Quand {
    private val JOUR_HEURE = Regex("\\b(\\d{1,2}/\\d{1,2})\\D{1,3}(\\d{1,2}:\\d{2})\\b")

    /** « 22/11 16:21 heure de La Réunion » → « 22/11 16:21 » ; une heure sans jour → l'heure seule ; rien → null. */
    fun de(texte: String?): String? {
        texte ?: return null
        JOUR_HEURE.find(texte)?.let { return "${it.groupValues[1]} ${it.groupValues[2]}" }
        return heureDe(texte)
    }

    /** « 21/11 19:30 » → « 21/11 » ; null sans jour. */
    fun jour(h: String?): String? = h?.let { JOUR_HEURE.find(it)?.groupValues?.get(1) }

    /** « 21/11 19:30 » → « 19:30 ». */
    fun heure(h: String): String = heureDe(h) ?: h

    /** « à 19:30 » le même jour que `ref` (« 21/11 20:05 »), « le 21/11 à 19:30 » un autre jour ou sans `ref`. */
    fun a(h: String, ref: String? = null): String {
        val j = jour(h) ?: return "à ${heure(h)}"
        return if (j == jour(ref)) "à ${heure(h)}" else "le $j à ${heure(h)}"
    }

    /** « de 19:30 » le même jour que `ref`, « du 21/11 à 19:30 » sinon. */
    fun du(h: String, ref: String? = null): String {
        val j = jour(h) ?: return "de ${heure(h)}"
        return if (j == jour(ref)) "de ${heure(h)}" else "du $j à ${heure(h)}"
    }

    /** « Lu le 21/11 à 19:35 » : toujours avec le jour, c'est l'heure à laquelle se rapporte tout le reste. */
    fun lu(h: String): String = "Lu " + a(h)
}
