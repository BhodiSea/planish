#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Smoke test for a build: installs an extension from Open VSX with the build's
# command line, then starts the app on a folder and checks, from inside the app,
# that the folder is open, the extension is installed and activates, the test
# extension cannot open agents' links without the question, and the validator
# of the built-in extension planish-learn passes test/learn/lesson.json. It also checks the
# defaults of planish-large-repos: a profile has them, a user's setting overrides them, the watcher
# skips what they exclude, and TypeScript still sees packages installed, reinstalled or removed.
#
# Usage: test/smoke/smoke.sh <VSCode-darwin-arm64/*.app | VSCode-linux-x64 | VSCode-win32-x64>
# Linux needs a display: xvfb-run -a test/smoke/smoke.sh VSCode-linux-x64

set -euo pipefail

EXTENSION="EditorConfig.EditorConfig"
VERSION="0.18.2"

# shellcheck source=test/smoke/app.sh
. "$( dirname "${BASH_SOURCE[0]}" )/app.sh"

"${CLI}" "--user-data-dir=${TMP}/user-data" "--extensions-dir=${TMP}/extensions" --install-extension "${EXTENSION}@${VERSION}"

# A user's settings, which override two of planish-large-repos's defaults.
mkdir -p "${TMP}/user-data/User"
echo '{ "search.followSymlinks": true, "files.watcherExclude": { "dist/**": false } }' > "${TMP}/user-data/User/settings.json"

# A TypeScript project with installed packages, made before the app starts watching it.
package() {
  mkdir -p "${TMP}/workspace/node_modules/$1"
  echo "{ \"name\": \"$1\", \"version\": \"1.0.0\", \"types\": \"index.d.ts\" }" > "${TMP}/workspace/node_modules/$1/package.json"
  echo "export declare const value: $2;" > "${TMP}/workspace/node_modules/$1/index.d.ts"
}
package dep number
package @scope/lib number
mkdir -p "${TMP}/workspace/build" "${TMP}/workspace/dist"
echo '{ "compilerOptions": { "strict": true, "module": "nodenext", "noEmit": true } }' > "${TMP}/workspace/tsconfig.json"
echo '{ "name": "workspace", "type": "module" }' > "${TMP}/workspace/package.json"
for module in dep fresh @scope/fresh; do
  printf "import { value } from '%s';\nexport const n: number = value;\n" "${module}" > "${TMP}/workspace/${module//[@\/]/}.ts"
done

SMOKE_EXTENSION="${EXTENSION}" run_tests smoke "${TMP}/extensions"
