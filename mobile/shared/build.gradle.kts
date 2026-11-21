// Le code commun à l'appli Android et à l'appli iPhone : le client du serveur MCP public de rundata.re, les modèles
// de la journée d'une commune et l'écran principal (Compose Multiplatform).
plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("com.android.kotlin.multiplatform.library")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.compose")
}

val ktor = "3.5.2"

kotlin {
    android {
        namespace = "re.rundata.app.shared"
        compileSdk = 36
        minSdk = 26
        // commonTest et les tests sur des réponses enregistrées tournent sur la JVM (testAndroidHostTest), sans émulateur
        withHostTest { isIncludeAndroidResources = true }
    }
    // L'iPhone et le simulateur : les klibs se compilent sous Linux, le framework se lie sur le Mac (iosApp/).
    listOf(iosArm64(), iosSimulatorArm64()).forEach {
        it.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    jvmToolchain(17)

    sourceSets {
        commonMain.dependencies {
            // Material 3 laissé de côté : sa version multiplateforme est en retard sur Compose 1.11.1 ; l'écran dessine
            // ses propres surfaces avec les couleurs du site.
            api("org.jetbrains.compose.runtime:runtime:1.11.1")
            api("org.jetbrains.compose.foundation:foundation:1.11.1")
            api("org.jetbrains.compose.ui:ui:1.11.1")
            api("io.ktor:ktor-client-core:$ktor")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.12.0")
            api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation("io.ktor:ktor-client-mock:$ktor")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
        }
        androidMain.dependencies {
            implementation("io.ktor:ktor-client-okhttp:$ktor")
        }
        iosMain.dependencies {
            implementation("io.ktor:ktor-client-darwin:$ktor")
        }
        getByName("androidHostTest").dependencies {
            implementation(kotlin("test"))
            implementation("io.ktor:ktor-client-mock:$ktor")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
        }
    }
}
