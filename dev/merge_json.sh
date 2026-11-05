#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Merges each JSON Merge Patch (RFC 7396) in patches/user/json/ into the file at the same
# path in the VS Code tree. Run it from vscode/ after VSCodium's edits, so Planish's win.

set -e

# shellcheck disable=SC2016
MERGE='
def merge($p):
  if ($p | type) == "object" then
    reduce ($p | keys_unsorted[]) as $k (if type == "object" then . else {} end;
      if $p[$k] == null then del(.[$k]) else .[$k] |= merge($p[$k]) end)
  else $p end;
merge($patch[0])'

find ../patches/user/json -name '*.json' -type f 2>/dev/null | sort | while IFS= read -r PATCH; do
  TARGET="${PATCH#../patches/user/json/}"

  if [[ ! -f "${TARGET}" ]]; then
    echo "Not found: ${TARGET}" >&2
    exit 1
  fi

  jq --slurpfile patch "${PATCH}" "${MERGE}" "${TARGET}" > "${TARGET}.tmp"
  mv -f "${TARGET}.tmp" "${TARGET}"
  echo "Merged: ${PATCH} into ${TARGET}"
done
