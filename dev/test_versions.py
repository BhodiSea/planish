# SPDX-License-Identifier: Apache-2.0
"""Tests for versions.py."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

DEV = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DEV)
import versions  # noqa: E402

SHA = 'a' * 64
REPO = 'BhodiSea/planish'
HOUR = 60 * 60 * 1000


def release(tag='1.143.10123', at='2026-11-07T10:00:00Z', body='', draft=False, pre=False):
  return {'tagName': tag, 'publishedAt': at, 'body': body, 'isDraft': draft, 'isPrerelease': pre}


class Versions(unittest.TestCase):

  def test_fields_match_vscodiums(self):
    data = versions.versions(release(), SHA, REPO)
    self.assertEqual(data, {
      'url': 'https://github.com/BhodiSea/planish/releases/download/1.143.10123/'
             'Planish-darwin-arm64-1.143.10123.zip',
      'name': '1.143.10123',
      'version': '7129d48f20816438cbd7ecea1426f4098a2962ba',  # echo 1.143.10123 | sha1sum
      'productVersion': '1.143.10123.0',
      'timestamp': 1794045600000,
      'sha256hash': SHA,
      'securityFix': False,
    })

  def test_drafts_and_pre_releases_are_not_offered(self):
    self.assertIsNone(versions.versions(release(draft=True), SHA, REPO))
    self.assertIsNone(versions.versions(release(pre=True), SHA, REPO))

  def test_a_line_starting_security_fix_marks_one(self):
    marked = release(body='Planish 1.143.10123.\r\nSecurity fix: Chromium CVE-2026-0001.\r\n')
    self.assertTrue(versions.versions(marked, SHA, REPO)['securityFix'])
    for body in ('No security fix: this time.', 'security fix: lower case', None):
      self.assertFalse(versions.versions(release(body=body), SHA, REPO)['securityFix'], body)

  def test_a_release_replacing_a_waiting_security_fix_is_one_too(self):
    fix = versions.versions(release(body='Security fix: yes'), SHA, REPO)
    soon = release('1.143.10124', '2026-11-12T09:59:59Z')
    later = release('1.143.10124', '2026-11-12T10:00:00Z')
    self.assertTrue(versions.versions(soon, SHA, REPO, fix)['securityFix'])
    self.assertFalse(versions.versions(later, SHA, REPO, fix)['securityFix'])
    rerun = versions.versions(release(at='2026-11-07T11:00:00Z'), SHA, REPO, fix)
    self.assertFalse(rerun['securityFix'])  # the same release, its mark since removed

  def test_an_older_release_does_not_replace_a_newer_one(self):
    newer = versions.versions(release('1.144.1'), SHA, REPO)
    with self.assertRaisesRegex(ValueError, '1.144.1 is newer than 1.143.10123'):
      versions.versions(release(), SHA, REPO, newer)
    self.assertEqual(versions.versions(release('1.144.10'), SHA, REPO, newer)['name'], '1.144.10')

  def test_main_writes_the_file_or_nothing(self):
    with tempfile.TemporaryDirectory() as tmp:
      def run(rel, *extra):
        paths = [os.path.join(tmp, name) for name in ('release.json', 'sum', 'latest.json')]
        with open(paths[0], 'w') as f:
          json.dump(rel, f)
        with open(paths[1], 'w') as f:
          f.write(f'{SHA}  Planish-darwin-arm64-{rel["tagName"]}.zip\n')
        env = {'PATH': os.environ['PATH'], 'GITHUB_REPOSITORY': REPO}
        return subprocess.run([sys.executable, '-I', '-B', os.path.join(DEV, 'versions.py'),
                               *paths, *extra], env=env, capture_output=True, text=True)

      out = os.path.join(tmp, 'latest.json')
      self.assertEqual(run(release(pre=True)).returncode, 0)
      self.assertFalse(os.path.exists(out))
      self.assertEqual(run(release()).returncode, 0)
      with open(out) as f:
        self.assertEqual(json.load(f)['sha256hash'], SHA)
      os.rename(out, os.path.join(tmp, 'previous.json'))
      old = run(release('1.143.1'), os.path.join(tmp, 'previous.json'))
      self.assertEqual(old.returncode, 1)
      self.assertEqual(old.stderr, '1.143.10123 is newer than 1.143.1, so it stays the one offered\n')


if __name__ == '__main__':
  unittest.main()
