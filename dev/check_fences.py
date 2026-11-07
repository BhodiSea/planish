# SPDX-License-Identifier: Apache-2.0
"""Check that Planish's edits to upstream files are fenced (issue #5).

Usage: python3 -I dev/check_fences.py [VSCODIUM_REF]    (default: vscodium/master)

Upstream files are those in the merge-base of HEAD and VSCODIUM_REF. Each line Planish
adds to one, and each line a patch of Planish's adds to VS Code's tree, must sit between
"--- Start Planish ---" and "--- End Planish ---" comments in that file's comment syntax,
except in new files in Planish's own folders and the few files listed below. Each line
removed from either must be kept as a comment in a fence at the place it was removed from, so
a line holding its comment closer stays. A line VSCodium's version of one of its patches adds
and Planish's drops must be kept as a comment in a fence among the lines Planish's adds to that
file, and a line VSCodium's removes must still be removed. A file git finds moved is checked
as an edit of the file it was. Blank lines are exempt, VS Code's files may be deleted whole,
by a patch or a delete list, but not then created again, and a VSCodium patch may be disabled
by renaming it, unchanged, to .patch.no. Names that differ only in case are refused, since
macOS and Windows treat them as one. Strict JSON holds no comments: VS Code's is changed
by JSON Merge Patches in patches/user/json/, which dev/merge_json.sh merges at build time.
Prints Planish's JSON edits and the upstream files it edits, with the VS Code files that
the fences in prepare_vscode.sh change with replace, cp or cat, one command a line, which
dev/check_build_edits.sh must check once for each edit; exits 1 on errors.
"""
import json
import os
import posixpath
import re
import shlex
import subprocess
import sys
from collections import Counter

REPLACED = {'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'README.md',
            'announcements-extra.json'}  # Planish's own now
PINS = {'.nvmrc', 'upstream/insider.json', 'upstream/stable.json'}  # version pins, edited in place
IMAGES = ('.bmp', '.gif', '.icns', '.ico', '.jpg', '.png', '.svg', '.xpm')  # replaced whole
OVERLAYS = 'patches/user/json/'
DELETE_LIST = re.compile(r'patches/[^/]+\.json')  # prepare_vscode.sh deletes the paths each lists
BUILD_SCRIPT = 'prepare_vscode.sh'
BUILD_CHECK = 'dev/check_build_edits.sh'  # checks the results of its edits
# Its fences hold only edits whose last word is the file, comments and the JSON merge.
BUILD_EDIT = re.compile(r'[ \t]*(replace|cp|cat)[ \t]')
BUILD_OTHER = re.compile(r'[ \t]*(#.*|\.\./dev/merge_json\.sh)?[ \t\r]*')
OPERATOR = re.compile(r'[;&|<>()]+')  # as shlex splits them out
BUILD_CHECK_LINE = re.compile(r'[ \t]*(expect|copied)[ \t]')  # each names its file first
OWN = r'(extensions/planish-|src/vs/workbench/contrib/planish)'  # Planish's folders in VS Code
OWN_SRC = re.compile(r'src/(stable|insider)/' + OWN)
PATCH = re.compile(r'patches/.+\.patch(\.no|\.yet)?')
MODES = re.compile(r'^(old|new) mode [0-7]', re.M)
SPDX = '# SPDX-License-Identifier: Apache-2.0'
LINKS = {'120000', '160000'}  # symlink, submodule
# Raising Electron's patch version (fork.md, "Electron and Chromium") changes two VS Code files
# that hold no comments: only this patch may leave lines in them unfenced, and only these lines.
ELECTRON_PATCH = 'patches/user/00-build-update-electron.patch'
ELECTRON_LINES = {
  'build/checksums/electron.txt': r'[0-9a-f]{64} \*[\w.-]+',
  'cgmanifest.json': r'\s*"(commitHash|tag|version)": "[\w.]+",?',
}

COMMENTS = {  # each comment syntax's opener and closer
  'hash': ('#', ''),
  'slash': ('//', ''),
  'css': ('/*', '*/'),
  'html': ('<!--', '-->'),
  'xml': ('<!--', '-->'),
  'semi': (';', ''),
}
# Text that ends a comment early, so that no comment can keep a line holding it.
CLOSERS = {name: closer for name, (_, closer) in COMMENTS.items() if closer} | {'xml': '--'}
# Each syntax's Start marker; its End marker has "End" for "Start". XML bans "--" in comments.
FORMS = {
  name: f'{opener} --- Start Planish --- {closer}'.rstrip()
  for name, (opener, closer) in COMMENTS.items()
}
FORMS['xml'] = '<!-- Start Planish -->'
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
HUNK = re.compile(r'@@ -(\d{1,9})(?:,(\d{1,9}))? \+(\d{1,9})(?:,(\d{1,9}))? @@')
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


def unmarked(path, syn, what, fenced=False):
  """The error for what ("line added", say) outside a fence; if fenced, for a line removed from
  inside a fence that keeps no comment of it; if fenced is 'closer', for a line removed that no
  comment can keep."""
  if fenced == 'closer':
    return f'{what}, but it holds "{CLOSERS[syn]}", so no comment can keep it: leave it in place'
  if fenced:
    return f'{what} but not kept as a comment in its fence'
  error = f'{what} outside a fence'
  if syn:
    return error
  if path.endswith('.json'):
    return f"{error} (strict JSON holds none: change VS Code's in {OVERLAYS})"
  return f'{error} (comment syntax unknown: add the file type to EXTENSIONS)'


def words(text):
  return ' '.join(text.split())


def comment(text, syn):
  """The words of text if it is a comment line in syntax syn, else None."""
  opener, closer = COMMENTS[syn]
  text = text.strip()
  if text.startswith(opener) and text.endswith(closer) and len(text) >= len(opener + closer):
    return words(text[len(opener):len(text) - len(closer)])
  return None


def fence(lines, syn):
  """Walk (number, kind, text) lines in order, kind being '+' for an added line, ' ' for a kept
  one, '-' for a removed one and '@' for a gap between hunks. Return the errors, the added lines
  outside fences, and the removed lines that no fence at the place they were removed from keeps
  as comments, each with whether a fence was there, or 'closer' if no comment could keep it."""
  errors, loose, fences, start = [], [], [], None
  for i, (n, kind, text) in enumerate(lines):
    if kind not in '+ ':
      continue
    if MARKISH.search(text):
      m = syn and MARKERS[syn].fullmatch(text)
      if not syn:
        errors.append((n, 'fence marker in a file type without known comments'))
      elif not m:
        end = FORMS[syn].replace('Start', 'End')
        errors.append((n, f'fence marker must read "{FORMS[syn]}" or "{end}"'))
      elif m[1] == 'End':
        if start is None:
          errors.append((n, 'fence closed but never opened'))
        else:
          fences.append((start, i))
        start = None
      elif start is not None:
        errors.append((n, 'fence opened inside a fence'))
      else:
        start = i
    elif kind == '+' and start is None and text.strip(' \t\r'):  # blank lines slide in diffs
      loose.append((n, text))
  if start is not None:
    errors.append((lines[start][0], 'fence opened but never closed'))
    fences.append((start, len(lines)))
  kept = [Counter(note for _, k, s in lines[a + 1:b]
                  if k in '+ ' and (note := comment(s, syn)) is not None) for a, b in fences]
  gone, first = [], None
  for i, (_, kind, _) in enumerate([*lines, (0, '@', '')]):  # the last entry ends the last run
    if kind in '+-':
      first = i if first is None else first
    elif first is not None:  # lines[first:i] is a run of changes; near, its fences' comments
      near = [notes for notes, (a, b) in zip(kept, fences) if a < i and b >= first]
      for n, k, s in lines[first:i]:
        if k == '-' and s.strip(' \t\r'):
          held = next((notes for notes in near if notes[words(s)]), None)
          if syn in CLOSERS and CLOSERS[syn] in s:
            gone.append((n, s, 'closer'))
          elif held is None:
            gone.append((n, s, bool(near)))
          else:
            held[words(s)] -= 1
      first = None
  return errors, loose, gone


def check_text(path, old, new, data):
  """Errors in an upstream text file edited here; old and new are its blob ids."""
  added, removed, hunk = set(), {}, None
  args = ('-U0', '--inter-hunk-context=0', '--diff-algorithm=myers', '--indent-heuristic',
          '--text', '--no-textconv', '--no-ext-diff', '--no-color')  # as in CI, whatever the config
  for line in git('diff', *args, old, new).decode(errors='replace').split('\n'):
    if m := HUNK.match(line):
      was, start, count = int(m[1]), int(m[3]), int(m[4] or 1)
      added.update(range(start, start + count))
      hunk = removed.setdefault(start if count else start + 1, [])  # the line they now sit before
      at = max(start, 1)
    elif hunk is not None and line.startswith('-'):
      hunk.append(((at, was), line[1:]))
      was += 1
  lines = data.decode(errors='replace').split('\n')
  syn = syntax(path, lines[0])
  walk = []
  for n, text in enumerate(lines, 1):
    walk += [(where, '-', s) for where, s in removed.get(n, ())]
    walk.append((n, '+' if n in added else ' ', text))
  found, loose, gone = fence(walk, syn)
  found += [(n, unmarked(path, syn, 'line added')) for n, _ in loose]
  return found + [(n, unmarked(path, syn, f"VSCodium's line {was} removed", fenced))
                  for (n, was), _, fenced in gone]


def sections(text):
  """Split a patch into [target, status, [(line number, kind, text)]] by its hunks' counts, with
  status A, D, M or R as it creates, deletes, changes or moves the file, and kind '@' for the
  start of a hunk."""
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
      status = ('A' if old == '/dev/null' else 'D' if new == '/dev/null'
                else 'M' if old[2:] == new[2:] else 'R')
      out.append([(old if new == '/dev/null' else new)[2:], status, []])
      old = None
    elif out and (m := HUNK.match(line)):
      todo = (int(m[2] or 1), int(m[4] or 1))
      out[-1][2].append((n, '@', ''))
  return out


def applied(data):
  """{path: (lines added, lines removed)} as git apply reads a patch; None if it cannot, or finds
  more than text."""
  run = subprocess.run(['git', 'apply', '--numstat', '-z', '-'], input=data, capture_output=True)
  counts = {}
  for entry in run.stdout.split(b'\0')[:-1]:
    m = re.fullmatch(rb'(\d+)\t(\d+)\t(.+)', entry, re.S)
    if not m:  # a binary patch
      return None
    path = m[3].decode(errors='replace')
    added, removed = counts.get(path, (0, 0))
    counts[path] = (added + int(m[1]), removed + int(m[2]))
  return None if run.returncode else counts


def check_patch(path, data, base=None):
  """Errors in a patch file, {existing VS Code file it changes: lines left unfenced by the
  Electron exemption}, and the (file, 'A' or 'D') pairs for the files it creates or deletes. In
  VSCodium's patches, lines VSCodium's version adds or removes may stay unfenced, and only the
  pairs it lacks are given."""
  text = data.decode(errors='replace')
  errors, changed, parsed = [], {}, sections(text)
  if base is None and not text.startswith(SPDX + '\n'):
    errors.append((1, f'a patch of Planish\'s must start with "{SPDX}"'))
  counts = {}
  for target, _, lines in parsed:
    added, removed = counts.get(target, (0, 0))
    counts[target] = (added + sum(k == '+' for _, k, _ in lines),
                      removed + sum(k == '-' for _, k, _ in lines))
  # git apply counts a moved or copied file under its new name, and leaves out mode changes.
  if applied(data) != counts or MODES.search(text) or any(s == 'R' for _, s, _ in parsed):
    errors.append((1, 'git apply reads this patch differently: keep it to text hunks, '
                      'without binary data, renames, copies or mode changes'))
  vscodium = sections(base.decode(errors='replace')) if base else []
  allowed = Counter((t, k, s) for t, _, ls in vscodium for _, k, s in ls if k in '+-')
  exempt = ELECTRON_LINES if path == ELECTRON_PATCH else {}
  for target, status, lines in parsed:
    syn = syntax(target)
    own = status == 'A' and re.match(OWN, target)  # elsewhere it may replace a file deleted first
    # Context lines only separate changes; Planish's own new files and deleted files need no fence.
    kinds = {' ': '@', '+': ' ' if own else '+', '-': '@' if status == 'D' else '-'}
    found, loose, gone = fence([(n, kinds.get(k, k), s) for n, k, s in lines], syn)
    errors += [(n, f'{q(target)}: {msg}') for n, msg in found]
    unfenced = 0
    changes = [(n, '+', s, False) for n, s in loose] + [(n, '-', s, f) for n, s, f in gone]
    for n, kind, s, fenced in changes:
      if allowed[(target, kind, s)]:
        allowed[(target, kind, s)] -= 1
      elif target in exempt and re.fullmatch(exempt[target], s):
        unfenced += 1
      else:
        what = 'line added' if kind == '+' else 'line removed'
        errors.append((n, f'{q(target)}: {unmarked(target, syn, what, fenced)}'))
    if status != 'A':
      changed[target] = changed.get(target, 0) + unfenced
  errors += dropped(parsed, vscodium)
  whole = {(t, s) for t, s, _ in parsed if s in 'AD'} - {(t, s) for t, s, _ in vscodium}
  return errors, changed, whole


def dropped(parsed, vscodium):
  """Errors for the lines VSCodium's version of a patch changes that Planish's no longer does.
  A line it added must be kept as a comment in a fence among the lines Planish's adds to that
  file; a line it removed must still be removed, and may be added back in a fence."""
  def lines(sections):
    found = ((t, k, s) for t, _, ls in sections for _, k, s in ls)
    return Counter(line for line in found if line[1] in '+-' and line[2].strip(' \t\r'))
  notes, first = {}, {}
  for target, _, ls in parsed:
    syn, inside = syntax(target), False
    first.setdefault(target, ls[0][0] if ls else 1)
    kept = notes.setdefault(target, Counter())
    for _, k, s in ls:
      if k not in '+ ' or not syn:
        continue
      if m := MARKERS[syn].fullmatch(s):
        inside = m[1] == 'Start'
      elif inside and k == '+' and (note := comment(s, syn)) is not None:
        kept[note] += 1
  errors = []
  for target, kind, s in (lines(vscodium) - lines(parsed)).elements():
    syn, what = syntax(target), f"{q(target)}: VSCodium's line {q(s.strip())}"
    if kind == '-':
      error = f'{what} is no longer removed: remove it, and add it back in a fence'
    elif not syn:
      error = f'{what} dropped: ' + (
        f"strict JSON holds no comments, so keep it and change the file in {OVERLAYS}"
        if target.endswith('.json') else 'comment syntax unknown: add the file type to EXTENSIONS')
    elif syn in CLOSERS and CLOSERS[syn] in s:
      error = f'{what} dropped, but it holds "{CLOSERS[syn]}", so no comment can keep it: keep it'
    elif notes.get(target, Counter())[words(s)]:
      notes[target][words(s)] -= 1
      continue
    else:
      error = f'{what} dropped but not kept as a comment in a fence'
    errors.append((first.get(target, 1), error))
  return errors


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


def shell_words(line):
  """The words of a shell line, with operators as words of their own; None if a word holds "#"
  or a quote is open."""
  lexer = shlex.shlex(re.sub(r'[ \t]#.*', '', line, count=1), posix=True, punctuation_chars=True)
  lexer.whitespace_split, lexer.commenters = True, ''
  try:
    found = list(lexer)
  except ValueError:
    return None
  return None if any('#' in word for word in found) else found


def build_edits(data):
  """{file: its lines} for the files that the fences in prepare_vscode.sh change with replace, cp
  or cat, each called at the start of a line, and errors for the lines there that this cannot
  read or list."""
  files, errors, inside = {}, [], False
  for n, line in enumerate(data.decode(errors='replace').split('\n'), 1):
    if m := MARKERS['hash'].fullmatch(line):
      inside = m[1] == 'Start'
    elif inside and BUILD_EDIT.match(line):
      found = shell_words(line)
      if found is None:
        errors.append((n, 'replace, cp or cat that this check cannot read: keep each to one line'))
        continue
      ops = [i for i, word in enumerate(found) if OPERATOR.fullmatch(word)]
      into = found[0] == 'cat' and found[-2:-1] in (['>'], ['>>'])  # cat's output is the file
      if '$(' in line or '`' in line or ops not in ([], [len(found) - 2] if into else []):
        errors.append((n, 'replace, cp or cat that runs another command too: keep each line to '
                          'one command, without $( ) or backquotes'))
      else:
        files.setdefault(found[-1], []).append(n)
    elif inside and not BUILD_OTHER.fullmatch(line):
      errors.append((n, 'a line this check cannot list: edit with replace, cp or cat'))
  return files, errors


def build_checks(data):
  """How many of dev/check_build_edits.sh's checks name each file."""
  named = Counter()
  for line in data.decode(errors='replace').split('\n'):
    if BUILD_CHECK_LINE.match(line) and (found := shell_words(line)) and len(found) > 1:
      named[found[1]] += 1
  return named


def within(path, folders):
  """The first of folders that is path or holds it, or None."""
  path = posixpath.normpath(path)
  return next((f for f in folders if path == f or path.startswith(f + '/')), None)


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
  changes = [(*meta[1:].split(), path) for meta, path in zip(raw[::2], raw[1::2])]
  deleted = {path: old for _, _, old, _, status, path in changes if status == 'D'}
  # VSCodium disables a patch by renaming it, unchanged, to .patch.no.
  disabled = {path for _, mode, _, new, status, path in changes
              if status == 'A' and mode not in LINKS and path.endswith('.no')
              and PATCH.fullmatch(path) and deleted.get(path[:-3]) == new}
  # A file that git finds moved, and perhaps edited, is checked as an edit of the file it was.
  raw = git('diff-tree', '-r', '-z', '-M', '--diff-filter=R', '--no-abbrev', base, 'HEAD')
  raw = raw.decode(errors='replace').split('\0')[:-1]
  moved = {new: old for old, new in zip(raw[1::3], raw[2::3]) if new not in disabled}
  gone = {c[5]: c for c in changes if c[4] == 'D' and c[5] in moved.values()}
  changes = [c for c in changes if c[5] not in gone]
  changes = [(gone[moved[c[5]]][0], c[1], gone[moved[c[5]]][2], c[3], 'M', c[5]) if c[5] in moved
            else c for c in changes]
  errors, json_edits, vs_code, build = case_clashes(base, 'HEAD'), [], {}, {}
  made = {'A': {}, 'D': {}}  # VS Code paths Planish creates or deletes whole: {path: (file, line)}
  edited = {'changed': [], 'moved': [], 'replaced': [], 'binary': [], 'version pin': [],
            'disabled': [], 'deleted': []}
  for old_mode, new_mode, old, new, status, path in changes:
    if path in disabled:
      edited['disabled'].append(path[:-3])
      continue
    if status == 'D':
      if path + '.no' not in disabled:
        edited['deleted'].append(path)
      continue
    if LINKS & {old_mode, new_mode}:
      if status != 'A' or path.startswith(('patches/', 'src/')):
        errors.append((path, 1, 'a symlink or submodule, which this check cannot read'))
      continue
    if status == 'A':
      if PATCH.fullmatch(path):
        found, changed, whole = check_patch(path, git('cat-file', 'blob', new))
        errors += [(path, n, msg) for n, msg in sorted(found)]
        for target, status in whole:
          made[status].setdefault(target, (path, 1))
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
          made['D'].setdefault(posixpath.normpath(target), (path, 1))
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
      edited['moved' if path in moved else 'changed'].append(path)
      if PATCH.fullmatch(path):
        found, _, whole = check_patch(path, data, old_data)
        for target, status in whole:
          made[status].setdefault(target, (path, 1))
      else:
        found = check_text(path, old, new, data)
      if path == BUILD_SCRIPT:
        build, unread = build_edits(data)
        checks = build_checks(git('cat-file', 'blob', f'HEAD:{BUILD_CHECK}'))
        found += unread + [
          (ns[-1], f'{BUILD_CHECK} checks {q(t)} fewer times than this edits it: check each edit')
          for t, ns in build.items() if checks[t] < len(ns)]
        for target, ns in build.items():  # cp and cat make a file that is not there
          made['A'].setdefault(target, (path, ns[0]))
      errors += [(path, n, msg) for n, msg in sorted(found)]
  for target, (path, n) in made['A'].items():
    if gone := within(target, made['D']):
      errors.append((path, n, f'{q(target)}: deleted by {q(made["D"][gone][0])} and created again, '
                              'which drops its lines unmarked: change it with hunks'))

  # Each line starts with fixed text, so no file name or line from the diff can start one.
  count = sum(map(len, edited.values()))
  report = [f'Upstream: VSCodium {base[:7]}', '', f"Planish's JSON edits: {len(json_edits)}"]
  report += [f'  - {line}' for line in json_edits]
  report += ['', f'Upstream files Planish edits: {count + len(vs_code.keys() | build)}']
  report += [f'  VSCodium files in this repository: {count}']
  for kind, paths in edited.items():
    report += [
      f'    - {kind}: {q(p)}' + (f', from {q(moved[p])}' if p in moved else '') for p in paths]
  report += [f'  VS Code files: {len(vs_code)}']
  for target, (source, n) in sorted(vs_code.items()):
    unfenced = f': {n} lines unfenced (Electron update)' if n else ''
    report += [f'    - {q(target)}, by {q(source)}{unfenced}']
  report += [f'  VS Code files edited at build time: {len(build)}']
  report += [f'    - {q(target)}' for target in sorted(build)]
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
