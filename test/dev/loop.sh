#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Test of the development loop in CONTRIBUTING.md. Adds a probe workbench part and a probe
# built-in extension to src/stable/, links them with dev/link.sh, runs VS Code's watch
# transpile, edits both and checks that out/ follows the part's edit, then starts the app
# from source and checks, from inside it, that the extension loads from the repository with
# its edit. Leaves the probes in src/stable/; CI's checkout is thrown away.
#
# Usage: test/dev/loop.sh    (Linux needs a display: xvfb-run -a test/dev/loop.sh)

set -euo pipefail

cd "$( dirname "${BASH_SOURCE[0]}" )/../.."
ROOT="${PWD}"
HERE="${ROOT}/test/dev"

PART="src/vs/workbench/contrib/planish/browser/loopProbe.ts"
EXTENSION="extensions/planish-loop-probe"

mkdir -p "$( dirname "src/stable/${PART}" )" "src/stable/${EXTENSION}"
echo "export const loopProbe = 'before';" > "src/stable/${PART}"
cat > "src/stable/${EXTENSION}/package.json" <<'JSON'
{
  "name": "planish-loop-probe",
  "publisher": "planish",
  "version": "0.0.0",
  "engines": { "vscode": "^1.100.0" },
  "main": "./main.js"
}
JSON
echo "exports.activate = () => ({ value: 'before' });" > "src/stable/${EXTENSION}/main.js"

./dev/link.sh

# Waits up to $2 seconds for $1 to succeed.
wait_for() {
  for (( i = 0; i < $2; i++ )); do
    if eval "$1"; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for: $1" >&2
  return 1
}

OUT="vscode/out/${PART#src/}"
OUT="${OUT%.ts}.js"
( cd vscode && exec npm run watch-client-transpile ) > watch.log 2>&1 &
WATCH=$!
trap 'kill "${WATCH}" 2> /dev/null || true; tail -n 40 watch.log' EXIT
wait_for 'grep -q "Finished transpilation" watch.log' 900
wait_for "grep -qs before '${OUT}'" 30

sed -i.bak 's/before/after/' "src/stable/${PART}" "src/stable/${EXTENSION}/main.js"
wait_for "grep -qs after '${OUT}'" 60
echo "watch transpiled the edit to ${OUT}"
kill "${WATCH}"

TMP="$( mktemp -d )"
mkdir -p "${TMP}/workspace"
LOOP_EXTENSION="planish.planish-loop-probe" LOOP_PATH="${ROOT}/src/stable/${EXTENSION}" LOOP_PASSED="${TMP}/passed" \
  ./vscode/scripts/code.sh "${TMP}/workspace" \
  "--user-data-dir=${TMP}/user-data" "--extensions-dir=${TMP}/extensions" \
  "--extensionDevelopmentPath=${HERE}/extension" \
  "--extensionTestsPath=${HERE}/extension/run.js" \
  --disable-telemetry --disable-updates --skip-welcome --skip-release-notes --no-cached-data \
  --disable-workspace-trust --use-inmemory-secretstorage
[[ -f "${TMP}/passed" ]] || { echo "The app exited without running test/dev/extension/run.js" >&2; exit 1; }
