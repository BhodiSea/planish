#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Checks, after build.sh, that the Planish block at the end of prepare_vscode.sh changed the
# prepared vscode/ tree, since replace does nothing, and says nothing, when upstream's text
# stops matching. The fence check makes this name each file the block edits, once per edit.

cd "$( dirname "$0" )/.." || exit 1

status=0

# FILE ERE WHAT: reports WHAT unless vscode/FILE holds a line matching ERE.
expect() {
  if ! grep -qsE -- "$2" "vscode/$1"; then
    echo "::error::vscode/$1: $3"
    status=1
  fi
}

expect LICENSE.txt "Apache License" "the Apache License is not appended"
expect build/lib/electron.ts "companyName: 'Cogvera Labs'" "companyName is not Cogvera Labs"
expect build/lib/electron.ts "copyright: 'Copyright \(C\) [0-9]+ Cogvera Labs\." "copyright does not name Cogvera Labs"
expect cli/build.rs '"CompanyName", "Cogvera Labs"' "CompanyName is not Cogvera Labs"
expect cli/build.rs '"LegalCopyright", "Copyright \(C\) [0-9]+ Cogvera Labs\.' "LegalCopyright does not name Cogvera Labs"
expect build/lib/policies/render.ts 'namespace="CogveraLabs\.Policies\.' "the policy namespace is not CogveraLabs.Policies."
expect resources/win32/VisualElementsManifest.xml 'ShortDisplayName="Planish"' "ShortDisplayName is not Planish"
expect src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts "'insider' : 'main'" "the announcements fetch does not use main"

# cp makes the file when VS Code no longer has it, so check that VS Code's commit does.
if ! git -C vscode cat-file -e HEAD:resources/win32/sessions.ico 2> /dev/null \
  || ! cmp -s vscode/resources/win32/code.ico vscode/resources/win32/sessions.ico; then
  echo "::error::vscode/resources/win32/sessions.ico is not VS Code's icon replaced by code.ico"
  status=1
fi

exit "${status}"
