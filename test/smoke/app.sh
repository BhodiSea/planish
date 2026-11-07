# SPDX-License-Identifier: Apache-2.0
# shellcheck shell=bash disable=SC2034
# Sourced by the tests here, with the build's folder as $1: sets APP, HERE, EXE, CLI and TMP, a
# fresh folder for the test's profile, and defines native, run_tests and drive.

native() { if command -v cygpath > /dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

APP="$( native "$( cd "$1" && pwd )" )"
HERE="$( native "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )" )"

case "$( uname -s )" in
  Darwin) RESOURCES="${APP}/Contents/Resources/app" ;;
  *) RESOURCES="${APP}/resources/app" ;;
esac

NAME_SHORT="$( jq -r .nameShort "${RESOURCES}/product.json" )"
APPLICATION_NAME="$( jq -r .applicationName "${RESOURCES}/product.json" )"

case "$( uname -s )" in
  Darwin) EXE="${APP}/Contents/MacOS/${NAME_SHORT}"; CLI="${RESOURCES}/bin/${APPLICATION_NAME}" ;;
  Linux) EXE="${APP}/${APPLICATION_NAME}"; CLI="${APP}/bin/${APPLICATION_NAME}" ;;
  *) EXE="${APP}/${NAME_SHORT}.exe"; CLI="${APP}/bin/${APPLICATION_NAME}.cmd" ;;
esac

TMP="$( native "$( mktemp -d )" )"
mkdir -p "${TMP}/workspace"

# run_tests MODE EXTENSIONS_DIR [ARGUMENT...]: starts the app on the workspace with
# extension/run.js in MODE, and fails unless run.js passed.
run_tests() {
  local mode="$1" extensions="$2"
  shift 2
  rm -f "${TMP}/passed"
  SMOKE_MODE="${mode}" SMOKE_WORKSPACE="${TMP}/workspace" SMOKE_USER_DATA="${TMP}/user-data" SMOKE_PASSED="${TMP}/passed" VSCODE_CLI=1 ELECTRON_ENABLE_LOGGING=1 \
    "${EXE}" "${TMP}/workspace" "--user-data-dir=${TMP}/user-data" "--extensions-dir=${extensions}" \
    "--extensionDevelopmentPath=${HERE}/extension" \
    "--extensionTestsPath=${HERE}/extension/run.js" \
    --disable-telemetry --disable-updates --skip-welcome --skip-release-notes --no-cached-data \
    --disable-workspace-trust --use-inmemory-secretstorage "$@"
  [[ -f "${TMP}/passed" ]] || { echo "The app exited without running test/smoke/extension/run.js" >&2; return 1; }
}

# drive MODE [ARGUMENT...]: starts the app on the workspace with the test extension, which runs
# MODE from extension/run.js and quits the app as a user would, and fails unless MODE passed. For
# tests that need the app's stored state, which the test runner keeps in memory.
drive() {
  rm -f "${TMP}/passed"
  SMOKE_DRIVE="$1" SMOKE_WORKSPACE="${TMP}/workspace" SMOKE_USER_DATA="${TMP}/user-data" SMOKE_PASSED="${TMP}/passed" \
    VSCODE_CLI=1 ELECTRON_ENABLE_LOGGING=1 \
    "${EXE}" "${TMP}/workspace" "--user-data-dir=${TMP}/user-data" "--extensions-dir=${TMP}/extensions" \
    "--extensionDevelopmentPath=${HERE}/extension" --disable-telemetry --disable-updates --no-cached-data \
    --disable-workspace-trust --use-inmemory-secretstorage "${@:2}" || true
  [[ -f "${TMP}/passed" ]] || { echo "The app quit before test/smoke/extension/run.js's $1 passed" >&2; return 1; }
}
