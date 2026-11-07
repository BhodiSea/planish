# SPDX-License-Identifier: Apache-2.0
"""Tests for check_fences.py and merge_json.sh. Each check case commits Planish's edits on top
of a small VSCodium-like history in a temporary repository and runs the check against it."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

DEV = os.path.dirname(os.path.abspath(__file__))
ENV = {'PATH': os.environ['PATH'], 'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1'}
SPDX = '# SPDX-License-Identifier: Apache-2.0\n'
VSCODIUM = {
  '.editorconfig': 'root = true\n',
  '.gitattributes': '* text=auto eol=lf\n',
  'README.md': '# VSCodium\n',
  'announcements-extra.json': '[\n  {\n    "title": "Securing VSCodium"\n  }\n]\n',
  'utils.sh': '#!/usr/bin/env bash\n\nAPP_NAME="${APP_NAME:-VSCodium}"\n',
  '.github/workflows/ci.yml': 'env:\n  APP_NAME: VSCodium\n',
  'docs/howto-build.md': '# How to build\n',
  'icons/codium.png': b'\x89PNG\r\n\x1a\n\0old',
  'product.json': '{\n  "a": 1\n}\n',
  'upstream/stable.json': '{\n  "tag": "1.143.1"\n}\n',
  'patches/00-brand.patch': (
    'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n'
    '@@ -1,2 +1,3 @@\n const a = 1;\n+const brand = "!!APP_NAME!!";\n const b = 2;\n'),
}
FENCED_SH = (
  '#!/usr/bin/env bash\n\n# --- Start Planish ---\nAPP_NAME="${APP_NAME:-Planish}"\n'
  '# --- End Planish ---\nAPP_NAME="${APP_NAME:-VSCodium}"\n')
ELECTRON = 'patches/user/00-build-update-electron.patch'
FENCED_NPMRC = ('# --- Start Planish ---', '# target="43.7.7"', 'target="43.7.8"', '# --- End Planish ---')
SUMS = (
  f'{"c" * 64} *chromedriver-v43.7.8-darwin-arm64.zip',
  f'{"d" * 64} *electron-v43.7.8-darwin-arm64.zip')
# Made by git diff --binary: it replaces src/c.ts with "evil();" and holds no "+" line.
BINARY_PATCH = (
  SPDX + 'diff --git a/src/c.ts b/src/c.ts\n'
  'index 587be6b4c3f93f93c489c0111bba5596147a26cb..b97771ab15aa464ee20fefa427ff90312953cf1e 100644\n'
  'GIT binary patch\nliteral 8\nPcmYc-%goWxwB`Z;43`2&\n\nliteral 2\nJcmb>60ssK~0D}Mk\n\n')


class Link(str):
  """A symlink's target, for run_check."""


class Indexed(str):
  """A file's text, for run_check to add to the index only, so its name keeps its case on any
  file system."""


def hunk(path, *added, removed=()):
  """A patch section putting the lines added after line 1 of path, in place of those removed."""
  lines = ''.join(f'-{line}\n' for line in removed) + ''.join(f'+{line}\n' for line in added)
  return (
    f'diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n'
    f'@@ -1,{1 + len(removed)} +1,{1 + len(added)} @@\n import x;\n{lines}')


def new_file(path, *added):
  """A patch section creating path with these lines."""
  plus = ''.join(f'+{line}\n' for line in added)
  return (
    f'diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n'
    f'@@ -0,0 +1,{len(added)} @@\n{plus}')


def user_patch(*added, spdx=True, removed=()):
  return (SPDX if spdx else '') + hunk('src/b.ts', *added, removed=removed)


def electron_patch(npmrc=FENCED_NPMRC, sums=SUMS, extra=''):
  """An Electron update like VSCodium's patches/00-build-update-electron.patch.no."""
  return (
    SPDX + 'diff --git a/.npmrc b/.npmrc\n--- a/.npmrc\n+++ b/.npmrc\n'
    f'@@ -1,3 +1,{2 + len(npmrc)} @@\n disturl="https://electronjs.org/headers"\n-target="43.7.7"\n'
    + ''.join(f'+{line}\n' for line in npmrc) + ' ms_build_id="15743441"\n'
    'diff --git a/build/checksums/electron.txt b/build/checksums/electron.txt\n'
    f'--- a/build/checksums/electron.txt\n+++ b/build/checksums/electron.txt\n@@ -1,2 +1,{len(sums)} @@\n'
    f'-{"a" * 64} *chromedriver-v43.7.7-darwin-arm64.zip\n-{"b" * 64} *electron-v43.7.7-darwin-arm64.zip\n'
    + ''.join(f'+{line}\n' for line in sums)
    + 'diff --git a/cgmanifest.json b/cgmanifest.json\n--- a/cgmanifest.json\n+++ b/cgmanifest.json\n'
    '@@ -1,3 +1,3 @@\n \t"repositoryUrl": "https://github.com/electron/electron",\n'
    f'-\t"commitHash": "{"e" * 40}",\n-\t"tag": "43.7.7"\n+\t"commitHash": "{"f" * 40}",\n+\t"tag": "43.7.8"\n'
    + extra)


class CheckFences(unittest.TestCase):

  def run_check(self, files, upstream=None, env=None):
    """Commit VSCODIUM and upstream, then files on top (None deletes one); run the check."""
    with tempfile.TemporaryDirectory() as repo:
      def git(*args, data=None):
        user = ['-c', 'user.name=test', '-c', 'user.email=test@invalid']
        return subprocess.run(['git', *user, *args], cwd=repo, env=ENV, check=True,
                              capture_output=True, input=data).stdout.decode().strip()

      def commit(changes):
        for path, content in changes.items():
          if isinstance(content, Indexed):
            continue
          full = os.path.join(repo, path)
          if os.path.lexists(full):
            os.remove(full)
          if content is None:
            continue
          os.makedirs(os.path.dirname(full), exist_ok=True)
          if isinstance(content, Link):
            os.symlink(content, full)
            continue
          with open(full, 'wb') as f:
            f.write(content if isinstance(content, bytes) else content.encode())
        git('add', '-A')
        for path, content in changes.items():
          if isinstance(content, Indexed):
            blob = git('hash-object', '-w', '--stdin', data=content.encode())
            git('update-index', '--add', '--cacheinfo', f'100644,{blob},{path}')
        git('commit', '-q', '--no-verify', '--allow-empty', '-m', 'commit')

      git('init', '-q', '-b', 'vscodium')
      commit({**VSCODIUM, **(upstream or {})})
      git('checkout', '-q', '-b', 'main')
      commit(files)
      result = subprocess.run(
        [sys.executable, '-I', os.path.join(DEV, 'check_fences.py'), 'vscodium'],
        cwd=repo, capture_output=True, text=True, env={**ENV, **(env or {})})
      return result.returncode, result.stdout + result.stderr

  def assert_lines(self, out, *lines):
    for line in lines:
      self.assertIn(line, out)

  def test_accepts_fenced_lines_and_lists_edits(self):
    code, out = self.run_check({
      '.editorconfig': (
        'root = true\n\n# --- Start Planish ---\n[LICENSE-APACHE]\nindent_size = unset\n'
        '# --- End Planish ---\n'),
      'utils.sh': FENCED_SH,
      '.github/workflows/ci.yml': (
        'env:\n  # --- Start Planish ---\n  # APP_NAME: VSCodium\n  APP_NAME: Planish\n'
        '  # --- End Planish ---\n'),
      'docs/howto-build.md': (
        '# How to build\n<!-- --- Start Planish --- -->\nPlanish.\n<!-- --- End Planish --- -->\n'),
      'upstream/stable.json': '{\n  "tag": "1.144.0"\n}\n',
      'patches/user/01-learn-view.patch': user_patch(
        '// --- Start Planish ---', 'import y;', '// --- End Planish ---'),
      'patches/user/json/product.json': '{"nameShort": "Planish", "voiceWsUrl": null}\n',
    })
    self.assertEqual(code, 0, out)
    self.assert_lines(
      out,
      '- vscode/product.json, by patches/user/json/product.json: nameShort, -voiceWsUrl',
      '- upstream/stable.json, edited in place: tag',
      'Upstream files Planish edits: 7')

  def test_rejects_unfenced_line_in_upstream_file(self):
    code, out = self.run_check({'utils.sh': FENCED_SH + 'echo unfenced\n\n\u00a0\n'})
    self.assertEqual(code, 1, out)
    self.assert_lines(out, '- utils.sh:7: line added outside a fence', '- utils.sh:9: line added', 'Errors: 2')

  def test_counts_deleted_replaced_and_binary_files(self):
    code, out = self.run_check({
      'docs/howto-build.md': None,
      'README.md': "# Planish\n\nUnfenced, as the whole file is Planish's now.\n",
      'announcements-extra.json': '[]\n',
      'icons/codium.png': b'\x89PNG\r\n\x1a\n\0new',
      'patches/90-remove-agent.json': '[{"action": "remove", "paths": ["extensions/agent"]}]\n',
    })
    self.assertEqual(code, 0, out)
    self.assert_lines(
      out,
      '- announcements-extra.json, replaced whole',
      '- replaced: README.md',
      '- replaced: announcements-extra.json',
      '- binary: icons/codium.png',
      '- deleted: docs/howto-build.md',
      '- extensions/agent, by patches/90-remove-agent.json',
      'Upstream files Planish edits: 5')

  def test_rejects_unfenced_line_in_patch_hunk(self):
    code, out = self.run_check({'patches/user/01-learn-view.patch': user_patch('import y;')})
    self.assertEqual(code, 1, out)
    self.assertIn('- patches/user/01-learn-view.patch:7: src/b.ts: line added outside a fence', out)

  def test_rejects_patch_without_its_spdx_line(self):
    code, out = self.run_check({'patches/user/01-learn-view.patch': user_patch(
      '// --- Start Planish ---', 'import y;', '// --- End Planish ---', spdx=False)})
    self.assertEqual(code, 1, out)
    self.assertIn(
      '- patches/user/01-learn-view.patch:1: a patch of Planish\'s must start with '
      '"# SPDX-License-Identifier: Apache-2.0"', out)

  def test_rejects_marker_in_wrong_syntax_and_open_fence(self):
    code, out = self.run_check({'utils.sh': FENCED_SH.replace('# --- End', '// --- End')})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      '- utils.sh:5: fence marker must read "# --- Start Planish ---" or "# --- End Planish ---"',
      '- utils.sh:3: fence opened but never closed')

  def test_accepts_each_comment_syntax_and_file_type(self):
    jsonc = ('build/tsconfig.build.json', 'build/jsconfig.json', '.vscode/settings.json')
    hashed = ('bin/codium', 'justfile', 'Makefile', 'Dockerfile')
    upstream = {
      'build/a.xml': '<a>\n</a>\n', 'src/a.css': 'a {}\n', 'build/win32/a.iss': '[Setup]\n',
      **{path: '{\n}\n' for path in jsonc}, 'bin/codium': '#!/usr/bin/env sh\n', 'justfile': 'lint:\n',
      'Makefile': 'all:\n', 'Dockerfile': 'FROM scratch\n', '.nvmrc': '24.17.0\n',
    }
    code, out = self.run_check({
      'build/a.xml': '<a>\n<!-- Start Planish -->\n<b/>\n<!-- End Planish -->\n</a>\n',
      'src/a.css': 'a {}\n/* --- Start Planish --- */\nb {}\n/* --- End Planish --- */\n',
      'build/win32/a.iss': '[Setup]\n; --- Start Planish ---\nAppName=Planish\n; --- End Planish ---\n',
      **{path: '{\n  // --- Start Planish ---\n  "a": 1\n  // --- End Planish ---\n}\n' for path in jsonc},
      **{path: upstream[path] + '# --- Start Planish ---\nx\n# --- End Planish ---\n' for path in hashed},
      '.nvmrc': '24.18.0\n',
    }, upstream=upstream)
    self.assertEqual(code, 0, out)
    self.assert_lines(out, '- version pin: .nvmrc', 'Upstream files Planish edits: 11')

  def test_rejects_markers_of_another_syntax(self):
    code, out = self.run_check({
      'build/a.xml': '<a>\n<!-- --- Start Planish --- -->\n<!-- --- End Planish --- -->\n</a>\n',
      'src/a.css': 'a {}\n// --- Start Planish ---\n',
      'build/win32/a.iss': '[Setup]\n# --- Start Planish ---\n',
      'build/tsconfig.json': '{\n  "a": 1\n}\n',
      'notes.txt': 'a\n# --- Start Planish ---\nb\n# --- End Planish ---\n',
    }, upstream={
      'build/a.xml': '<a>\n</a>\n', 'src/a.css': 'a {}\n', 'build/win32/a.iss': '[Setup]\n',
      'build/tsconfig.json': '{\n}\n', 'notes.txt': 'a\n'})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      '- build/a.xml:2: fence marker must read "<!-- Start Planish -->" or "<!-- End Planish -->"',
      '- build/a.xml:3: fence marker must read',
      '- src/a.css:2: fence marker must read "/* --- Start Planish --- */" or "/* --- End Planish --- */"',
      '- build/win32/a.iss:2: fence marker must read "; --- Start Planish ---" or "; --- End Planish ---"',
      '- build/tsconfig.json:2: line added outside a fence\n',
      '- notes.txt:2: fence marker in a file type without known comments',
      '- notes.txt:4: fence marker in a file type without known comments',
      '- notes.txt:3: line added outside a fence (comment syntax unknown: add the file type to EXTENSIONS)',
      'Errors: 8\n')

  def test_accepts_removed_lines_kept_as_comments_in_fences(self):
    remove = 'patches/10-remove.patch'
    code, out = self.run_check({
      'utils.sh': (
        '#!/usr/bin/env bash\n# --- Start Planish ---\n#   APP_NAME="${APP_NAME:-VSCodium}"\n'
        'APP_NAME="${APP_NAME:-Planish}"\n# --- End Planish ---\n'),
      'docs/howto-build.md': (
        '<!-- --- Start Planish --- -->\n<!-- # How to build -->\n# Building Planish\n'
        '<!-- --- End Planish --- -->\n'),
      'patches/user/01-learn-view.patch': user_patch(
        '// --- Start Planish ---', '//  const  a = 1;', '// --- End Planish ---',
        removed=('', 'const a = 1;')),
      'build/a.sh': '# --- Start Planish ---\n# foo\nkeep\nkept\n# --- End Planish ---\n',
      remove: hunk('src/c.ts', removed=('telemetry();',)).replace('@@ -1,2 +1,1 @@', '@@ -4,2 +4,1 @@'),
    }, upstream={remove: hunk('src/c.ts', removed=('telemetry();',)), 'build/a.sh': 'keep\nfoo\nkept\n'})
    self.assertEqual(code, 0, out)

  def test_rejects_removed_lines_not_kept_as_comments_in_fences(self):
    remove = 'patches/10-remove.patch'
    code, out = self.run_check({
      'utils.sh': '#!/usr/bin/env bash\n\n',
      '.github/workflows/ci.yml': (
        'env:\n  # --- Start Planish ---\n  APP_NAME: Planish\n  # --- End Planish ---\n'),
      'build/a.sh': (
        'a\n# --- Start Planish ---\n# foo\n# --- End Planish ---\nb\n'
        '# --- Start Planish ---\n# foo\n# --- End Planish ---\n'),
      'build/b.sh': '# --- Start Planish ---\n# foo\n# --- End Planish ---\na\n',
      'notes.txt': 'b\n',
      'patches/user/01-learn-view.patch': user_patch('let a = 2;', removed=('const a = 1;',)),
      'patches/user/02-swap.patch': SPDX + hunk(
        'src/c.ts', '// --- Start Planish ---', 'let a = 2;', '// --- End Planish ---',
        removed=('const a = 1;',)),
      'patches/user/03-apart.patch': SPDX + (
        'diff --git a/src/d.ts b/src/d.ts\n--- a/src/d.ts\n+++ b/src/d.ts\n@@ -2 +1,0 @@\n-foo();\n'
        '@@ -3,0 +3,3 @@\n+// --- Start Planish ---\n+// foo();\n+// --- End Planish ---\n'),
      remove: hunk('src/c.ts', removed=('telemetry();', 'telemetry();')),
    }, upstream={
      'build/a.sh': 'a\nfoo\nfoo\nb\n', 'build/b.sh': 'a\nfoo\n', 'notes.txt': 'a\nb\n',
      remove: hunk('src/c.ts', removed=('telemetry();',))})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      "- utils.sh:2: VSCodium's line 3 removed outside a fence\n",
      "- .github/workflows/ci.yml:2: VSCodium's line 2 removed but not kept as a comment in its fence",
      "- build/a.sh:2: VSCodium's line 3 removed but not kept as a comment in its fence",
      "- build/b.sh:4: VSCodium's line 2 removed outside a fence\n",
      "- notes.txt:1: VSCodium's line 1 removed outside a fence (comment syntax unknown",
      '- patches/user/01-learn-view.patch:7: src/b.ts: line removed outside a fence\n',
      '- patches/user/01-learn-view.patch:8: src/b.ts: line added outside a fence\n',
      '- patches/user/02-swap.patch:7: src/c.ts: line removed but not kept as a comment in its fence',
      '- patches/user/03-apart.patch:6: src/d.ts: line removed outside a fence\n',
      f'- {remove}:7: src/c.ts: line removed outside a fence\n',
      'Errors: 10\n')

  def test_rejects_strict_json_edited_in_place(self):
    code, out = self.run_check({'product.json': '{\n  "a": 2\n}\n'})
    self.assertEqual(code, 1, out)
    self.assertIn('- product.json:2: line added outside a fence (strict JSON', out)

  def test_vscodium_patch_repair_keeps_its_lines(self):
    repaired = VSCODIUM['patches/00-brand.patch'].replace('@@ -1,2 +1,3 @@', '@@ -4,2 +4,3 @@')
    code, out = self.run_check({'patches/00-brand.patch': repaired})
    self.assertEqual(code, 0, out)
    changed = repaired.replace('+const brand', '+let brand')
    code, out = self.run_check({'patches/00-brand.patch': changed})
    self.assertEqual(code, 1, out)
    self.assertIn('- patches/00-brand.patch:6: src/a.ts: line added outside a fence', out)

  def test_disables_a_vscodium_patch_only_by_renaming_it_unchanged(self):
    brand, other = VSCODIUM['patches/00-brand.patch'], 'patches/01-other.patch'
    code, out = self.run_check(
      {'patches/00-brand.patch': None, 'patches/00-brand.patch.no': brand, other: None},
      upstream={other: brand.replace('a.ts', 'b.ts')})
    self.assertEqual(code, 0, out)
    self.assert_lines(
      out, '- disabled: patches/00-brand.patch\n', f'- deleted: {other}\n', 'Upstream files Planish edits: 2')
    self.assertNotIn('deleted: patches/00-brand.patch', out)
    renamed = 'patches/00-brand.patch.no'
    code, out = self.run_check(
      {'patches/00-brand.patch': None, renamed: brand.replace('const brand', 'let brand')})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out, f'- moved: {renamed}, from patches/00-brand.patch\n',
      f"- {renamed}:4: src/a.ts: VSCodium's line \"const brand",
      f'- {renamed}:6: src/a.ts: line added outside a fence')
    self.assertNotIn('must start with', out)

  def test_checks_a_moved_file_as_an_edit(self):
    moved, lines = 'build/utils.sh', ''.join(f'X{i}=1\n' for i in range(9))
    upstream = {'utils.sh': VSCODIUM['utils.sh'] + lines}
    code, out = self.run_check({'utils.sh': None, moved: FENCED_SH + lines}, upstream=upstream)
    self.assertEqual(code, 0, out)
    self.assert_lines(out, f'- moved: {moved}, from utils.sh\n', 'Upstream files Planish edits: 1')
    self.assertNotIn('deleted: utils.sh', out)
    code, out = self.run_check(
      {'utils.sh': None, moved: upstream['utils.sh'] + 'Y=1\n'}, upstream=upstream)
    self.assertEqual(code, 1, out)
    self.assertIn(f'- {moved}:13: line added outside a fence', out)
    brand, renamed = VSCODIUM['patches/00-brand.patch'], 'patches/user/00-brand.patch'
    code, out = self.run_check({'patches/00-brand.patch': None, renamed: brand})
    self.assertEqual(code, 0, out)
    self.assertIn(f'- moved: {renamed}, from patches/00-brand.patch\n', out)

  def test_vscodium_patch_keeps_the_lines_it_drops(self):
    brand = VSCODIUM['patches/00-brand.patch']
    kept = brand.replace('@@ -1,2 +1,3 @@', '@@ -1,2 +1,5 @@').replace(
      '+const brand = "!!APP_NAME!!";\n',
      '+// --- Start Planish ---\n+// const brand = "!!APP_NAME!!";\n+// --- End Planish ---\n')
    code, out = self.run_check({'patches/00-brand.patch': kept})
    self.assertEqual(code, 0, out)
    gone = brand.replace('@@ -1,2 +1,3 @@', '@@ -1,2 +1,2 @@').replace(
      '+const brand = "!!APP_NAME!!";\n', '')
    for text, error in (
        (gone, "src/a.ts: VSCodium's line \"const brand = \\\"!!APP_NAME!!\\\";\" dropped but not kept"),
        (brand.replace('+const', '+// const'), 'dropped but not kept as a comment in a fence')):
      code, out = self.run_check({'patches/00-brand.patch': text})
      self.assertEqual(code, 1, out)
      self.assertIn(error, out)

  def test_vscodium_patch_keeps_its_removals_and_refuses_drops_it_cannot_keep(self):
    patch = 'patches/01-trim.patch'
    rest = hunk('package.json', '  "x": 1,') + hunk('src/d.css', 'a { b: c; } /* note */')
    vscodium = hunk('src/c.ts', removed=('old();',)) + rest
    readded = hunk(
      'src/c.ts', '// --- Start Planish ---', 'old();', '// --- End Planish ---',
      removed=('old();',)) + rest
    code, out = self.run_check({patch: readded}, upstream={patch: vscodium})
    self.assertEqual(code, 0, out)
    other = hunk('src/e.ts', '// --- Start Planish ---', 'e();', '// --- End Planish ---')
    code, out = self.run_check({patch: other}, upstream={patch: vscodium})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out, "src/c.ts: VSCodium's line \"old();\" dropped but not kept as a comment in a fence",
      'package.json: VSCodium\'s line "\\"x\\": 1," dropped: strict JSON holds no comments, so keep it and change the file in patches/user/json/',
      'src/d.css: VSCodium\'s line "a { b: c; } /* note */" dropped, but it holds "*/"')
    kept = hunk('src/c.ts', removed=('old();',))
    code, out = self.run_check(
      {patch: kept.replace('-old();', ' old();') + rest}, upstream={patch: vscodium})
    self.assertEqual(code, 1, out)
    self.assertIn('VSCodium\'s line "old();" is no longer removed: remove it, and add it back', out)

  def test_vscodium_patch_repair_keeps_a_removal_vs_code_changed(self):
    patch = 'patches/01-trim.patch'
    vscodium = hunk('src/c.ts', removed=('old(a);',))
    repaired = hunk('src/c.ts', '// --- Start Planish ---', '// old(a);', '// --- End Planish ---',
                    removed=('old(a, b);',))
    code, out = self.run_check({patch: repaired}, upstream={patch: vscodium})
    self.assertEqual(code, 1, out)
    self.assertIn('src/c.ts: line removed but not kept as a comment in its fence', out)
    self.assertNotIn('no longer removed', out)
    repaired = hunk('src/c.ts', '// --- Start Planish ---', '// old(a);', '// old(a, b);',
                    '// --- End Planish ---', removed=('old(a, b);',))
    code, out = self.run_check({patch: repaired}, upstream={patch: vscodium})
    self.assertEqual(code, 0, out)
    code, out = self.run_check(
      {patch: hunk('src/c.ts', removed=('old(a, b);',))}, upstream={patch: vscodium})
    self.assertEqual(code, 1, out)
    self.assertIn('VSCodium\'s line "old(a);" dropped but not kept as a comment in a fence', out)

  def test_checks_patch_yet_and_patch_no_files(self):
    yet = 'patches/00-update-disable.patch.yet'
    code, out = self.run_check({
      yet: hunk('src/c.ts', 'disable();', 'more();'),
      'patches/user/01-later.patch.yet': user_patch('import y;'),
      'patches/02-off.patch.no': user_patch(
        '// --- Start Planish ---', 'import y;', '// --- End Planish ---', spdx=False),
    }, upstream={yet: hunk('src/c.ts', 'disable();')})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      f'- {yet}:7: src/c.ts: line added outside a fence',
      '- patches/user/01-later.patch.yet:7: src/b.ts: line added outside a fence',
      "- patches/02-off.patch.no:1: a patch of Planish's must start with",
      'Errors: 3\n')

  def test_rejects_new_file_that_could_replace_a_vs_code_file(self):
    code, out = self.run_check({
      'src/stable/src/vs/code/main.ts': 'x\n',
      'src/stable/extensions/planish-learn/package.json': '{}\n',
      'src/insider/src/vs/base/common/a.ts': 'x\n',
      'src/insider/src/vs/workbench/contrib/planish/learn.ts': 'x\n',
      'src/README.md': '# Sources\n',
    })
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      '- src/stable/src/vs/code/main.ts:1: could replace vscode/src/vs/code/main.ts',
      '- src/insider/src/vs/base/common/a.ts:1: could replace vscode/src/vs/base/common/a.ts',
      'Errors: 2\n')

  def test_new_files_need_fences_outside_planish_folders(self):
    main = 'src/vs/code/main.ts'
    code, out = self.run_check({
      'patches/user/01-delete.patch': SPDX + (
        f'diff --git a/{main} b/{main}\ndeleted file mode 100644\n--- a/{main}\n+++ /dev/null\n'
        '@@ -1 +0,0 @@\n-start();\n'),
      'patches/user/02-create.patch': SPDX + new_file(main, 'evil();'),
      'patches/user/03-learn.patch': SPDX + new_file('extensions/planish-learn/a.ts', 'learn();'),
      'patches/01-new.patch': new_file('src/new.ts', 'export const a = 1;', 'export const b = 2;'),
    }, upstream={'patches/01-new.patch': new_file('src/new.ts', 'export const a = 1;')})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      f'- patches/user/02-create.patch:7: {main}: line added outside a fence',
      f'- patches/user/02-create.patch:1: {main}: deleted by patches/user/01-delete.patch and created again',
      '- patches/01-new.patch:7: src/new.ts: line added outside a fence',
      'Errors: 3\n')

  def test_rejects_files_deleted_then_created_again_however_it_happens(self):
    brand = VSCODIUM['patches/00-brand.patch']
    fenced = ('// --- Start Planish ---', 'evil();', '// --- End Planish ---')
    delete = SPDX + (
      'diff --git a/src/d.ts b/src/d.ts\ndeleted file mode 100644\n--- a/src/d.ts\n+++ /dev/null\n'
      '@@ -1 +0,0 @@\n-start();\n')
    block = '# --- Start Planish ---\ncp -f a.ico src/vs/old/b.ico\n# --- End Planish ---\n'
    code, out = self.run_check({
      'patches/90-remove.json': '[{"action": "remove", "paths": ["src/vs/old/", "src/e.ts"]}]\n',
      'patches/user/01-delete.patch': delete,
      'patches/user/02-create.patch': SPDX + new_file('src/vs/old/a.ts', *fenced)
      + new_file('src/e.ts', *fenced) + new_file('src/vs/older.ts', *fenced),
      'patches/00-brand.patch': brand + new_file('src/d.ts', *fenced)
      + delete[len(SPDX):].replace('d.ts', 'f.ts'),
      'patches/user/03-create.patch': SPDX + new_file('src/f.ts', *fenced),
      'prepare_vscode.sh': '\n' + block,
      'dev/check_build_edits.sh': 'copied src/vs/old/b.ico a.ico x\n',
    }, upstream={'prepare_vscode.sh': '\n'})
    self.assertEqual(code, 1, out)
    again = 'and created again, which drops its lines unmarked'
    self.assert_lines(
      out,
      f'- patches/user/02-create.patch:1: src/vs/old/a.ts: deleted by patches/90-remove.json {again}',
      f'- patches/user/02-create.patch:1: src/e.ts: deleted by patches/90-remove.json {again}',
      f'- patches/00-brand.patch:1: src/d.ts: deleted by patches/user/01-delete.patch {again}',
      f'- patches/user/03-create.patch:1: src/f.ts: deleted by patches/00-brand.patch {again}',
      f'- prepare_vscode.sh:3: src/vs/old/b.ico: deleted by patches/90-remove.json {again}',
      'Errors: 5\n')

  def test_rejects_removed_lines_that_hold_a_comment_closer(self):
    code, out = self.run_check({
      'docs/howto-build.md': (
        '# How to build\n<!-- --- Start Planish --- -->\n<!-- <!-- old --> -->\n'
        '<!-- --- End Planish --- -->\n'),
      'build/a.css': 'a {}\n',
      'build/a.xml': '<a>\n<!-- Start Planish -->\n<!-- <b c="--"/> -->\n<!-- End Planish -->\n</a>\n',
      'build/a.sh': 'a\n',
      'patches/user/01-css.patch': user_patch(removed=('/* end */',)).replace('src/b.ts', 'src/b.css'),
    }, upstream={
      'docs/howto-build.md': '# How to build\n<!-- old -->\n', 'build/a.css': 'a {}\n/* x */\n',
      'build/a.xml': '<a>\n<b c="--"/>\n</a>\n', 'build/a.sh': 'a\n# */\n'})
    self.assertEqual(code, 1, out)
    place = 'so no comment can keep it: leave it in place'
    self.assert_lines(
      out,
      f"- docs/howto-build.md:2: VSCodium's line 2 removed, but it holds \"-->\", {place}",
      f"- build/a.css:1: VSCodium's line 2 removed, but it holds \"*/\", {place}",
      f"- build/a.xml:2: VSCodium's line 2 removed, but it holds \"--\", {place}",
      "- build/a.sh:1: VSCodium's line 2 removed outside a fence\n",
      f'- patches/user/01-css.patch:7: src/b.css: line removed, but it holds "*/", {place}',
      'Errors: 5\n')

  def test_rejects_names_that_differ_only_in_case(self):
    code, out = self.run_check({
      'Patches/user/01-x.patch': Indexed(user_patch('import y;')),
      'utils.sh': None,
      'Utils.sh': Indexed('#!/usr/bin/env bash\necho unfenced\n'),
    })
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      '- Patches:1: differs only in case from patches,',
      '- Utils.sh:1: differs only in case from utils.sh,',
      'Errors: 2\n')

  def test_rejects_malformed_markers_overlays_and_delete_lists(self):
    code, out = self.run_check({
      'utils.sh': (
        '#!/usr/bin/env bash\n\necho evil # --- Start Planish ---\n# --- End Planish ---\n'
        '# --- Start Planish ---\n# --- Start Planish ---\n# --- End Planish ---\n'
        'APP_NAME="${APP_NAME:-VSCodium}"\n\u00a0# --- Start Planish ---\n'),
      'patches/user/json/package.json': '[]\n',
      'patches/90-remove.json': '[{"action": "remove", "paths": "extensions/abc"}]\n',
      'patches/91-remove.json': '[{"action": "remove", "paths": ["../utils.sh"]}]\n',
    })
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      '- utils.sh:3: fence marker must read',
      '- utils.sh:4: fence closed but never opened',
      '- utils.sh:6: fence opened inside a fence',
      '- utils.sh:9: fence marker must read',
      '- patches/user/json/package.json:1: not a JSON object',
      '- patches/90-remove.json:1: not a delete list',
      '- patches/91-remove.json:1: not a delete list',
      'Errors: 7\n')

  def test_electron_exemption_covers_only_its_files_and_lines(self):
    code, out = self.run_check({ELECTRON: electron_patch()})
    self.assertEqual(code, 0, out)
    self.assert_lines(
      out,
      f'- build/checksums/electron.txt, by {ELECTRON}: 4 lines unfenced (Electron update)',
      f'- cgmanifest.json, by {ELECTRON}: 4 lines unfenced (Electron update)',
      f'- .npmrc, by {ELECTRON}\n',
      f'- vscode/cgmanifest.json, by {ELECTRON}\n')
    code, out = self.run_check({
      ELECTRON: electron_patch(
        npmrc=('target="43.7.8"',), sums=SUMS + ('curl -s https://example.invalid',),
        extra=hunk('package.json', '  "electron": "43.7.8",')
        + hunk('build/checksums/electron.txt', removed=('sha',))),
      'patches/user/01-sums.patch': SPDX + hunk('build/checksums/electron.txt', SUMS[0]),
    })
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      f'- {ELECTRON}:7: .npmrc: line removed outside a fence\n',
      f'- {ELECTRON}:8: .npmrc: line added outside a fence\n',
      f'- {ELECTRON}:18: build/checksums/electron.txt: line added outside a fence (comment syntax',
      f'- {ELECTRON}:33: package.json: line added outside a fence (strict JSON',
      f'- {ELECTRON}:39: build/checksums/electron.txt: line removed outside a fence (comment syntax',
      '- patches/user/01-sums.patch:7: build/checksums/electron.txt: line added outside a fence',
      'Errors: 6\n')

  def test_rejects_edits_hidden_from_the_diff(self):
    code, out = self.run_check({
      '.gitattributes': '* text=auto eol=lf\n# --- Start Planish ---\n* -diff\n# --- End Planish ---\n',
      'utils.sh': FENCED_SH + 'echo unfenced\n',
      'docs/howto-build.md': '# How to build\n\0',
      'patches/user/02-link.patch': Link('../../docs/other.patch'),
      'patches/user/03-binary.patch': BINARY_PATCH,
      'patches/user/04-padded.patch': user_patch(removed=('telemetry();',)).replace(
        '@@ -1,2 +1,1 @@', '@@ -0000000001,2 +0000000001,1 @@'),  # git apply reads what HUNK skips
    })
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      '- utils.sh:7: line added outside a fence',
      '- docs/howto-build.md:1: upstream text file made binary',
      '- patches/user/02-link.patch:1: a symlink or submodule, which this check cannot read',
      '- patches/user/03-binary.patch:1: git apply reads this patch differently',
      '- patches/user/04-padded.patch:1: git apply reads this patch differently')

  def test_rejects_patches_that_move_copy_or_change_modes(self):
    def section(header, new='src/b.ts'):
      return (
        f'{SPDX}diff --git a/src/b.ts b/{new}\n{header}--- a/src/b.ts\n+++ b/{new}\n'
        '@@ -1,1 +1,4 @@\n import x;\n+// --- Start Planish ---\n+import y;\n+// --- End Planish ---\n')
    patches = {
      'patches/user/01-rename.patch': section(
        'similarity index 50%\nrename from src/b.ts\nrename to src/c.ts\n', 'src/c.ts'),
      'patches/user/02-move.patch': section('', 'src/c.ts'),
      'patches/user/03-copy.patch': section(
        'similarity index 50%\ncopy from src/b.ts\ncopy to src/c.ts\n', 'src/c.ts'),
      'patches/user/04-mode.patch': section('old mode 100644\nnew mode 100755\n'),
      'patches/user/05-rename-only.patch': (
        f'{SPDX}diff --git a/src/b.ts b/src/c.ts\nsimilarity index 100%\n'
        'rename from src/b.ts\nrename to src/c.ts\n'),
    }
    note = section('').replace(SPDX, SPDX + 'new mode for imports, in words git apply skips\n')
    code, out = self.run_check({**patches, 'patches/user/06-note.patch': note})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out, *(f'- {path}:1: git apply reads this patch differently' for path in patches), 'Errors: 5\n')

  def test_lists_the_vs_code_files_edited_at_build_time(self):
    script, tail = '#!/usr/bin/env bash\n\ncd vscode\nreplace "s|a|b|" vscodium.ts\n', 'cp -f a vscodium.ico\n'
    block = (
      '# --- Start Planish ---\n'
      '# a comment\n'
      '../dev/merge_json.sh\n\n'
      'replace "s|a|b|" build/lib/electron.ts\n'
      "replace 's|c|d|' build/lib/electron.ts\n"
      '  cp -f resources/win32/code.ico "resources/win32/sessions.ico"  # stands in\n'
      'cat ../LICENSE-APACHE >> LICENSE.txt\n'
      '# --- End Planish ---\n')
    named = (
      'expect LICENSE.txt "Apache" "not appended"\n'
      "  expect build/lib/electron.ts 'a' 'b'\n"
      'copied resources/win32/sessions.ico resources/win32/code.ico "not copied"\n')  # once each
    code, out = self.run_check(
      {'prepare_vscode.sh': script + block + tail, 'dev/check_build_edits.sh': named * 2},
      upstream={'prepare_vscode.sh': script + tail})
    self.assertEqual(code, 0, out)
    self.assert_lines(
      out,
      '  VS Code files edited at build time: 3\n'
      '    - LICENSE.txt\n    - build/lib/electron.ts\n    - resources/win32/sessions.ico\n',
      'Upstream files Planish edits: 4')
    broken = block.replace('code.ico "', 'code.ico ').replace(
      'cat ', 'sed -i "s|e|f|" cli/build.rs\ncat ').replace('# --- End', (
        'replace "s|a|b|" cli/build.rs && rm -rf x\n'
        'cp -f a b; echo\n'
        'replace "s|a|$(id)|" src/x.ts\n'
        'cat a > b | tee c\n'
        '# --- End'))
    mentions = '# build/lib/electron.ts\necho build/lib/electron.ts\nexpect\n'  # no checks
    code, out = self.run_check(
      {'prepare_vscode.sh': script + broken, 'dev/check_build_edits.sh': named + mentions},
      upstream={'prepare_vscode.sh': script})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out, '- prepare_vscode.sh:11: replace, cp or cat that this check cannot read',
      '- prepare_vscode.sh:12: a line this check cannot list',
      *(f'- prepare_vscode.sh:{n}: replace, cp or cat that runs another command too' for n in (14, 15, 16, 17)),
      '- prepare_vscode.sh:10: dev/check_build_edits.sh checks build/lib/electron.ts fewer times than',
      'Errors: 7\n')

  def test_untrusted_names_start_no_workflow_command(self):
    name = '::error file=x::boom\n##[warning]a.sh'
    with tempfile.TemporaryDirectory() as tmp:
      summary = os.path.join(tmp, 'summary.md')
      code, out = self.run_check(
        {name: '#!/bin/sh\necho unfenced\n', 'patches/user/::warning::b.patch': user_patch('import y;')},
        upstream={name: '#!/bin/sh\n'}, env={'GITHUB_ACTIONS': 'true', 'GITHUB_STEP_SUMMARY': summary})
      with open(summary, encoding='utf-8') as f:
        lines = f.read().split('\n')
    self.assertEqual(code, 1, out)
    self.assertIn('- "::error file=x::boom\\n\\u0023\\u0023[warning]a.sh":2: line added outside a fence', out)
    commands = [line for line in out.split('\n') if line.lstrip().startswith('::') or '##[' in line]
    self.assertEqual(commands, [
      '::error::line added outside a fence',
      '::error::src/b.ts: line added outside a fence'])
    self.assertEqual([i for i, line in enumerate(lines) if line.startswith('```')], [0, len(lines) - 2])


class MergeJson(unittest.TestCase):

  def test_merges_overlays_as_json_merge_patches(self):
    with tempfile.TemporaryDirectory() as root:
      def write(path, value):
        os.makedirs(os.path.dirname(os.path.join(root, path)), exist_ok=True)
        with open(os.path.join(root, path), 'w', encoding='utf-8') as f:
          json.dump(value, f)

      def merge():
        return subprocess.run(
          ['bash', os.path.join(DEV, 'merge_json.sh')], cwd=os.path.join(root, 'vscode'),
          capture_output=True, text=True, env=ENV)

      write('vscode/product.json', {
        'nameShort': 'Code - OSS', 'voiceWsUrl': 'wss://x', 'gallery': {'serviceUrl': 's', 'old': 1},
        'list': [0, 0]})
      write('patches/user/json/product.json', {
        'nameShort': 'Planish', 'voiceWsUrl': None, 'gallery': {'itemUrl': 'i', 'old': None}, 'list': [1]})
      run = merge()
      self.assertEqual(run.returncode, 0, run.stderr)
      with open(os.path.join(root, 'vscode/product.json'), encoding='utf-8') as f:
        self.assertEqual(json.load(f), {
          'nameShort': 'Planish', 'gallery': {'serviceUrl': 's', 'itemUrl': 'i'}, 'list': [1]})
      write('patches/user/json/resources/missing.json', {'a': 1})
      run = merge()
      self.assertNotEqual(run.returncode, 0)
      self.assertIn('Not found: resources/missing.json', run.stderr)


if __name__ == '__main__':
  unittest.main()
