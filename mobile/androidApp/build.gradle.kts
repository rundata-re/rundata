// L'appli Android de rundata.re : l'écran commun (shared) dans une activité, et le widget d'écran d'accueil.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "re.rundata.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "re.rundata.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "0.1.2"
    }

    buildFeatures { buildConfig = true }

    // La version release : réduite par R8 (code et ressources), signée avec la clé de debug tant qu'il n'y a pas de
    // compte de store.
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("debug")
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
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:2.4.21")
}
