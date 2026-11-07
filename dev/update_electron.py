# SPDX-License-Identifier: Apache-2.0
"""Write the patch that raises Electron's version (issue #56; docs/electron.md).

Usage: python3 -I -B dev/update_electron.py VERSION

Fetches VS Code's .npmrc, build/checksums/electron.txt and cgmanifest.json at the tag in
upstream/stable.json, Electron VERSION's SHASUMS256.txt and the commit its tag names, and writes
patches/user/00-build-update-electron.patch, which pins VERSION and its checksums. VERSION must
be newer than VS Code's Electron and share its major version, and so its Chromium version. The
.npmrc change is fenced; dev/check_fences.py lets this patch alone leave the checksum and
manifest lines unfenced.
"""
import difflib
import json
import os
import re
import subprocess
import sys

PATCH = 'patches/user/00-build-update-electron.patch'
SPDX = '# SPDX-License-Identifier: Apache-2.0\n'
TARGET = re.compile(r'target="(\d+\.\d+\.\d+)"\n')
ELECTRON = 'https://github.com/electron/electron'


def fetch(url):
  return subprocess.run(['curl', '-fsSL', '--retry', '3', url], check=True,
                        capture_output=True, text=True).stdout


def raise_npmrc(npmrc, old, new):
  line = f'target="{old}"\n'
  fenced = f'# --- Start Planish ---\n# {line}target="{new}"\n# --- End Planish ---\n'
  return npmrc.replace(line, fenced, 1)


def raise_checksums(sums, old, new, shasums):
  """VS Code's checksum list, each file named for the new version, with Electron's checksums."""
  published = {}
  for line in shasums.splitlines():
    if line.strip():
      checksum, name = line.split()
      published[name.lstrip('*')] = checksum
  out = []
  for line in sums.splitlines():
    name = line.split(' *', 1)[1].replace(f'-v{old}-', f'-v{new}-')
    if name not in published:
      raise ValueError(f'Electron {new} publishes no {name}')
    out.append(f'{published[name]} *{name}\n')
  return ''.join(out)


def raise_manifest(manifest, old, new, commit):
  """cgmanifest.json with Electron's entry naming the new version and its commit."""
  start = manifest.index(f'"repositoryUrl": "{ELECTRON}"')
  end = manifest.index('"version": ', start)
  end = manifest.index('\n', end)
  entry = manifest[start:end]
  entry = re.sub(r'"commitHash": "[0-9a-f]{40}"', f'"commitHash": "{commit}"', entry, count=1)
  entry = entry.replace(f'"tag": "{old}"', f'"tag": "{new}"', 1)
  entry = entry.replace(f'"version": "{old}"', f'"version": "{new}"', 1)
  return manifest[:start] + entry + manifest[end:]


def diff(path, old, new):
  lines = difflib.unified_diff(
    old.splitlines(True), new.splitlines(True), f'a/{path}', f'b/{path}', n=1)
  return f'diff --git a/{path} b/{path}\n' + ''.join(lines)


def patch(files, new, shasums, commit):
  """The patch, from VS Code's {path: text} for the three files."""
  old = TARGET.search(files['.npmrc'])[1]
  was, now = (tuple(map(int, v.split('.'))) for v in (old, new))
  if now[0] != was[0] or now <= was:
    raise ValueError(f'{new} is not a newer release of VS Code\'s Electron {old}, in its major version')
  changed = {
    '.npmrc': raise_npmrc(files['.npmrc'], old, new),
    'build/checksums/electron.txt': raise_checksums(
      files['build/checksums/electron.txt'], old, new, shasums),
    'cgmanifest.json': raise_manifest(files['cgmanifest.json'], old, new, commit),
  }
  return SPDX + ''.join(diff(path, files[path], text) for path, text in changed.items())


def main():
  if len(sys.argv) != 2 or not re.fullmatch(r'\d+\.\d+\.\d+', sys.argv[1]):
    sys.exit(__doc__.split('\n\n')[1])
  new = sys.argv[1]
  root = subprocess.run(['git', 'rev-parse', '--show-toplevel'], check=True,
                        capture_output=True, text=True).stdout.strip()
  with open(os.path.join(root, 'upstream/stable.json')) as f:
    tag = json.load(f)['tag']
  files = {
    path: fetch(f'https://raw.githubusercontent.com/microsoft/vscode/{tag}/{path}')
    for path in ('.npmrc', 'build/checksums/electron.txt', 'cgmanifest.json')}
  shasums = fetch(f'{ELECTRON}/releases/download/v{new}/SHASUMS256.txt')
  refs = dict(reversed(line.split('\t')) for line in subprocess.run(
    ['git', 'ls-remote', ELECTRON, f'refs/tags/v{new}', f'refs/tags/v{new}^{{}}'],
    check=True, capture_output=True, text=True).stdout.splitlines())
  commit = refs.get(f'refs/tags/v{new}^{{}}', refs.get(f'refs/tags/v{new}'))  # an annotated tag's commit
  if not commit:
    sys.exit(f'Electron has no tag v{new}')
  try:
    text = patch(files, new, shasums, commit)
  except ValueError as e:
    sys.exit(str(e))
  with open(os.path.join(root, PATCH), 'w') as f:
    f.write(text)
  print(f'Wrote {PATCH}: VS Code {tag}\'s Electron raised to {new}')


if __name__ == '__main__':
  main()
