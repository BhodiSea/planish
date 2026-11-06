// SPDX-License-Identifier: Apache-2.0
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const Ajv2020 = require('ajv/dist/2020');

const LESSONS = path.join(__dirname, '..', '..', 'src', 'stable', 'extensions', 'planish-learn', 'src', 'lessons');
const { check } = require(path.join(LESSONS, 'schema.js'));
const { formatErrors, parseLesson, templates, validateLesson, validatePart } = require(path.join(LESSONS, 'validate.js'));
const sample = require('./lesson.json');

const copy = value => structuredClone(value);
const part = id => copy(sample.parts.find(p => p.id === id));
const pointers = errors => errors.map(error => error.pointer);

function lessonWith(change) {
  const lesson = copy(sample);
  change(lesson);
  return validateLesson(lesson);
}

test('the sample lesson, with one part of every template, passes', () => {
  assert.deepEqual(validateLesson(copy(sample)), []);
  assert.deepEqual(new Set(sample.parts.map(p => p.template)), new Set(templates.keys()));
});

test('every error has a JSON Pointer, a message and a fix', () => {
  const errors = lessonWith(lesson => {
    lesson.extra = 1;
    lesson.parts[0].steps[0].line = 'twelve';
    lesson.parts[1].mermaid = 'pie\n  "a": 1';
  });
  assert.ok(errors.length >= 3);
  for (const error of errors) {
    assert.match(error.pointer, /^(\/([^~/]|~[01])*)*$/);
    assert.ok(error.message && error.fix);
  }
  assert.match(formatErrors(errors), /^- \/extra is not a field of this object: remove it; the fields are /);
});

// The schema check agrees with Ajv on each part and on parts broken in each way a schema can tell.
test('the schema check agrees with Ajv', () => {
  const ajv = new Ajv2020({ strict: true });
  for (const good of sample.parts) {
    const schema = templates.get(good.template);
    const validate = ajv.compile(schema);
    const broken = [copy(good), { ...copy(good), unknown: true }, { ...copy(good), id: 'Not An Id' }, { ...copy(good), template: 'x' }];
    for (const field of schema.required) {
      const without = copy(good);
      delete without[field];
      broken.push(without);
    }
    for (const [field, value] of Object.entries(good)) {
      broken.push({ ...copy(good), [field]: typeof value === 'string' ? 1 : 'text' });
    }
    for (const candidate of broken) {
      const errors = [];
      check(schema, candidate, '', errors);
      assert.equal(errors.length === 0, validate(candidate), JSON.stringify(candidate));
    }
  }
});

test('references between parts must name the right part', () => {
  assert.deepEqual(pointers(lessonWith(lesson => { lesson.parts[2].after = ['review']; })), ['/parts/2/after/0']);
  assert.deepEqual(pointers(lessonWith(lesson => { lesson.parts[2].after = ['why-subtract-max']; })), ['/parts/2/after/0']);
  assert.deepEqual(pointers(lessonWith(lesson => { lesson.parts[2].after = ['missing']; })), ['/parts/2/after/0']);
  assert.deepEqual(pointers(lessonWith(lesson => { lesson.parts[2].diagram = 'tour'; })), ['/parts/2/diagram']);
  assert.deepEqual(pointers(lessonWith(lesson => { lesson.parts[4].symbols = 'nothing'; })), ['/parts/4/symbols']);
  assert.deepEqual(pointers(lessonWith(lesson => { lesson.parts[1].id = 'tour'; })), ['/parts/1/id', '/parts/2/diagram']);
});

test('an unknown template or major version is refused with the ids Planish knows', () => {
  const [unknown] = validatePart({ ...part('tour'), template: 'tag:cogveralabs.ai,2026:planish/templates/code-tour/v9' });
  assert.equal(unknown.pointer, '/template');
  assert.equal(unknown.fix, 'use tag:cogveralabs.ai,2026:planish/templates/code-tour/v1');
  const [other] = validatePart({ template: 'quiz', id: 'q' });
  assert.match(other.fix, /^use one of: .*code-station\/v1/);
});

test("a lesson's $schema may only name Planish's lesson schema", () => {
  const errors = lessonWith(lesson => { lesson.$schema = 'https://attacker.example/schema.json'; });
  assert.deepEqual(errors, [{ pointer: '/$schema', message: 'is "https://attacker.example/schema.json"', fix: 'set it to "tag:cogveralabs.ai,2026:planish/lesson/v1"' }]);
});

test('Planish never fetches a remote $schema or loads a network module', () => {
  const script = `
    const Module = require('module');
    const load = Module._load;
    const loaded = [];
    Module._load = function (request, ...rest) { loaded.push(request); return load.call(this, request, ...rest); };
    globalThis.fetch = () => { throw new Error('fetch called'); };
    const { parseLesson } = require(${JSON.stringify(path.join(LESSONS, 'validate.js'))});
    require(${JSON.stringify(path.join(LESSONS, 'store.js'))});
    const lesson = JSON.parse(require('fs').readFileSync(${JSON.stringify(path.join(__dirname, 'lesson.json'))}, 'utf8'));
    lesson.$schema = 'https://attacker.example/schema.json';
    lesson.parts[0].$schema = 'https://attacker.example/part.json';
    const { errors } = parseLesson(JSON.stringify(lesson));
    console.log(JSON.stringify({ loaded, errors: errors.length }));
  `;
  const { loaded, errors } = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }));
  assert.equal(errors, 2);
  const network = loaded.filter(name => /^(node:)?(http|https|http2|net|tls|dgram|dns|undici)(\/|$)/.test(name));
  assert.deepEqual(network, []);
});

test('code stations hold the fields their kind needs, and no other', () => {
  const station = part('fix-overflow');
  assert.deepEqual(validatePart(station), []);
  assert.deepEqual(pointers(validatePart({ ...station, kind: 'predict-output' })), ['/call', '/bug']);
  assert.deepEqual(pointers(validatePart({ ...station, bug: { test: 't' } })), ['/bug']);
  assert.deepEqual(pointers(validatePart({ ...station, bug: { ...station.bug, plantedChange: 'diff' } })), ['/bug']);
  const find = { ...station, kind: 'find-line', symbol: 'softmax' };
  delete find.bug;
  assert.deepEqual(validatePart(find), []);
});

test('diagrams are Mermaid of a known type, without click actions or init directives', () => {
  const diagram = part('flow');
  const mermaid = text => pointers(validatePart({ ...diagram, mermaid: text }));
  assert.deepEqual(mermaid('%% a comment\nsequenceDiagram\n  A->>B: hi'), []);
  assert.deepEqual(mermaid('pie\n  "a": 1'), ['/mermaid']);
  assert.deepEqual(mermaid('flowchart LR\n  a --> b\n  click a "https://attacker.example"'), ['/mermaid']);
  assert.deepEqual(mermaid('%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\n  a --> b'), ['/mermaid']);
});

test('paths stay inside the project, and line ranges run forwards', () => {
  const tour = part('tour');
  for (const file of ['../secret', '/etc/passwd', 'C:/x', 'a\\b', 'a//b', './a']) {
    tour.steps[0].file = file;
    assert.deepEqual(pointers(validatePart(tour)), ['/steps/0/file'], file);
  }
  const explanation = part('why-subtract-max');
  explanation.claims[0].cite = { file: 'a.py', line: 5, endLine: 4 };
  assert.deepEqual(pointers(validatePart(explanation)), ['/claims/0/cite/endLine']);
  explanation.claims[0].cite = { file: 'a.py', line: 0, endLine: 4 };
  assert.deepEqual(pointers(validatePart(explanation)), ['/claims/0/cite/line']);
});

test('text is bounded, not blank, and holds no hidden characters', () => {
  const tour = part('tour');
  assert.deepEqual(pointers(validatePart({ ...tour, title: 'x'.repeat(121) })), ['/title']);
  assert.deepEqual(pointers(validatePart({ ...tour, title: '  ' })), ['/title']);
  const [hidden] = validatePart({ ...tour, title: 'Tour\u202e' });
  assert.equal(hidden.message, 'holds the hidden character U+202E');
  assert.deepEqual(pointers(validatePart({ ...tour, steps: Array(51).fill(tour.steps[0]) })), ['/steps']);
});

test('symbols are listed once', () => {
  const table = part('symbols');
  table.symbols.push(table.symbols[0]);
  assert.deepEqual(pointers(validatePart(table)), ['/symbols/2/symbol']);
});

test('pointers escape ~ and /', () => {
  const [error] = validatePart({ ...part('tour'), 'a/b~c': 1 });
  assert.equal(error.pointer, '/a~1b~0c');
});

test('a file that is not JSON is refused', () => {
  const { lesson, errors } = parseLesson('{"id": ');
  assert.equal(lesson, undefined);
  assert.equal(errors[0].pointer, '');
  assert.deepEqual(parseLesson(JSON.stringify(sample)).errors, []);
});
