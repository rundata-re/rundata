// L'appli mobile de rundata.re : le code commun à Android et à l'iPhone (shared, Kotlin Multiplatform et Compose
// Multiplatform), l'appli Android (androidApp) et, plus tard, l'hôte iOS (iosApp, construit sur un Mac).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "rundata-mobile"

include(":shared", ":androidApp")
