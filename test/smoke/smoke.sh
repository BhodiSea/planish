#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Smoke test for a build: installs an extension from Open VSX with the build's
# command line, then starts the app on a folder and checks, from inside the app,
# that the folder is open and the extension is installed and activates.
#
# Usage: test/smoke/smoke.sh <VSCode-darwin-arm64/*.app | VSCode-linux-x64 | VSCode-win32-x64>
# Linux needs a display: xvfb-run -a test/smoke/smoke.sh VSCode-linux-x64

set -euo pipefail

EXTENSION="EditorConfig.EditorConfig"
VERSION="0.18.2"

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
PROFILE=( "--user-data-dir=${TMP}/user-data" "--extensions-dir=${TMP}/extensions" )

"${CLI}" "${PROFILE[@]}" --install-extension "${EXTENSION}@${VERSION}"

SMOKE_WORKSPACE="${TMP}/workspace" SMOKE_EXTENSION="${EXTENSION}" SMOKE_PASSED="${TMP}/passed" VSCODE_CLI=1 ELECTRON_ENABLE_LOGGING=1 \
  "${EXE}" "${TMP}/workspace" "${PROFILE[@]}" \
  "--extensionDevelopmentPath=${HERE}/extension" \
  "--extensionTestsPath=${HERE}/extension/run.js" \
  --disable-telemetry --disable-updates --skip-welcome --skip-release-notes --no-cached-data \
  --disable-workspace-trust --use-inmemory-secretstorage
[[ -f "${TMP}/passed" ]] || { echo "The app exited without running test/smoke/extension/run.js" >&2; exit 1; }
