#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Prepares vscode/ once, as a build does, then links Planish's folders in src/stable/ into it,
# so that edits there reach VS Code's watch build. Run it again after adding or removing a file.
# For macOS and Linux; CONTRIBUTING.md has the loop.
#
# Usage: dev/link.sh [-f]    (-f prepares vscode/ again)

# shellcheck disable=SC1091
set -euo pipefail

cd "$( dirname "${BASH_SOURCE[0]}" )/.."
ROOT="${PWD}"

if [[ "${1:-}" == "-f" ]]; then
  rm -rf vscode
fi

if [[ ! -d vscode/node_modules ]]; then
  rm -rf vscode

  export CI_BUILD="${CI_BUILD:-no}"
  export MAX_OLD_SPACE_SIZE="${MAX_OLD_SPACE_SIZE:-8192}"
  export VSCODE_QUALITY="stable"
  case "${OSTYPE}" in
    darwin*) export OS_NAME="osx" ;;
    *) export OS_NAME="linux" ;;
  esac

  # VSCodium's scripts are written for set -e alone.
  set +uo pipefail
  . get_repo.sh
  . version.sh
  . prepare_vscode.sh
  { set +x; } 2>/dev/null
  set -uo pipefail
fi

# A built-in extension's folder is linked whole: the extension host loads an extension from
# its folder's real path, so its modules load from the repository.
for dir in src/stable/extensions/planish-*/; do
  [[ -d "${dir}" ]] || continue
  target="vscode/${dir#src/stable/}"
  rm -rf "${target%/}"
  ln -s "${ROOT}/${dir%/}" "${target%/}"
  echo "linked ${target%/}"
done

# Workbench parts are linked file by file: VS Code's transpile lists files with glob 7,
# which does not look inside a linked folder's subfolders.
for dir in src/stable/src/vs/workbench/contrib/planish*/; do
  [[ -d "${dir}" ]] || continue
  rm -rf "vscode/${dir#src/stable/}"
  while IFS= read -r -d '' file; do
    target="vscode/${file#src/stable/}"
    mkdir -p "$( dirname "${target}" )"
    ln -s "${ROOT}/${file}" "${target}"
  done < <( find "${dir%/}" -type f -print0 )
  echo "linked the files of vscode/${dir#src/stable/}"
done
