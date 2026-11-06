# SPDX-License-Identifier: Apache-2.0
"""Tests for allow_list.py, without the network."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import allow_list  # noqa: E402

VSCODIUM = {'ms-python.python': ['terminalShellEnv'], 'GitHub.copilot': ['chatProvider'],
            'openai.chatgpt': ['chatSessionsProvider', 'languageModelProxy']}


class Propose(unittest.TestCase):
  def test_matching_list_needs_no_overlay(self):
    new, changes = allow_list.propose(VSCODIUM, {}, {
      'openai.chatgpt': ['chatSessionsProvider', 'languageModelProxy']})
    self.assertEqual((new, changes), ({}, []))

  def test_adds_an_extension(self):
    new, changes = allow_list.propose(VSCODIUM, {}, {'a.b': ['css']})
    self.assertEqual(new, {'a.b': ['css']})
    self.assertEqual(changes, [('a.b', None, ['css'])])

  def test_changes_an_entry_with_vscodium_spelling(self):
    new, changes = allow_list.propose(VSCODIUM, {}, {'github.copilot': ['chatProvider', 'x']})
    self.assertEqual(new, {'GitHub.copilot': ['chatProvider', 'x']})
    self.assertEqual(changes, [('GitHub.copilot', ['chatProvider'], ['chatProvider', 'x'])])

  def test_keeps_proposals_no_longer_declared_in_any_order(self):
    new, changes = allow_list.propose(VSCODIUM, {}, {
      'ms-python.python': [], 'openai.chatgpt': ['languageModelProxy', 'chatSessionsProvider']})
    self.assertEqual((new, changes), ({}, []))

  def test_takes_built_in_extensions_off(self):
    new, changes = allow_list.propose(VSCODIUM, {'planish.planish-learn': ['css']}, {},
                                      ['Planish.planish-learn', 'planish.planish-paper'])
    self.assertEqual((new, changes), ({}, [('planish.planish-learn', ['css'], None)]))

  def test_keeps_other_entries_and_drops_redundant_ones(self):
    overlay = {'c.d': ['tunnels'], 'GitHub.copilot': ['chatProvider'], 'openai.chatgpt': None}
    new, changes = allow_list.propose(VSCODIUM, overlay, {'e.f': []})
    self.assertEqual(new, {'c.d': ['tunnels'], 'openai.chatgpt': None})
    self.assertEqual(changes, [])

  def test_undoes_a_removal_declared_again(self):
    new, changes = allow_list.propose(VSCODIUM, {'ms-python.python': None},
                                      {'ms-python.python': ['terminalShellEnv']})
    self.assertEqual((new, changes), ({}, [('ms-python.python', None, ['terminalShellEnv'])]))


class Declared(unittest.TestCase):
  def fetch(self, pages):
    return lambda url: pages.get(url)

  def test_not_on_open_vsx(self):
    self.assertIsNone(allow_list.declared('a.b', self.fetch({})))

  def test_reads_the_manifest(self):
    manifest = 'https://example.test/package.json'
    pages = {allow_list.OPEN_VSX + 'a/b': {'files': {'manifest': manifest}}}
    pages[manifest] = {'enabledApiProposals': ['css']}
    self.assertEqual(allow_list.declared('a.b', self.fetch(pages)), ['css'])
    pages[manifest] = {}
    self.assertEqual(allow_list.declared('a.b', self.fetch(pages)), [])


class Report(unittest.TestCase):
  def test_lists_changes_and_missing(self):
    text = allow_list.report([('a.b', None, ['css', 'x'])], ['ms-vscode.cpptools'])
    self.assertEqual(text, (
      'Proposed changes to the allow-list of proposed APIs: 1\n'
      '- `a.b`: none to `css`, `x`\n\n'
      'Not on Open VSX, so left as they are: 1\n- `ms-vscode.cpptools`'))


if __name__ == '__main__':
  unittest.main()
