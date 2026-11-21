# L'appli mobile de rundata.re

La journée d'une commune de La Réunion, d'après le serveur MCP public de rundata.re (`POST https://rundata.re/mcp` : `resume_du_jour`, `vigilance_meteo`, `meteo_actuelle`), sa seule source.

- `shared/` : le code commun à Android et à l'iPhone (Kotlin Multiplatform). Il contient le client MCP, la journée d'une commune et l'écran principal (Compose Multiplatform).
- `iosApp/` : l'hôte SwiftUI de l'écran commun. Son projet Xcode est produit et construit sur un Mac (XcodeGen, `project.yml`).

## Construire

`tools/build.sh` lance Gradle sous plafond mémoire, avec 2 cœurs réservés par `cpu-run`. Les sorties et les caches vont dans `~/.cache/rundata-mobile/`, jamais dans le dépôt. Le code de sortie 75 veut dire que rien n'a été construit.

```
mobile/tools/build.sh :shared:testAndroidHostTest :shared:compileKotlinIosArm64 :shared:compileKotlinIosSimulatorArm64
```

Sous Linux, les klibs iOS se compilent ; le framework se lie sur le Mac.

## Tests

Les tests du code commun lisent des réponses réelles du serveur MCP, enregistrées dans `shared/src/androidHostTest/resources/mcp/`.
