#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Makes edits of each kind in the app and records, from inside it, the source that the
# textDocumentChangeReason proposal reports for each (issue #32), including edits from an
# extension allowed planishEditSource and from one that is not. Fails on any label other than
# the one expected. Writes the table to $GITHUB_STEP_SUMMARY when that is set.
#
# Usage: test/smoke/edits.sh <VSCode-darwin-arm64/*.app | VSCode-linux-x64 | VSCode-win32-x64>
# Linux needs a display: xvfb-run -a test/smoke/edits.sh VSCode-linux-x64

set -euo pipefail

. "$( dirname "${BASH_SOURCE[0]}" )/app.sh"

status=0
SMOKE_RESULTS="${TMP}/edits.md" run_tests edits "${TMP}/extensions" \
  "--extensionDevelopmentPath=${HERE}/other" --enable-proposed-api planish.planish-smoke || status=1

if [[ -n "${GITHUB_STEP_SUMMARY:-}" && -f "${TMP}/edits.md" ]]; then
  { echo "### Edit sources on ${1%%/*}"; echo; cat "${TMP}/edits.md"; } >> "${GITHUB_STEP_SUMMARY}"
fi
exit "${status}"
