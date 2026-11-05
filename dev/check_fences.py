# SPDX-License-Identifier: Apache-2.0
"""Check that Planish's edits to upstream files are fenced (issue #5).

Usage: python3 -I dev/check_fences.py [VSCODIUM_REF]    (default: vscodium/master)

Upstream files are those in the merge-base of HEAD and VSCODIUM_REF. Each line Planish
adds to one, and each line a patch of Planish's adds to VS Code's tree, must sit between
"--- Start Planish ---" and "--- End Planish ---" comments in that file's comment syntax,
except in new files in Planish's own folders and the few files listed below. Names that
differ only in case are refused, since macOS and Windows treat them as one. Strict JSON
holds no comments: VS Code's is changed by JSON Merge Patches in patches/user/json/, which
dev/merge_json.sh merges at build time. Prints Planish's JSON edits and the upstream files
it edits; exits 1 on errors.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter

REPLACED = {'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'README.md'}  # Planish's own now
PINS = {'.nvmrc', 'upstream/insider.json', 'upstream/stable.json'}  # version pins, edited in place
IMAGES = ('.bmp', '.gif', '.icns', '.ico', '.jpg', '.png', '.svg', '.xpm')  # replaced whole
OVERLAYS = 'patches/user/json/'
DELETE_LIST = re.compile(r'patches/[^/]+\.json')  # prepare_vscode.sh deletes the paths each lists
OWN = r'(extensions/planish-|src/vs/workbench/contrib/planish)'  # Planish's folders in VS Code
OWN_SRC = re.compile(r'src/(stable|insider)/' + OWN)
PATCH = re.compile(r'patches/.+\.patch(\.no|\.yet)?')
SPDX = '# SPDX-License-Identifier: Apache-2.0'
LINKS = {'120000', '160000'}  # symlink, submodule
# Raising Electron's patch version (fork.md, "Electron and Chromium") changes two VS Code files
# that hold no comments: only this patch may leave lines in them unfenced, and only these lines.
ELECTRON_PATCH = 'patches/user/00-build-update-electron.patch'
ELECTRON_LINES = {
  'build/checksums/electron.txt': r'[0-9a-f]{64} \*[\w.-]+',
  'cgmanifest.json': r'\s*"(commitHash|tag|version)": "[\w.]+",?',
}

FORMS = {  # each comment syntax's Start marker; its End marker has "End" for "Start"
  'hash': '# --- Start Planish ---',
  'slash': '// --- Start Planish ---',
  'css': '/* --- Start Planish --- */',
  'html': '<!-- --- Start Planish --- -->',
  'xml': '<!-- Start Planish -->',  # XML bans "--" inside comments
  'semi': '; --- Start Planish ---',
}
MARKERS = {
  name: re.compile(r'[ \t]*' + re.escape(form).replace('Start', '(Start|End)') + r'[ \t\r]*')
  for name, form in FORMS.items()
}
MARKISH = re.compile(r'---\s*(Start|End)\s+Planish\s*---|<!--\s*(Start|End)\s+Planish\s*-->', re.I)
EXTENSIONS = {
  'hash': 'sh bash zsh fish ps1 py gypi yml yaml toml desktop npmrc moduleignore gitignore '
          'gitattributes editorconfig ecformat_ignore',
  'slash': 'ts tsx js jsx mjs cjs mts cts rs c cc cpp h m mm jsonc code-workspace',
  'css': 'css less scss',
  'html': 'md html htm',
  'xml': 'xml wxs wxi wxl xsl plist',
  'semi': 'iss isl',
}
BY_EXT = {ext: name for name, exts in EXTENSIONS.items() for ext in exts.split()}
HUNK = re.compile(r'@@ -\d{1,9}(?:,(\d{1,9}))? \+(\d{1,9})(?:,(\d{1,9}))? @@')
PLAIN = re.compile(r'[\w./+@-]+', re.A)


def q(text):
  """text as is when plain, else as a JSON string with "#" escaped, so that it holds no line
  break and GitHub reads no workflow command in it ("::" at a line's start, "##[" anywhere)."""
  return text if PLAIN.fullmatch(text) else json.dumps(text).replace('#', '\\u0023')


def git(*args):
  run = subprocess.run(['git', *args], capture_output=True)
  if run.returncode:
    sys.exit(f'git {args[0]} failed: {q(run.stderr.decode(errors="replace").strip())}')
  return run.stdout


def syntax(path, first_line=''):
  """The comment syntax of path's file type, or None for strict JSON and unknown types."""
  name = path.rsplit('/', 1)[-1]
  if name.endswith('.json'):
    jsonc = name.startswith(('tsconfig', 'jsconfig')) or '/.vscode/' in '/' + path
    return 'slash' if jsonc else None
  ext = name.rsplit('.', 1)[-1] if '.' in name.lstrip('.') else name.lstrip('.')
  if ext in BY_EXT:
    return BY_EXT[ext]
  if name in ('justfile', 'Makefile', 'Dockerfile') or first_line.startswith('#!'):
    return 'hash'
  return None


def outside(path, syn):
  """The error for a line added outside a fence."""
  if syn:
    return 'line added outside a fence'
  if path.endswith('.json'):
    return f"line added outside a fence (strict JSON holds none: change VS Code's in {OVERLAYS})"
  return 'line added outside a fence (comment syntax unknown: add the file type to EXTENSIONS)'


def fence(lines, syn):
  """Walk (number, text, added) lines; return errors and the added lines outside fences."""
  errors, loose, start = [], [], None
  for n, text, added in lines:
    if MARKISH.search(text):
      m = syn and MARKERS[syn].fullmatch(text)
      if not syn:
        errors.append((n, 'fence marker in a file type without known comments'))
      elif not m:
        end = FORMS[syn].replace('Start', 'End')
        errors.append((n, f'fence marker must read "{FORMS[syn]}" or "{end}"'))
      elif m[1] == 'Start':
        if start:
          errors.append((n, 'fence opened inside a fence'))
        start = n
      else:
        if not start:
          errors.append((n, 'fence closed but never opened'))
        start = None
    elif added and not start and text.strip(' \t\r'):  # blank lines slide in diffs
      loose.append((n, text))
  if start:
    errors.append((start, 'fence opened but never closed'))
  return errors, loose


def check_text(path, old, new, data):
  """Errors in an upstream text file edited here; old and new are its blob ids."""
  added = set()
  args = ('-U0', '--inter-hunk-context=0', '--text', '--no-textconv', '--no-ext-diff', '--no-color')
  diff = git('diff', *args, old, new)
  for line in diff.decode(errors='replace').split('\n'):
    if m := HUNK.match(line):
      added.update(range(int(m[2]), int(m[2]) + int(m[3] or 1)))
  lines = data.decode(errors='replace').split('\n')
  syn = syntax(path, lines[0])
  found, loose = fence([(n, s, n in added) for n, s in enumerate(lines, 1)], syn)
  return found + [(n, outside(path, syn)) for n, _ in loose]


def sections(text):
  """Split a patch into [target, created, [(line number, kind, text)]] by its hunks' counts."""
  out, old, todo = [], None, (0, 0)
  for n, line in enumerate(text.split('\n'), 1):
    if todo != (0, 0) and not line.startswith('diff --git '):
      kind = line[:1] or ' '
      if kind != '\\':
        todo = (todo[0] - (kind in ' -'), todo[1] - (kind in ' +'))
        out[-1][2].append((n, kind, line[1:]))
    elif line.startswith('--- '):
      old = line[4:]
    elif line.startswith('+++ ') and old is not None:
      new = line[4:]
      out.append([(old if new == '/dev/null' else new)[2:], old == '/dev/null', []])
      old = None
    elif out and (m := HUNK.match(line)):
      todo = (int(m[1] or 1), int(m[3] or 1))
  return out


def applied(data):
  """{path: lines added} as git apply reads a patch; None if it cannot, or finds more than text."""
  run = subprocess.run(['git', 'apply', '--numstat', '-z', '-'], input=data, capture_output=True)
  counts = {}
  for entry in run.stdout.split(b'\0')[:-1]:
    m = re.fullmatch(rb'(\d+)\t\d+\t(.+)', entry, re.S)
    if not m:  # a binary patch, a rename or a copy
      return None
    path = m[2].decode(errors='replace')
    counts[path] = counts.get(path, 0) + int(m[1])
  return None if run.returncode else counts


def check_patch(path, data, base=None):
  """Errors in a patch file, and {existing VS Code file it changes: lines left unfenced by the
  Electron exemption}. In VSCodium's patches, lines VSCodium's version adds may stay unfenced."""
  text = data.decode(errors='replace')
  errors, changed, parsed = [], {}, sections(text)
  if base is None and not text.startswith(SPDX + '\n'):
    errors.append((1, f'a patch of Planish\'s must start with "{SPDX}"'))
  counts = {}
  for target, _, lines in parsed:
    counts[target] = counts.get(target, 0) + sum(kind == '+' for _, kind, _ in lines)
  if applied(data) != counts:
    errors.append((1, 'git apply reads this patch differently: keep it to text hunks, '
                      'without binary data, renames, copies or mode changes'))
  allowed = Counter((t, s) for t, _, ls in sections(base.decode(errors='replace') if base else '')
                    for _, k, s in ls if k == '+')
  exempt = ELECTRON_LINES if path == ELECTRON_PATCH else {}
  for target, created, lines in parsed:
    syn = syntax(target)
    own = created and re.match(OWN, target)  # elsewhere it may replace a file deleted first
    found, loose = fence([(n, s, not own) for n, k, s in lines if k == '+'], syn)
    errors += [(n, f'{q(target)}: {msg}') for n, msg in found]
    unfenced = 0
    for n, s in loose:
      if allowed[(target, s)]:
        allowed[(target, s)] -= 1
      elif target in exempt and re.fullmatch(exempt[target], s):
        unfenced += 1
      else:
        errors.append((n, f'{q(target)}: {outside(target, syn)}'))
    if not created:
      changed[target] = changed.get(target, 0) + unfenced
  return errors, changed


def keys(value, prefix=''):
  """Key paths a JSON Merge Patch sets; "-" marks a deletion."""
  if isinstance(value, dict) and value:
    return [k for name, v in value.items() for k in keys(v, f'{prefix}{name}.')]
  return [('-' if value is None else '') + q(prefix[:-1])]


def changed_keys(old, new, prefix=''):
  """Key paths whose values differ between two JSON values."""
  if isinstance(old, dict) and isinstance(new, dict):
    return [k for name in {**old, **new}
            for k in changed_keys(old.get(name), new.get(name), f'{prefix}{name}.')]
  return [] if old == new else [q(prefix[:-1]) if prefix else 'the whole file']


def deleted_paths(data):
  """The paths in vscode/ that a delete list removes, or None if it is not one."""
  try:
    lists = [entry['paths'] for entry in json.loads(data) if entry.get('action') == 'remove']
  except (ValueError, TypeError, AttributeError, KeyError):
    return None
  paths = [p for ps in lists if isinstance(ps, list) for p in ps]
  inside = all(isinstance(p, str) and p and p[0] != '/' and '..' not in p.split('/') for p in paths)
  return paths if inside and all(isinstance(ps, list) for ps in lists) else None


def case_clashes(*trees):
  """Errors for names in these trees that differ only in case from an earlier one."""
  seen, clashes = {}, {}
  for tree in trees:
    paths = git('ls-tree', '-r', '-z', '--name-only', tree).decode(errors='replace').split('\0')
    for path in paths[:-1]:
      parts = path.split('/')
      for i in range(1, len(parts) + 1):
        name = '/'.join(parts[:i])
        if seen.setdefault(name.casefold(), name) != name:
          clashes[name] = seen[name.casefold()]
          break
  return [(name, 1, f'differs only in case from {q(first)}, which macOS and Windows treat '
                    'as the same name') for name, first in clashes.items()]


def main():
  os.chdir(git('rev-parse', '--show-toplevel').rstrip(b'\n'))  # git apply skips other folders
  ref = sys.argv[1] if len(sys.argv) > 1 else 'vscodium/master'
  run = subprocess.run(['git', 'merge-base', 'HEAD', ref], capture_output=True, text=True)
  if run.returncode:
    sys.exit(f'No merge-base of HEAD and {q(ref)}: fetch VSCodium\'s master and the full history.')
  base = run.stdout.strip()
  raw = git('diff-tree', '-r', '-z', '--no-renames', '--no-abbrev', base, 'HEAD')
  raw = raw.decode(errors='replace').split('\0')[:-1]
  errors, json_edits, vs_code = case_clashes(base, 'HEAD'), [], {}
  edited = {'changed': [], 'replaced': [], 'binary': [], 'version pin': [], 'deleted': []}
  for meta, path in zip(raw[::2], raw[1::2]):
    old_mode, new_mode, old, new, status = meta[1:].split()
    if status == 'D':
      edited['deleted'].append(path)
      continue
    if LINKS & {old_mode, new_mode}:
      if status != 'A' or path.startswith(('patches/', 'src/')):
        errors.append((path, 1, 'a symlink or submodule, which this check cannot read'))
      continue
    if status == 'A':
      if PATCH.fullmatch(path):
        found, changed = check_patch(path, git('cat-file', 'blob', new))
        errors += [(path, n, msg) for n, msg in found]
        for target, unfenced in changed.items():
          vs_code.setdefault(target, (path, unfenced))
          if target.endswith('.json') and not syntax(target):
            json_edits.append(f'vscode/{q(target)}, by {q(path)}')
      elif path.startswith(OVERLAYS) and path.endswith('.json'):
        try:
          overlay = json.loads(git('cat-file', 'blob', new))
        except ValueError:
          overlay = None
        if not isinstance(overlay, dict):
          errors.append((path, 1, 'not a JSON object (strict JSON: no comments)'))
          continue
        target = path[len(OVERLAYS):]
        json_edits.append(f'vscode/{q(target)}, by {q(path)}: '
                          + (', '.join(keys(overlay)) if overlay else 'no keys'))
        vs_code.setdefault(target, (path, 0))
      elif DELETE_LIST.fullmatch(path):
        removed = deleted_paths(git('cat-file', 'blob', new))
        if removed is None:
          errors.append((path, 1, 'not a delete list like patches/52-ext-copilot-remove-it.json'))
        for target in removed or []:
          vs_code.setdefault(target, (path, 0))
      elif path.startswith(('src/stable/', 'src/insider/')) and not OWN_SRC.match(path):
        errors.append((path, 1, f'could replace vscode/{q(path.split("/", 2)[2])} whole; Planish '
                                'code goes in extensions/planish-*/ or contrib/planish*/'))
      continue
    data, old_data = git('cat-file', 'blob', new), git('cat-file', 'blob', old)
    if path in REPLACED:
      edited['replaced'].append(path)
      if path.endswith('.json'):
        json_edits.append(f'{path}, replaced whole')
    elif path.endswith(IMAGES) or b'\0' in old_data:
      edited['binary'].append(path)
    elif b'\0' in data:
      errors.append((path, 1, 'upstream text file made binary'))
    elif path in PINS:
      edited['version pin'].append(path)
      if path.endswith('.json'):
        try:
          pins = changed_keys(json.loads(old_data), json.loads(data))
        except ValueError:
          errors.append((path, 1, 'not valid JSON'))
          continue
        json_edits.append(f'{path}, edited in place: ' + (', '.join(pins) or 'no keys'))
    else:
      edited['changed'].append(path)
      if PATCH.fullmatch(path):
        found = check_patch(path, data, old_data)[0]
      else:
        found = check_text(path, old, new, data)
      errors += [(path, n, msg) for n, msg in found]

  # Each line starts with fixed text, so no file name or line from the diff can start one.
  count = sum(map(len, edited.values()))
  report = [f'Upstream: VSCodium {base[:7]}', '', f"Planish's JSON edits: {len(json_edits)}"]
  report += [f'  - {line}' for line in json_edits]
  report += ['', f'Upstream files Planish edits: {count + len(vs_code)}']
  report += [f'  VSCodium files in this repository: {count}']
  report += [f'    - {kind}: {q(path)}' for kind, paths in edited.items() for path in paths]
  report += [f'  VS Code files: {len(vs_code)}']
  for target, (source, n) in sorted(vs_code.items()):
    unfenced = f': {n} lines unfenced (Electron update)' if n else ''
    report += [f'    - {q(target)}, by {q(source)}{unfenced}']
  if errors:
    report += ['', f'Errors: {len(errors)}'] + [f'  - {q(p)}:{n}: {msg}' for p, n, msg in errors]
  report = '\n'.join(report)
  print(report)
  if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
      summary.write(f'```text\n{report}\n```\n')
  if os.environ.get('GITHUB_ACTIONS') == 'true':
    for p, n, msg in errors:
      where = f' file={p},line={n}' if PLAIN.fullmatch(p) else ''
      print(f'::error{where}::' + msg.replace('%', '%25'))
  sys.exit(1 if errors else 0)


if __name__ == '__main__':
  try:
    main()
  except RecursionError:
    sys.exit('A JSON file nests too deeply to check.')
