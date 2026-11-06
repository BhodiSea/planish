#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Smoke test for a build: installs an extension from Open VSX with the build's
# command line, then starts the app on a folder and checks, from inside the app,
# that the folder is open, the extension is installed and activates, and the test
# extension cannot open agents' links without the question.
#
# Usage: test/smoke/smoke.sh <VSCode-darwin-arm64/*.app | VSCode-linux-x64 | VSCode-win32-x64>
# Linux needs a display: xvfb-run -a test/smoke/smoke.sh VSCode-linux-x64

set -euo pipefail

EXTENSION="EditorConfig.EditorConfig"
VERSION="0.18.2"

. "$( dirname "${BASH_SOURCE[0]}" )/app.sh"

"${CLI}" "--user-data-dir=${TMP}/user-data" "--extensions-dir=${TMP}/extensions" --install-extension "${EXTENSION}@${VERSION}"

SMOKE_EXTENSION="${EXTENSION}" run_tests smoke "${TMP}/extensions"
