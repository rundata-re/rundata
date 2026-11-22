package re.rundata.app

/** Une des 24 communes de La Réunion, avec le nom de sa page sur rundata.re. */
data class Commune(val slug: String, val nom: String) {
    /** La journée de la commune sur le site : météo mesurée, vigilance, coupures d'eau, marchés… */
    val pageDuJour: String get() = "$SITE/aujourdhui/$slug"
    val pageMeteo: String get() = "$SITE/meteo/$slug"
    val pageCoupures: String get() = "$SITE/coupures-eau/$slug"
}

/** Les pages de l'île entière que l'appli et le widget ouvrent. */
object Pages {
    const val MER = "$SITE/mer"
    const val VIGILANCE = "$SITE/vigilance"
    const val TRAFIC = "$SITE/trafic"
    const val ALERTE_CYCLONE = "$SITE/alerte-cyclone"
}

const val SITE = "https://rundata.re"

/** Les 24 communes, dans l'ordre du site (src/web/places.ts). */
val COMMUNES: List<Commune> = listOf(
    "bras-panon" to "Bras-Panon", "cilaos" to "Cilaos", "entre-deux" to "Entre-Deux", "l-etang-sale" to "L'Étang-Salé",
    "la-plaine-des-palmistes" to "La Plaine-des-Palmistes", "la-possession" to "La Possession", "le-port" to "Le Port",
    "le-tampon" to "Le Tampon", "les-avirons" to "Les Avirons", "les-trois-bassins" to "Les Trois-Bassins",
    "petite-ile" to "Petite-Île", "saint-andre" to "Saint-André", "saint-benoit" to "Saint-Benoît",
    "saint-denis" to "Saint-Denis", "saint-joseph" to "Saint-Joseph", "saint-leu" to "Saint-Leu",
    "saint-louis" to "Saint-Louis", "saint-paul" to "Saint-Paul", "saint-philippe" to "Saint-Philippe",
    "saint-pierre" to "Saint-Pierre", "sainte-marie" to "Sainte-Marie", "sainte-rose" to "Sainte-Rose",
    "sainte-suzanne" to "Sainte-Suzanne", "salazie" to "Salazie",
).map { (slug, nom) -> Commune(slug, nom) }

fun communeDe(slug: String?): Commune? = COMMUNES.firstOrNull { it.slug == slug }
