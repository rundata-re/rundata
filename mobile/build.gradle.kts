// Les versions des greffons, une seule fois ici. Déclarer le greffon Kotlin met la version 2.4.21 sur le classpath :
// le Kotlin intégré d'AGP 9.5.2 compile alors l'appli avec elle aussi.
plugins {
    id("com.android.application") version "9.5.3" apply false
    id("com.android.kotlin.multiplatform.library") version "9.5.3" apply false
    id("org.jetbrains.kotlin.multiplatform") version "2.4.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.21" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.4.21" apply false
    // 1.12 tire Compose 1.12 d'androidx, dont les AAR demandent compileSdk 37 (targetSdk reste 36).
    id("org.jetbrains.compose") version "1.12.2" apply false
}

// Dossier de sortie au choix : RUNDATA_MOBILE_BUILD=<dossier> y met les sorties de chaque module (<dossier>/<module>).
// Sans lui, Gradle garde ses dossiers build/ habituels.
System.getenv("RUNDATA_MOBILE_BUILD")?.let { sorties ->
    allprojects { layout.buildDirectory = file("$sorties/${if (this == rootProject) "racine" else name}") }
}
