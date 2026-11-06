#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Installs Claude Code and Codex from Open VSX with the build's command line, each at the
# version before Open VSX's newest, updates them, and checks they moved on. Codex's builds come
# as releases and pre-releases, so it is tried on both channels, and installed without a version
# to see which Open VSX gives. Then starts the app with both and checks, from inside the app,
# that each activates and takes a link from vscode.env.openAgentLink without the question.
# Writes what it found to $GITHUB_STEP_SUMMARY when that is set.
#
# Usage: test/smoke/agents.sh <VSCode-darwin-arm64/*.app | VSCode-linux-x64 | VSCode-win32-x64>
# Linux needs a display: xvfb-run -a test/smoke/agents.sh VSCode-linux-x64

set -euo pipefail

CLAUDE="anthropic.claude-code"
CODEX="openai.chatgpt"

. "$( dirname "${BASH_SOURCE[0]}" )/app.sh"

case "$( uname -s )" in
  Darwin) TARGET="darwin-arm64" ;;
  Linux) TARGET="linux-x64" ;;
  *) TARGET="win32-x64" ;;
esac

# versions ID true|false: ID's versions on Open VSX for this platform, pre-releases or releases, newest first, on one line.
versions() {
  curl -fsS --retry 3 "https://open-vsx.org/api/-/query?extensionId=$1&includeAllVersions=true&targetPlatform=${TARGET}" \
    | jq -r --argjson pre "$2" '[.extensions[] | select((.preRelease // false) == $pre)] | sort_by(.timestamp) | reverse | map(.version) | join(" ")' \
    | tr -d '\r'
}

# installed DIR ID: the version of ID installed in DIR.
installed() {
  "${CLI}" "--user-data-dir=${TMP}/user-data" "--extensions-dir=$1" --list-extensions --show-versions \
    | tr -d '\r' | grep -i "^$2@" | cut -d @ -f 2
}

cli() { local dir="$1"; shift; "${CLI}" "--user-data-dir=${TMP}/user-data" "--extensions-dir=${dir}" "$@"; }

SUMMARY=( "### Agent extensions on ${TARGET}" "" "| Extension | Installed | After --update-extensions | Open VSX's newest |" "|---|---|---|---|" )
status=0

# try NAME DIR ID VERSION NEWEST [ARGUMENT...]: installs ID@VERSION in DIR, updates it and checks it moved on.
try() {
  local name="$1" dir="$2" id="$3" version="$4" newest="$5"
  shift 5
  cli "${dir}" --install-extension "${id}@${version}" "$@"
  local before after
  before="$( installed "${dir}" "${id}" )"
  cli "${dir}" --update-extensions
  after="$( installed "${dir}" "${id}" )"
  SUMMARY+=( "| ${name} | ${before} | ${after} | ${newest} |" )
  if [[ "${before}" != "${version}" || "${after}" == "${before}" ]]; then
    echo "::error::${name}: installed ${before} for ${version}, then ${after} after updating"
    status=1
  fi
}

read -r -a claude <<< "$( versions "${CLAUDE}" false )"
read -r -a codex <<< "$( versions "${CODEX}" false )"
read -r -a codex_pre <<< "$( versions "${CODEX}" true )"
echo "Open VSX's newest for ${TARGET}: ${CLAUDE} ${claude[0]}, ${CODEX} ${codex[0]}, pre-release ${codex_pre[0]}"

# The run below uses this folder, with the Codex that a plain install gives.
try "Claude Code" "${TMP}/agents" "${CLAUDE}" "${claude[1]}" "${claude[0]}"
try "Codex, release" "${TMP}/codex" "${CODEX}" "${codex[1]}" "${codex[0]}"
try "Codex, pre-release" "${TMP}/codex-pre" "${CODEX}" "${codex_pre[1]}" "${codex_pre[0]}" --pre-release
cli "${TMP}/agents" --install-extension "${CODEX}"
plain="$( installed "${TMP}/agents" "${CODEX}" )"
SUMMARY+=( "| Codex, without a version | ${plain} | | |" )

if (( status == 0 )); then
  run_tests agents "${TMP}/agents" --enable-proposed-api planish.planish-smoke || status=1
fi
SUMMARY+=( "" "The app with both: $( (( status == 0 )) && echo "each activated and took its link without the question" || echo "failed; see the log" )." )

printf '%s\n' "${SUMMARY[@]}"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf '%s\n' "${SUMMARY[@]}" >> "${GITHUB_STEP_SUMMARY}"
fi
exit "${status}"
