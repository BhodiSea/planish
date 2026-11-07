# SPDX-License-Identifier: Apache-2.0
"""Reads and writes the app's stored state, a SQLite file (state.vscdb), for the tests here.

Usage: python3 -I test/smoke/state.py get DB KEY...   prints {key: value or null} as JSON
       python3 -I test/smoke/state.py set DB KEY VALUE creates DB as the app does if missing
"""
import json
import sqlite3
import sys


def main(command, db, *args):
  with sqlite3.connect(db) as connection:
    if command == 'set':
      connection.execute('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)')
      connection.execute('INSERT INTO ItemTable (key, value) VALUES (?, ?)', args)
      return
    rows = dict(connection.execute(f'SELECT key, value FROM ItemTable WHERE key IN ({",".join("?" * len(args))})', args))
  text = {key: value.decode() if isinstance(value, bytes) else value for key, value in rows.items()}
  print(json.dumps({key: text.get(key) for key in args}, indent=2, sort_keys=True))


if __name__ == '__main__':
  main(*sys.argv[1:])
