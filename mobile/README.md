# L'appli mobile de rundata.re

La journée d'une commune de La Réunion, et un widget d'écran d'accueil avec la température mesurée et la vigilance de sa zone. Les données viennent uniquement du serveur MCP public de rundata.re (`POST https://rundata.re/mcp`, outils `resume_du_jour`, `vigilance_meteo` et `meteo_actuelle`).

Côté serveur (`src/appli.ts`), les appels de l'appli se reconnaissent à son User-Agent, `rundata.re-android/<version>` (et `… widget` pour le widget). Leur réponse est gardée 5 minutes par outil et par lieu dans le cache de Cloudflare, et les statistiques n'en gardent ni le lieu, ni la commune, ni le pays : seulement « appli » ou « widget » et la version. Un outil que l'appli se met à lire s'ajoute à `APP_TOOLS`.

- `shared/` : le code commun à Android et à l'iPhone (Kotlin Multiplatform). Il contient le client MCP, la journée d'une commune et l'écran principal (Compose Multiplatform).
- `androidApp/` : l'appli Android et son widget (Jetpack Glance, mis à jour toutes les 30 min par WorkManager).
- `iosApp/` : l'hôte SwiftUI de l'écran commun. Son projet Xcode est produit et construit sur un Mac (XcodeGen, `project.yml`).

## Construire

Avec Gradle, depuis `mobile/` (JDK 17, SDK Android dans `ANDROID_HOME`) :

```
./gradlew --max-workers=2 :shared:testAndroidHostTest :shared:compileKotlinIosArm64 \
  :shared:compileKotlinIosSimulatorArm64 :androidApp:testDebugUnitTest :androidApp:assembleRelease :androidApp:lintRelease
```

`--max-workers` fixe le nombre de tâches en parallèle. `RUNDATA_MOBILE_BUILD=<dossier>` met les sorties hors du dépôt, un sous-dossier par module ; sans lui, elles vont dans les `build/` habituels (ignorés par git).

L'APK de release est signé avec la clé de debug tant qu'il n'y a pas de compte de store : `androidApp/outputs/apk/release/androidApp-release.apk`, dans le dossier de sortie de `androidApp`.

Sous Linux, les klibs iOS se compilent ; le framework se lie sur le Mac.

## Tests

Les tests du code commun lisent des réponses réelles du serveur MCP, enregistrées dans `shared/src/androidHostTest/resources/mcp/`.
