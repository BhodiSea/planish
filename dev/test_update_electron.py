# SPDX-License-Identifier: Apache-2.0
"""Tests for update_electron.py: the patch it writes applies and passes the fence check."""
import os
import subprocess
import sys
import tempfile
import unittest

DEV = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DEV)
import check_fences  # noqa: E402
import update_electron  # noqa: E402

COMMIT = 'e' * 40
FILES = {
  '.npmrc': 'disturl="https://electronjs.org/headers"\ntarget="43.7.7"\nms_build_id="15743441"\n',
  'build/checksums/electron.txt': (
    f'{"a" * 64} *chromedriver-v43.7.7-darwin-arm64.zip\n{"b" * 64} *electron-api.json\n'
    f'{"c" * 64} *electron-v43.7.7-darwin-arm64.zip\n{"d" * 64} *hunspell_dictionaries.zip\n'),
  'cgmanifest.json': (
    '{\n\t"registrations": [\n\t\t{\n\t\t\t"component": {\n\t\t\t\t"git": {\n'
    '\t\t\t\t\t"name": "node",\n\t\t\t\t\t"commitHash": "' + 'f' * 40 + '",\n'
    '\t\t\t\t\t"tag": "43.7.7"\n\t\t\t\t}\n\t\t\t},\n\t\t\t"version": "43.7.7"\n\t\t},\n'
    '\t\t{\n\t\t\t"component": {\n\t\t\t\t"git": {\n\t\t\t\t\t"name": "electron",\n'
    '\t\t\t\t\t"repositoryUrl": "https://github.com/electron/electron",\n'
    '\t\t\t\t\t"commitHash": "' + '0' * 40 + '",\n\t\t\t\t\t"tag": "43.7.7"\n'
    '\t\t\t\t}\n\t\t\t},\n\t\t\t"license": "MIT",\n\t\t\t"version": "43.7.7"\n\t\t}\n\t]\n}\n'),
}
SHASUMS = (
  f'{"1" * 64} *chromedriver-v43.7.11-darwin-arm64.zip\n{"b" * 64} *electron-api.json\n'
  f'{"2" * 64} *electron-v43.7.11-darwin-arm64.zip\n{"3" * 64} *electron-v43.7.11-linux-x64.zip\n'
  f'{"d" * 64} *hunspell_dictionaries.zip\n')


class UpdateElectron(unittest.TestCase):

  def test_the_patch_applies_and_passes_the_fence_check(self):
    self.assertIn('43.8.0', update_electron.patch(FILES, '43.8.0', SHASUMS.replace('43.7.11', '43.8.0'), COMMIT))
    patch = update_electron.patch(FILES, '43.7.11', SHASUMS, COMMIT)
    with tempfile.TemporaryDirectory() as tree:
      for path, text in FILES.items():
        os.makedirs(os.path.join(tree, os.path.dirname(path)), exist_ok=True)
        with open(os.path.join(tree, path), 'w') as f:
          f.write(text)
      subprocess.run(['git', 'apply', '-'], cwd=tree, input=patch.encode(), check=True)

      def read(path):
        with open(os.path.join(tree, path)) as f:
          return f.read()

      self.assertEqual(read('.npmrc'), (
        'disturl="https://electronjs.org/headers"\n# --- Start Planish ---\n# target="43.7.7"\n'
        'target="43.7.11"\n# --- End Planish ---\nms_build_id="15743441"\n'))
      self.assertEqual(read('build/checksums/electron.txt'), (
        f'{"1" * 64} *chromedriver-v43.7.11-darwin-arm64.zip\n{"b" * 64} *electron-api.json\n'
        f'{"2" * 64} *electron-v43.7.11-darwin-arm64.zip\n{"d" * 64} *hunspell_dictionaries.zip\n'))
      manifest = read('cgmanifest.json')
      self.assertEqual(manifest.count('43.7.11'), 2)
      self.assertEqual(manifest.count('43.7.7'), 2)  # the other component's
      self.assertIn(f'"commitHash": "{COMMIT}"', manifest)
    errors, changed, whole = check_fences.check_patch(update_electron.PATCH, patch.encode())
    self.assertEqual(errors, [])
    self.assertEqual(changed, {'.npmrc': 0, 'build/checksums/electron.txt': 4,
                               'cgmanifest.json': 6})
    self.assertEqual(whole, set())

  def test_refuses_other_versions_and_missing_files(self):
    for version in ('43.7.6', '43.7.7', '44.0.0'):
      with self.assertRaisesRegex(ValueError, 'not a newer release'):
        update_electron.patch(FILES, version, SHASUMS, COMMIT)
    with self.assertRaisesRegex(ValueError, 'publishes no electron-v43.7.11-darwin-arm64.zip'):
      update_electron.patch(FILES, '43.7.11', SHASUMS.replace('electron-v43.7.11-darwin', 'x'),
                            COMMIT)


if __name__ == '__main__':
  unittest.main()
