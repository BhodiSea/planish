# SPDX-License-Identifier: Apache-2.0
"""Write the versions file that the app's updater reads for a published release (issue #56).

Usage: python3 -I -B dev/versions.py RELEASE_JSON SHA256_FILE OUT [PREVIOUS_JSON]

RELEASE_JSON is `gh release view --json tagName,publishedAt,body,isDraft,isPrerelease`;
SHA256_FILE is the release's .sha256 file for the macOS zip; PREVIOUS_JSON is the versions
file being replaced, if any. Writes nothing for a draft or a pre-release. The fields are those
of VSCodium's update_version.sh, which VSCodium's patches 11 and 12 read, and securityFix, which
Planish's patches/user/30-update-let-security-fixes-through.patch reads: a release is a security
fix when a line of its notes starts "Security fix:". A release that replaces a security fix still
inside the wait is offered at once too, or it would hold that fix back.
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime

APP = 'Planish'
WAIT_MS = 120 * 60 * 60 * 1000  # update.minReleaseAge's default, in VSCodium's patch 12
MARK = re.compile(r'^Security fix:', re.M)
VERSION = re.compile(r'(\d+)\.(\d+)\.(\d+)')


def product_version(tag):
  """update_version.sh's transformVersion: 1.143.10123 is 1.143.10123.0."""
  m = VERSION.fullmatch(tag)
  if not m:
    raise ValueError(f'{tag!r} is not a release tag')
  return '.'.join(str(int(part)) for part in m.groups()) + '.0'


def numbers(version):
  return tuple(map(int, VERSION.match(version).groups()))


def versions(release, sha256, repo, previous=None):
  """The versions file for a release, or None for a draft or pre-release."""
  if release['isDraft'] or release['isPrerelease']:
    return None
  tag = release['tagName']
  current = product_version(tag)
  published = datetime.fromisoformat(release['publishedAt'].replace('Z', '+00:00'))
  timestamp = int(published.timestamp() * 1000)
  security = bool(MARK.search(release['body'] or ''))
  if previous and previous['name'] != tag:
    if numbers(previous['productVersion']) > numbers(current):
      raise ValueError(f'{previous["name"]} is newer than {tag}, so it stays the one offered')
    held = previous.get('securityFix') is True and timestamp - int(previous['timestamp']) < WAIT_MS
    security = security or held
  return {
    'url': f'https://github.com/{repo}/releases/download/{tag}/{APP}-darwin-arm64-{tag}.zip',
    'name': tag,
    'version': hashlib.sha1(f'{tag}\n'.encode()).hexdigest(),  # version.sh's BUILD_SOURCEVERSION
    'productVersion': current,
    'timestamp': timestamp,
    'sha256hash': sha256,
    'securityFix': security,
  }


def main():
  if len(sys.argv) not in (4, 5):
    sys.exit(__doc__.split('\n\n')[1])
  with open(sys.argv[1]) as f:
    release = json.load(f)
  with open(sys.argv[2]) as f:
    sha256 = f.read().split()[0]
  if not re.fullmatch(r'[0-9a-f]{64}', sha256):
    sys.exit(f'{sys.argv[2]} holds no SHA-256 checksum')
  previous = None
  if len(sys.argv) == 5:
    with open(sys.argv[4]) as f:
      previous = json.load(f)
  try:
    data = versions(release, sha256, os.environ['GITHUB_REPOSITORY'], previous)
  except ValueError as e:
    sys.exit(str(e))
  if data is None:
    print(f'{release["tagName"]} is a draft or pre-release: no versions file written')
    return
  with open(sys.argv[3], 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
  print(json.dumps(data, indent=2))


if __name__ == '__main__':
  main()
