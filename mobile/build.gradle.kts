// Les versions des greffons, une seule fois ici. Déclarer le greffon Kotlin met la version 2.4.21 sur le classpath :
// le Kotlin intégré d'AGP 9.4.1 compile alors l'appli avec elle aussi.
plugins {
    id("com.android.application") version "9.4.1" apply false
    id("com.android.kotlin.multiplatform.library") version "9.4.1" apply false
    id("org.jetbrains.kotlin.multiplatform") version "2.4.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.21" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.4.21" apply false
    // 1.11.1, pas 1.12 : 1.12 tire Compose 1.12 d'androidx, dont les AAR demandent compileSdk 37.
    id("org.jetbrains.compose") version "1.11.1" apply false
}

// Les sorties de construction hors du dépôt : ~/.cache/rundata-mobile/build/<module> (tools/build.sh fixe
// RUNDATA_MOBILE_BUILD, un dossier par worktree).
val sorties = System.getenv("RUNDATA_MOBILE_BUILD") ?: "${System.getProperty("user.home")}/.cache/rundata-mobile/build"
allprojects {
    layout.buildDirectory = file("$sorties/${if (this == rootProject) "racine" else name}")
}
