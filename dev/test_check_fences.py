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
FENCED_NPMRC = ('# --- Start Planish ---', 'target="43.7.8"', '# --- End Planish ---')
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


def hunk(path, *added):
  """A patch section adding lines after line 1 of path."""
  plus = ''.join(f'+{line}\n' for line in added)
  return (
    f'diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n'
    f'@@ -1,1 +1,{1 + len(added)} @@\n import x;\n{plus}')


def new_file(path, *added):
  """A patch section creating path with these lines."""
  plus = ''.join(f'+{line}\n' for line in added)
  return (
    f'diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n'
    f'@@ -0,0 +1,{len(added)} @@\n{plus}')


def user_patch(*added, spdx=True):
  return (SPDX if spdx else '') + hunk('src/b.ts', *added)


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
        'env:\n  # --- Start Planish ---\n  APP_NAME: Planish\n  # --- End Planish ---\n'),
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

  def test_rejects_new_file_that_could_replace_a_vs_code_file(self):
    code, out = self.run_check({
      'src/stable/src/vs/code/main.ts': 'x\n',
      'src/stable/extensions/planish-learn/package.json': '{}\n',
      'src/README.md': '# Sources\n',
    })
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out, '- src/stable/src/vs/code/main.ts:1: could replace vscode/src/vs/code/main.ts', 'Errors: 1\n')

  def test_new_files_need_fences_outside_planish_folders(self):
    main = 'src/vs/code/main.ts'
    code, out = self.run_check({
      'patches/user/01-swap.patch': SPDX + (
        f'diff --git a/{main} b/{main}\ndeleted file mode 100644\n--- a/{main}\n+++ /dev/null\n'
        '@@ -1 +0,0 @@\n-start();\n') + new_file(main, 'evil();'),
      'patches/user/02-learn.patch': SPDX + new_file('extensions/planish-learn/a.ts', 'learn();'),
      'patches/01-new.patch': new_file('src/new.ts', 'export const a = 1;', 'export const b = 2;'),
    }, upstream={'patches/01-new.patch': new_file('src/new.ts', 'export const a = 1;')})
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      f'- patches/user/01-swap.patch:13: {main}: line added outside a fence',
      '- patches/01-new.patch:7: src/new.ts: line added outside a fence',
      'Errors: 2\n')

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
      f'- build/checksums/electron.txt, by {ELECTRON}: 2 lines unfenced (Electron update)',
      f'- cgmanifest.json, by {ELECTRON}: 2 lines unfenced (Electron update)',
      f'- .npmrc, by {ELECTRON}\n',
      f'- vscode/cgmanifest.json, by {ELECTRON}\n')
    code, out = self.run_check({
      ELECTRON: electron_patch(
        npmrc=('target="43.7.8"',), sums=SUMS + ('curl -s https://example.invalid',),
        extra=hunk('package.json', '  "electron": "43.7.8",')),
      'patches/user/01-sums.patch': SPDX + hunk('build/checksums/electron.txt', SUMS[0]),
    })
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      f'- {ELECTRON}:8: .npmrc: line added outside a fence\n',
      f'- {ELECTRON}:18: build/checksums/electron.txt: line added outside a fence (comment syntax',
      f'- {ELECTRON}:33: package.json: line added outside a fence (strict JSON',
      '- patches/user/01-sums.patch:7: build/checksums/electron.txt: line added outside a fence',
      'Errors: 4\n')

  def test_rejects_edits_hidden_from_the_diff(self):
    code, out = self.run_check({
      '.gitattributes': '* text=auto eol=lf\n# --- Start Planish ---\n* -diff\n# --- End Planish ---\n',
      'utils.sh': FENCED_SH + 'echo unfenced\n',
      'docs/howto-build.md': '# How to build\n\0',
      'patches/user/02-link.patch': Link('../../docs/other.patch'),
      'patches/user/03-binary.patch': BINARY_PATCH,
    })
    self.assertEqual(code, 1, out)
    self.assert_lines(
      out,
      '- utils.sh:7: line added outside a fence',
      '- docs/howto-build.md:1: upstream text file made binary',
      '- patches/user/02-link.patch:1: a symlink or submodule, which this check cannot read',
      '- patches/user/03-binary.patch:1: git apply reads this patch differently')

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
