# SPDX-License-Identifier: Apache-2.0
# shellcheck shell=bash disable=SC2034
# Sourced by the tests here, with the build's folder as $1: sets APP, HERE, EXE, CLI and TMP, a
# fresh folder for the test's profile, and defines native.

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
# extension/run.js in MODE, and fails unless run.js passed. With FIRST_SCREENS set, the app may
# show its welcome page and release notes, as after an update.
run_tests() {
  local mode="$1" extensions="$2" skips=(--skip-welcome --skip-release-notes)
  shift 2
  [[ -z "${FIRST_SCREENS:-}" ]] || skips=()
  rm -f "${TMP}/passed"
  SMOKE_MODE="${mode}" SMOKE_WORKSPACE="${TMP}/workspace" SMOKE_USER_DATA="${TMP}/user-data" SMOKE_PASSED="${TMP}/passed" VSCODE_CLI=1 ELECTRON_ENABLE_LOGGING=1 \
    "${EXE}" "${TMP}/workspace" "--user-data-dir=${TMP}/user-data" "--extensions-dir=${extensions}" \
    "--extensionDevelopmentPath=${HERE}/extension" \
    "--extensionTestsPath=${HERE}/extension/run.js" \
    --disable-telemetry --disable-updates ${skips[@]+"${skips[@]}"} --no-cached-data \
    --disable-workspace-trust --use-inmemory-secretstorage "$@"
  [[ -f "${TMP}/passed" ]] || { echo "The app exited without running test/smoke/extension/run.js" >&2; return 1; }
}
