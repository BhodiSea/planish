#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Checks whether a git runs hooks set in its configuration (git 2.54 and later), set the way
# Planish's session environment would set them, and whether --no-verify skips them.
# Writes a table to $GITHUB_STEP_SUMMARY when that is set.
#
# Usage: githooks.sh <git> <label>

set -euo pipefail

GIT="$1"
LABEL="$2"
WORK="$( mktemp -d )"
trap 'rm -rf "${WORK}"' EXIT

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL='' GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=''
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null

HOOK="${WORK}/hook.sh"
# shellcheck disable=SC2016
printf '#!/bin/sh\necho "$1" >> "%s/ran"\n' "${WORK}" > "${HOOK}"
chmod +x "${HOOK}"

# The session environment's way: configuration passed in the environment, not written to a file.
session() {
  GIT_CONFIG_COUNT=4 \
    GIT_CONFIG_KEY_0=hook.planish-commit.event GIT_CONFIG_VALUE_0=pre-commit \
    GIT_CONFIG_KEY_1=hook.planish-commit.command GIT_CONFIG_VALUE_1="${HOOK} pre-commit" \
    GIT_CONFIG_KEY_2=hook.planish-push.event GIT_CONFIG_VALUE_2=pre-push \
    GIT_CONFIG_KEY_3=hook.planish-push.command GIT_CONFIG_VALUE_3="${HOOK} pre-push" \
    "${GIT}" "$@"
}

ran() { grep -qx "$1" "${WORK}/ran" 2> /dev/null && echo yes || echo no; }
reset() { rm -f "${WORK}/ran"; }

"${GIT}" init -q --bare "${WORK}/remote.git"
"${GIT}" init -q "${WORK}/repo"
cd "${WORK}/repo"
"${GIT}" remote add origin "${WORK}/remote.git"

n=0
commit() { n=$(( n + 1 )); echo "${n}" > file; "${GIT}" add file; session commit -q -m "${n}" "$@"; }

reset; commit; on_commit="$( ran pre-commit )"
reset; commit --no-verify; on_commit_nv="$( ran pre-commit )"
reset; session push -q origin HEAD:refs/heads/a; on_push="$( ran pre-push )"
reset; commit; session push -q --no-verify origin HEAD:refs/heads/b; on_push_nv="$( ran pre-push )"

# The repository's own hook, beside the configured one: do both run?
printf '#!/bin/sh\necho own >> "%s/ran"\n' "${WORK}" > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
reset; commit; both="$( ran pre-commit )/$( ran own )"

# core.hooksPath set by the repository, as tools such as husky do.
"${GIT}" config core.hooksPath .husky
reset; commit; with_hookspath="$( ran pre-commit )"

version="$( "${GIT}" --version )"
table="| ${LABEL} | ${version#git version } | ${on_commit} | ${on_commit_nv} | ${on_push} | ${on_push_nv} | ${both} | ${with_hookspath} |"
echo "${table}"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "${table}" >> "${GITHUB_STEP_SUMMARY}"
fi
