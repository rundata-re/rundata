#!/usr/bin/env bash
# Construit l'appli mobile de rundata.re, sous plafond mémoire et avec 2 cœurs réservés (cpu-run).
# Usage : mobile/tools/build.sh [tâches gradle…]   (par défaut : :shared:testAndroidHostTest)
# Validation complète : mobile/tools/build.sh :shared:testAndroidHostTest :shared:compileKotlinIosArm64 \
#   :shared:compileKotlinIosSimulatorArm64
# Sorties, caches Gradle, dossier Kotlin et compilateurs Kotlin/Native : ~/.cache/rundata-mobile/, jamais dans le
# dépôt ; un dossier de sorties par worktree. Code de sortie 75 : rien n'a été construit (attente de mémoire ou de
# cœurs trop longue).
set -euo pipefail
cd "$(dirname "$0")/.."
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/sdk}"
cache="$HOME/.cache/rundata-mobile"
arbre=$(basename "$(git rev-parse --show-toplevel)")
export RUNDATA_MOBILE_BUILD="$cache/build-$arbre"
export KONAN_DATA_DIR="$cache/konan"
mkdir -p "$cache"
# Mémoire : Gradle plafonné à RUNDATA_MOBILE_GRADLE_MAX_MB (6 Go) ; il ne démarre qu'avec 8 Go disponibles et 3 Go
# d'échange libres, attendus 30 min au plus.
cap_mb=${RUNDATA_MOBILE_GRADLE_MAX_MB:-6144}
min_mb=${RUNDATA_MOBILE_MIN_AVAIL_MB:-8192}
mem_ok() { awk -v m="$min_mb" '/MemAvailable/ {a=$2} /SwapFree/ {s=$2} END {exit !(a/1024 >= m && s/1024 >= 3072)}' /proc/meminfo; }
for _ in $(seq 60); do
    if mem_ok; then break; fi
    echo "build.sh : attente de ${min_mb} Mo disponibles et 3072 Mo d'échange libres…" >&2
    sleep 30
done
if ! mem_ok; then echo "build.sh : mémoire insuffisante après 30 min, rien construit" >&2; exit 75; fi
# Une construction à la fois pour ce dépôt ; cpu-run réserve 2 cœurs (75 : rien lancé) ; la portée interne répète le
# plafond CPU, et un poids faible laisse passer Frigate.
exec flock "$cache/build.lock" cpu-run 2 -- systemd-run --user --scope --unit="rundata-mobile-gradle-$$" --quiet \
    -p MemoryMax=${cap_mb}M -p MemorySwapMax=512M -p CPUQuota=200% -p CPUWeight=20 \
    nice -n 10 ./gradlew --no-daemon --max-workers=2 --project-cache-dir "$cache/gradle-projet-$arbre" \
    -Pkotlin.project.persistent.dir="$cache/kotlin-$arbre" "${@:-:shared:testAndroidHostTest}"
