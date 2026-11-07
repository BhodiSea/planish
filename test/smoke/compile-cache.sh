#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Fails when a build lacks the Node compile cache that VS Code's build packages for the
# platform at the VS Code tag in upstream/stable.json: Windows x64 always, and macOS arm64
# and Linux x64 from VS Code 1.144, which turned them back on. Each of the cache's five
# kinds must hold one folder for the build's architecture, with at least one entry.
#
# Usage: test/smoke/compile-cache.sh <VSCode-darwin-arm64/*.app | VSCode-linux-x64 | VSCode-win32-x64> <arm64 | x64>

set -euo pipefail

APP="$1"
ARCH="$2"
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"

TAG="$( sed -n 's/.*"tag": *"\([^"]*\)".*/\1/p' "${ROOT}/upstream/stable.json" )"
IFS=. read -r MAJOR MINOR _ <<< "${TAG}"

case "$( uname -s )" in
  Darwin) CACHE="${APP}/Contents/Resources/app/node-compile-cache"; FROM=144 ;;
  Linux) CACHE="${APP}/resources/app/node-compile-cache"; FROM=144 ;;
  *) CACHE="${APP}/resources/app/node-compile-cache"; FROM=0 ;;
esac

if (( MAJOR == 1 && MINOR < FROM )); then
  echo "VS Code ${TAG} packages no compile cache on this platform"
  exit 0
fi

status=0
for kind in main extension-host shared-process pty-host agent-host; do
  folders=( "${CACHE}/${kind}"/v*-"${ARCH}"-* )
  if [[ ${#folders[@]} -ne 1 || ! -d "${folders[0]}" ]]; then
    echo "::error::${CACHE}/${kind} does not hold one ${ARCH} folder"
    status=1
  else
    entries="$( find "${folders[0]}" -type f | wc -l | tr -d ' ' )"
    if (( entries == 0 )); then
      echo "::error::${folders[0]} is empty"
      status=1
    else
      echo "${kind}: ${entries} entries"
    fi
  fi
done
exit "${status}"
