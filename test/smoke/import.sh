#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# The scripted first run: installs VS Code, Cursor and Antigravity with Homebrew and gives each a
# sample setup. Each editor creates a profile, Sample, as it opens a window with it, and installs
# an extension in each profile with its command line; this script then writes settings, a keyboard
# shortcut and a snippet into the folders the editor made. For each editor, Planish starts with a
# fresh profile and imports that setup as a user would, accepting the list as offered, and run.js
# checks that it came over and that the report lists what did not. The publishers of the sample
# extensions are trusted beforehand, as the question about them cannot be answered in a test.
# Writes the folders found and the reports to $GITHUB_STEP_SUMMARY when that is set.
#
# Usage: test/smoke/import.sh <VSCode-darwin-arm64/*.app>, on macOS

set -euo pipefail

STATE="$( dirname "${BASH_SOURCE[0]}" )/state.py"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

# shellcheck source=test/smoke/app.sh
. "$( dirname "${BASH_SOURCE[0]}" )/app.sh"

# id:cask:app name
EDITORS=(vscode:visual-studio-code:"Visual Studio Code" cursor:cursor:Cursor antigravity:antigravity:Antigravity)
TRUSTED='{"editorconfig": {"publisher": "EditorConfig", "publisherDisplayName": "EditorConfig"},
  "redhat": {"publisher": "redhat", "publisherDisplayName": "Red Hat"},
  "ms-python": {"publisher": "ms-python", "publisherDisplayName": "Microsoft"}}'

SETTINGS='{
  "editor.fontSize": 15,
  "files.autoSave": "afterDelay"
}
'
KEYBINDINGS='[
  { "key": "ctrl+alt+shift+f11", "command": "workbench.action.toggleZenMode" }
]
'
SNIPPETS='{ "Sample": { "prefix": "sample", "body": "sample" } }
'
PROFILE_SETTINGS='{ "editor.tabSize": 3 }
'

stop() {
  kill "$1" 2> /dev/null || true
  for (( seconds = 0; seconds < 20; seconds++ )); do
    kill -0 "$1" 2> /dev/null || break
    sleep 1
  done
  kill -9 "$1" 2> /dev/null || true
  wait "$1" 2> /dev/null || true
}

# sample ID APP_NAME: gives the editor its sample setup, and writes what run.js checks to $TMP/ID.json.
sample() {
  local id="$1" app="/Applications/$2.app"
  local resources="${app}/Contents/Resources/app"
  local cli exe marker="${TMP}/${id}.marker" storage="" user location extensions
  cli="${resources}/bin/$( jq -r .applicationName "${resources}/product.json" )"
  exe="${app}/Contents/MacOS/$( /usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${app}/Contents/Info.plist" )"
  xattr -dr com.apple.quarantine "${app}" 2> /dev/null || true
  echo "$2 $( jq -r .version "${resources}/product.json" )"
  touch "${marker}"
  sleep 1

  mkdir -p "${TMP}/${id}-folder"
  "${exe}" --profile Sample --new-window "${TMP}/${id}-folder" > "${TMP}/${id}-window.log" 2>&1 &
  local pid=$!
  for (( seconds = 0; seconds < 120; seconds++ )); do
    sleep 1
    storage="$( find "${HOME}/Library/Application Support" -path '*/User/globalStorage/storage.json' -newer "${marker}" 2> /dev/null | head -n 1 )"
    if [[ -n "${storage}" ]] && jq -e '.userDataProfiles[]? | select(.name == "Sample")' "${storage}" > /dev/null; then
      break
    fi
    storage=""
  done
  stop "${pid}"
  pkill -f "${app}/Contents/" 2> /dev/null || true
  sleep 3
  if [[ -z "${storage}" ]]; then
    cat "${TMP}/${id}-window.log"
    echo "::error::$2 made no profile Sample in a storage.json under ~/Library/Application Support"
    return 1
  fi
  user="$( dirname "$( dirname "${storage}" )" )"
  location="$( jq -r '.userDataProfiles[] | select(.name == "Sample") | .location' "${storage}" )"

  "${cli}" --install-extension EditorConfig.EditorConfig
  "${cli}" --profile Sample --install-extension redhat.vscode-yaml
  if [[ "${id}" == vscode ]]; then
    "${cli}" --install-extension ms-python.vscode-pylance
  fi
  extensions="$( find "${HOME}" -maxdepth 3 -path "${HOME}/.*/extensions/extensions.json" -newer "${marker}" | head -n 1 )"

  printf '%s' "${SETTINGS}" > "${user}/settings.json"
  printf '%s' "${KEYBINDINGS}" > "${user}/keybindings.json"
  mkdir -p "${user}/snippets" "${user}/profiles/${location}"
  printf '%s' "${SNIPPETS}" > "${user}/snippets/sample.code-snippets"
  printf '%s' "${PROFILE_SETTINGS}" > "${user}/profiles/${location}/settings.json"

  local reported='[]'
  if [[ "${id}" == vscode ]]; then
    reported='["- ms-python.vscode-pylance: Pylance is licensed only for Microsoft'"'"'s products. Open stand-in: "]'
  fi
  jq -n --arg settings "${SETTINGS}" --arg keybindings "${KEYBINDINGS}" --arg snippets "${SNIPPETS}" \
    --arg profileSettings "${PROFILE_SETTINGS}" --argjson reported "${reported}" \
    '{ $settings, $keybindings, $snippets, extension: "EditorConfig.EditorConfig",
       profile: "Sample", $profileSettings, profileExtension: "redhat.vscode-yaml", $reported }' > "${TMP}/${id}.json"

  {
    echo "### $2 $( jq -r .version "${resources}/product.json" )"
    echo
    echo "- User folder: \`${user/#"${HOME}"/~}\`"
    echo "- Extensions folder: \`$( dirname "${extensions/#"${HOME}"/~}" )\`"
    echo "- Profile Sample: \`profiles/${location}\`, listed in \`globalStorage/storage.json\`"
    echo
  } >> "${SUMMARY}"
}

# --force: a runner image may hold one of them already.
HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask --force visual-studio-code cursor antigravity

echo "## Importing from other editors" >> "${SUMMARY}"
status=0
for editor in "${EDITORS[@]}"; do
  IFS=: read -r id _ name <<< "${editor}"
  sample "${id}" "${name}"
done

for editor in "${EDITORS[@]}"; do
  IFS=: read -r id _ name <<< "${editor}"
  rm -rf "${TMP}/user-data" "${TMP}/extensions"
  mkdir -p "${TMP}/user-data/User/globalStorage"
  python3 -I "${STATE}" set "${TMP}/user-data/User/globalStorage/state.vscdb" extensions.trustedPublishers "${TRUSTED}"
  if SMOKE_IMPORT="${id}" SMOKE_SAMPLE="${TMP}/${id}.json" SMOKE_OUT="${TMP}/${id}.md" run_tests import "${TMP}/extensions"; then
    echo "Planish imported ${name}'s setup"
  else
    echo "::error::Importing ${name}'s setup failed"
    status=1
  fi
  {
    echo "### Planish's report for ${name}"
    echo
    sed 's/^#/###/' "${TMP}/${id}.md" 2> /dev/null || echo "No report."
    echo
  } >> "${SUMMARY}"
done
exit "${status}"
