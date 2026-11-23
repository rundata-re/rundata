// L'appli Android de rundata.re : l'écran commun (shared) dans une activité, et le widget d'écran d'accueil.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// La clé définitive de l'appli, hors du dépôt : son fichier (PKCS12) et son mot de passe, donnés au moment de construire.
// Sans eux, la version release est signée avec la clé de debug, et ne s'installe pas par-dessus une version publiée.
val cle: String? = System.getenv("RUNDATA_ANDROID_CLE")
val cleMotDePasse: String? = System.getenv("RUNDATA_ANDROID_CLE_MDP")

android {
    namespace = "re.rundata.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "re.rundata.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 5
        versionName = "0.3.0"
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        if (cle != null && cleMotDePasse != null) {
            create("definitive") {
                storeFile = file(cle)
                storeType = "pkcs12"
                storePassword = cleMotDePasse
                keyAlias = "rundata"
                keyPassword = cleMotDePasse
            }
        }
    }

    // La version release : réduite par R8 (code et ressources), signée avec la clé définitive (depuis 0.2.0).
    buildTypes {
        // La version d'essai, pour les captures : à côté de la vraie (autre identifiant), elle sait simuler une alerte
        // (src/debug/Simulation.kt). Jamais publiée.
        debug {
            applicationIdSuffix = ".essai"
            versionNameSuffix = "-essai"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("definitive") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
    }
}

dependencies {
    implementation(project(":shared"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.core:core-ktx:1.17.0")
    // Les pages du site dans un onglet du navigateur (Custom Tabs)
    implementation("androidx.browser:browser:1.10.0")
    // Le widget (Jetpack Glance) et sa mise à jour toutes les 30 min
    implementation("androidx.glance:glance-appwidget:1.2.0")
    implementation("androidx.work:work-runtime-ktx:2.11.2")
    // Ce que le widget garde de chaque commune, en JSON
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.12.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:2.4.21")
}
