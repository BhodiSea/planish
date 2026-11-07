#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# The update test: lays a window out unlike the default, with a keyboard shortcut of the user's,
# quits, then starts an update of the build on the same folder, allowed its welcome page and
# release notes, and checks that the editors, the parts shown and where, the views and the
# user's files are as they were. The update is a copy of the build with a higher version and
# another commit, until there is an earlier release to start from.
#
# Usage: test/smoke/layout.sh <VSCode-darwin-arm64/*.app | VSCode-linux-x64 | VSCode-win32-x64>
# Linux needs a display: xvfb-run -a test/smoke/layout.sh VSCode-linux-x64

set -euo pipefail

STATE="$( dirname "${BASH_SOURCE[0]}" )/state.py"

# shellcheck source=test/smoke/app.sh
. "$( dirname "${BASH_SOURCE[0]}" )/app.sh"

# What says where the parts and views are: the workspace's layout and the profile's views.
WORKSPACE_KEYS=(workbench.sideBar.hidden workbench.sideBar.position workbench.panel.hidden workbench.panel.position
  workbench.auxiliaryBar.hidden workbench.activityBar.hidden workbench.statusBar.hidden workbench.editor.hidden
  workbench.zenMode.active workbench.editor.centered workbench.sidebar.activeviewletid workbench.panelpart.activepanelid)
PROFILE_KEYS=(views.customizations workbench.activity.pinnedViewlets2 workbench.panel.pinnedPanels workbench.panel.alignment)

snapshot() {
  local workspace
  workspace="$( ls "${TMP}"/user-data/User/workspaceStorage/*/state.vscdb )"
  python3 -I "${STATE}" get "${workspace}" "${WORKSPACE_KEYS[@]}"
  python3 -I "${STATE}" get "${TMP}/user-data/User/globalStorage/state.vscdb" "${PROFILE_KEYS[@]}"
  for file in settings.json keybindings.json; do
    echo "${file}:"
    cat "${TMP}/user-data/User/${file}"
  done
}

echo a > "${TMP}/workspace/a.txt"
echo b > "${TMP}/workspace/b.txt"
mkdir -p "${TMP}/user-data/User"
echo '[{ "key": "ctrl+alt+shift+f12", "command": "workbench.action.togglePanel" }]' > "${TMP}/user-data/User/keybindings.json"

# Each run passes once run.js has passed: the app quits as a user would, and its exit code is not the test's.
SMOKE_OUT="${TMP}/editors.json" run_tests layout "${TMP}/extensions" || exit 1
snapshot > "${TMP}/before.txt"
for laid in '"workbench.panel.hidden": "false"' '"workbench.sidebar.activeviewletid": "workbench.view.search"'; do
  if ! grep -qF "${laid}" "${TMP}/before.txt"; then
    cat "${TMP}/before.txt"
    echo "The window was not laid out unlike the default: no ${laid}" >&2
    exit 1
  fi
done

UPDATE="${TMP}/update"
mkdir -p "${UPDATE}"
cp -R "${APP}" "${UPDATE}/"
UPDATED="$( native "${UPDATE}/$( basename "${APP}" )" )"
case "$( uname -s )" in
  Darwin) PRODUCT="${UPDATED}/Contents/Resources/app/product.json"; EXE="${UPDATED}/Contents/MacOS/${NAME_SHORT}" ;;
  Linux) PRODUCT="${UPDATED}/resources/app/product.json"; EXE="${UPDATED}/${APPLICATION_NAME}" ;;
  *) PRODUCT="${UPDATED}/resources/app/product.json"; EXE="${UPDATED}/${NAME_SHORT}.exe" ;;
esac
jq '.version |= (split(".") | .[2] = ((.[2] | tonumber) + 1 | tostring) | join(".")) | .commit = ("0" * 40)' "${PRODUCT}" > "${TMP}/product.json"
mv "${TMP}/product.json" "${PRODUCT}"
echo "Updating to $( jq -r .version "${PRODUCT}" )"

SMOKE_OUT="${TMP}/editors.json" FIRST_SCREENS=1 run_tests update "${TMP}/extensions" || exit 1
snapshot > "${TMP}/after.txt"
cat "${TMP}/after.txt"
diff "${TMP}/before.txt" "${TMP}/after.txt" || { echo "The update changed the layout or the user's files" >&2; exit 1; }
echo "The layout and the user's files survived the update"
