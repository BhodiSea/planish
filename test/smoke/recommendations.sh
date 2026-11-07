#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Opens a Python, a C++ and a C# file in a build, started as a user starts it, and checks that it
# recommends the open stand-ins product.json's extensionRecommendations name for each language,
# and installs none of them. VS Code makes no recommendations while an extension is under test,
# so the app runs without the test extension, and is stopped once it has stored them.
#
# Usage: test/smoke/recommendations.sh <VSCode-darwin-arm64/*.app | VSCode-linux-x64 | VSCode-win32-x64>
# Linux needs a display: xvfb-run -a test/smoke/recommendations.sh VSCode-linux-x64

set -euo pipefail

STATE="$( dirname "${BASH_SOURCE[0]}" )/state.py"

# shellcheck source=test/smoke/app.sh
. "$( dirname "${BASH_SOURCE[0]}" )/app.sh"

KEY="extensionsAssistant/recommendations"
DB="${TMP}/user-data/User/globalStorage/state.vscdb"

recommended() {
  [[ -f "${DB}" ]] && python3 -I "${STATE}" get "${DB}" "${KEY}" | jq -r --arg key "${KEY}" '.[$key] // "{}" | fromjson | keys[]'
}

status=0
for sample in python:sample.py:'print(1)' cpp:sample.cpp:'int main() {}' csharp:sample.cs:'class A {}'; do
  IFS=: read -r language file content <<< "${sample}"
  echo "${content}" > "${TMP}/workspace/${file}"
  read -r -a expected <<< "$( jq -r --arg language "${language}" \
    '[.extensionRecommendations | to_entries[] | select(any(.value.onFileOpen[]; .languages | index($language))) | .key] | join(" ")' "${RESOURCES}/product.json" )"
  if [[ ${#expected[@]} -eq 0 ]]; then
    echo "::error::product.json recommends nothing for ${language}"
    exit 1
  fi

  "${EXE}" "${TMP}/workspace" "${TMP}/workspace/${file}" "--user-data-dir=${TMP}/user-data" "--extensions-dir=${TMP}/extensions" \
    --disable-telemetry --disable-updates --skip-welcome --skip-release-notes --disable-workspace-trust > "${TMP}/${language}.log" 2>&1 &
  pid=$!
  missing=("${expected[@]}")
  for (( seconds = 0; seconds < 120 && ${#missing[@]}; seconds++ )); do
    sleep 1
    found="$( recommended || true )"
    missing=()
    for id in "${expected[@]}"; do
      grep -qixF "${id}" <<< "${found}" || missing+=("${id}")
    done
  done
  kill "${pid}" 2> /dev/null || true
  for (( seconds = 0; seconds < 20; seconds++ )); do
    kill -0 "${pid}" 2> /dev/null || break
    sleep 1
  done
  kill -9 "${pid}" 2> /dev/null || true
  wait "${pid}" 2> /dev/null || true
  sleep 2

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "::error::Opening ${file} did not recommend ${missing[*]}"
    status=1
  else
    echo "Opening ${file} recommended ${expected[*]}"
  fi
done

if [[ -d "${TMP}/extensions" ]] && find "${TMP}/extensions" -mindepth 1 -maxdepth 1 -type d | grep -q .; then
  echo "::error::Recommending installed: $( ls "${TMP}/extensions" )"
  status=1
fi
exit "${status}"
