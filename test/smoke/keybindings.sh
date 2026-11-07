#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Writes out the default keyboard shortcuts of a build, as the app lists them, for
# keybindings.mjs to compare with another build's.
#
# Usage: test/smoke/keybindings.sh <VSCode-darwin-arm64/*.app | VSCode-linux-x64 | VSCode-win32-x64> OUT

set -euo pipefail

OUT="$( cd "$( dirname "$2" )" && pwd )/$( basename "$2" )"

# shellcheck source=test/smoke/app.sh
. "$( dirname "${BASH_SOURCE[0]}" )/app.sh"

SMOKE_OUT="${OUT}" run_tests keybindings "${TMP}/extensions"
