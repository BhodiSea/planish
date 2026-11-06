# SPDX-License-Identifier: Apache-2.0
"""Propose changes to the allow-list of proposed APIs (issue #7).

Usage: python3 -I dev/allow_list.py [--top N | --ids FILE] [--write]

Takes the Marketplace's N most-installed extensions (default 100), or the IDs in FILE, one per
line, and reads what each declares in enabledApiProposals from its latest manifest on Open VSX,
where Planish installs it from. The allow-list (VSCodium's in product.json, with Planish's
overlay in patches/user/json/product.json) should hold what each declares; proposals it lists
beyond those are left for a person to judge, since Open VSX can hold an older version. Prints
the additions as Markdown for a pull request, and with --write puts them in the overlay, kept
to its differences from VSCodium's list. Planish's built-in extensions come off the list.
"""
import argparse
import glob
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

KEY = 'extensionEnabledApiProposals'
VSCODIUM = 'product.json'
OVERLAY = 'patches/user/json/product.json'
BUILT_IN = 'src/stable/extensions/planish-*/package.json'
GALLERY = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery'
OPEN_VSX = 'https://open-vsx.org/api/'


def request(url, body=None):
  headers = {'Accept': 'application/json;api-version=3.0-preview.1'}
  if body is not None:
    body = json.dumps(body).encode()
    headers['Content-Type'] = 'application/json'
  try:
    with urllib.request.urlopen(urllib.request.Request(url, body, headers), timeout=60) as r:
      return json.load(r)
  except urllib.error.HTTPError as e:
    if e.code == 404:
      return None
    raise


def most_installed(top):
  """The IDs of the Marketplace's top most-installed VS Code extensions, most first."""
  query = {'filters': [{
    'criteria': [{'filterType': 8, 'value': 'Microsoft.VisualStudio.Code'},
                 {'filterType': 12, 'value': '4096'}],  # leave out unpublished ones
    'pageNumber': 1, 'pageSize': top, 'sortBy': 4, 'sortOrder': 0}], 'flags': 0}
  found = request(GALLERY, query)['results'][0]['extensions']
  return [f'{e["publisher"]["publisherName"]}.{e["extensionName"]}' for e in found]


def declared(ext_id, fetch=request):
  """What the latest version of ext_id on Open VSX declares, or None if it is not there."""
  namespace, name = (urllib.parse.quote(part, safe='') for part in ext_id.split('.', 1))
  meta = fetch(f'{OPEN_VSX}{namespace}/{name}')
  manifest = meta and meta.get('files', {}).get('manifest')
  if not manifest:
    return None
  return list((fetch(manifest) or {}).get('enabledApiProposals') or [])


def propose(vscodium, overlay, found, built_in=()):
  """The new overlay and the changes, given VSCodium's list, Planish's overlay of it,
  {ID: proposals declared} for the extensions found, and the built-in extensions' IDs. IDs
  match without regard to case."""
  current = {**vscodium}
  for k, v in overlay.items():
    if v is None:
      current.pop(k, None)
    else:
      current[k] = v
  spelt = {k.casefold(): k for k in [*vscodium, *overlay]}
  changes = []
  for ext_id, names in [*found.items(), *((b, None) for b in built_in)]:
    key = spelt.get(ext_id.casefold(), ext_id)
    now = current.get(key)
    want = None if names is None else [*(now or []), *(n for n in names if n not in (now or []))]
    if (now or None) != (want or None):
      changes.append((key, now, want or None))
      current[key] = want or None
  wanted = {k: v for k, v in current.items() if v is not None}
  new = {k: v for k, v in wanted.items() if set(vscodium.get(k) or ()) != set(v)}
  new.update({k: None for k in vscodium if k not in wanted})
  return new, changes


def report(changes, missing):
  def names(v):
    return ', '.join(f'`{n}`' for n in v) if v else 'none'
  lines = [f'Proposed changes to the allow-list of proposed APIs: {len(changes)}']
  lines += [f'- `{k}`: {names(now)} to {names(want)}' for k, now, want in changes]
  if missing:
    lines += ['', f'Not on Open VSX, so left as they are: {len(missing)}']
    lines += [f'- `{m}`' for m in missing]
  return '\n'.join(lines)


def main():
  parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
  parser.add_argument('--top', type=int, default=100)
  parser.add_argument('--ids', help='a file of extension IDs, one per line')
  parser.add_argument('--write', action='store_true', help=f'put the changes in {OVERLAY}')
  args = parser.parse_args()
  os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

  if args.ids:
    with open(args.ids, encoding='utf-8') as f:
      ids = [line.strip() for line in f if line.strip() and not line.startswith('#')]
  else:
    ids = most_installed(args.top)
  found, missing = {}, []
  for ext_id in ids:
    if '.' not in ext_id:
      sys.exit(f'Not an extension ID: {json.dumps(ext_id)}')
    names = declared(ext_id)
    if names is None:
      missing.append(ext_id)
    else:
      found[ext_id] = names

  built_in = []
  for path in glob.glob(BUILT_IN):
    with open(path, encoding='utf-8') as f:
      manifest = json.load(f)
    built_in.append(f'{manifest["publisher"]}.{manifest["name"]}')
  with open(VSCODIUM, encoding='utf-8') as f:
    vscodium = json.load(f).get(KEY, {})
  with open(OVERLAY, encoding='utf-8') as f:
    product = json.load(f)
  new, changes = propose(vscodium, product.get(KEY, {}), found, built_in)
  print(report(changes, missing))

  if args.write:
    product.pop(KEY, None)
    if new:
      product[KEY] = new
    with open(OVERLAY, 'w', encoding='utf-8') as f:
      f.write(json.dumps(product, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
  try:
    main()
  except OSError as e:  # urllib's errors among them
    sys.exit(f'Could not read the Marketplace or Open VSX: {e}')
