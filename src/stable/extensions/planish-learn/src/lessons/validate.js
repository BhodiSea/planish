// SPDX-License-Identifier: Apache-2.0
// Planish's lesson validator: only a lesson it passes may be shown. It checks the lesson and
// each part against their bundled schemas, then what the schemas leave out, and returns each
// error as a JSON Pointer, what is wrong and how to fix it. It never repairs a lesson.
'use strict';

const fs = require('fs');
const path = require('path');
const { assertSupported, check, token } = require('./schema');

const SCHEMAS = path.join(__dirname, '..', '..', 'schemas');
const TEMPLATE_ID = /^tag:cogveralabs\.ai,2026:planish\/templates\/([a-z-]+)\/v([0-9]+)$/;

function load(file) {
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  assertSupported(schema);
  return schema;
}

const lessonSchema = load(path.join(SCHEMAS, 'lesson', 'v1.json'));
const templates = new Map();
for (const name of fs.readdirSync(path.join(SCHEMAS, 'templates')).sort()) {
  for (const file of fs.readdirSync(path.join(SCHEMAS, 'templates', name)).sort()) {
    const schema = load(path.join(SCHEMAS, 'templates', name, file));
    templates.set(schema.$id, schema);
  }
}

const MAX_ITEMS = 50;
const MAX_TEXT = { title: 120, mermaid: 10000, plantedChange: 20000 };
const MAX_TEXT_OTHER = 2000;
// Characters that hide or reorder text (Trojan Source), and control characters but tab and newline.
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁠-⁤⁦-⁩﻿\u{e0000}-\u{e007f}]/u;
const MERMAID_TYPES = new Set(['flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2', 'erDiagram']);
// Fields that name another part, and the template that part must have.
const REFERENCES = {
  explanation: { diagram: 'diagram' },
  'equation-code': { symbols: 'symbol-table' },
};
const STATION_FIELDS = { 'predict-output': 'call', 'find-line': 'symbol', 'fix-bug': 'bug' };

function templateName(id) {
  const match = TEMPLATE_ID.exec(id);
  return match ? match[1] : undefined;
}

function badPath(file) {
  return file.includes('\\') || /^[a-zA-Z]:/.test(file)
    || file.split('/').some(segment => segment === '' || segment === '.' || segment === '..');
}

/** Checks every string, list, path and line range under value; these need no schema. */
function walk(value, pointer, errors, key) {
  if (typeof value === 'string') {
    const max = MAX_TEXT[key] || MAX_TEXT_OTHER;
    const hidden = HIDDEN.exec(value);
    if (!value.trim()) {
      errors.push({ pointer, message: 'is empty', fix: 'write it, or leave the field out if it is optional' });
    } else if (value.length > max) {
      errors.push({ pointer, message: `has ${value.length} characters`, fix: `shorten it to ${max} at most` });
    }
    if (hidden) {
      const code = hidden[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      errors.push({ pointer, message: `holds the hidden character U+${code}`, fix: 'remove it' });
    }
    if (key === 'file' && badPath(value)) {
      errors.push({ pointer, message: `is ${JSON.stringify(value)}`, fix: "give a path relative to the project's root, with forward slashes and no . or .. parts" });
    }
  } else if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS) {
      errors.push({ pointer, message: `has ${value.length} items`, fix: `keep it to ${MAX_ITEMS} at most` });
    }
    value.forEach((item, i) => walk(item, `${pointer}/${i}`, errors));
  } else if (value && typeof value === 'object') {
    if (Number.isInteger(value.line) && value.line < 1) {
      errors.push({ pointer: `${pointer}/line`, message: `is ${value.line}`, fix: 'count lines from 1' });
    }
    if (Number.isInteger(value.line) && Number.isInteger(value.endLine) && value.endLine < value.line) {
      errors.push({ pointer: `${pointer}/endLine`, message: `is before line ${value.line}`, fix: 'make endLine the last line, at or after line' });
    }
    for (const [name, item] of Object.entries(value)) {
      walk(item, `${pointer}/${token(name)}`, errors, name);
    }
  }
}

function checkMermaid(text, pointer, errors) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'));
  const type = lines.length ? lines[0].split(/\s/)[0] : '';
  if (!MERMAID_TYPES.has(type)) {
    errors.push({ pointer, message: `starts with ${JSON.stringify(type)}`, fix: `start with one of: ${[...MERMAID_TYPES].join(', ')}` });
  }
  if (text.includes('%%{')) {
    errors.push({ pointer, message: 'holds an init directive (%%{...}%%)', fix: 'remove it; Planish sets how diagrams are drawn' });
  }
  if (lines.some(line => /^(click|link|callback)\s/.test(line))) {
    errors.push({ pointer, message: 'holds a click action', fix: 'remove it; diagrams in lessons do not link or run code' });
  }
}

function checkStation(part, pointer, errors) {
  const wanted = STATION_FIELDS[part.kind];
  for (const [kind, field] of Object.entries(STATION_FIELDS)) {
    if (field === wanted && !Object.hasOwn(part, field)) {
      errors.push({ pointer: `${pointer}/${field}`, message: 'is missing', fix: `add ${field}, which a ${kind} station needs` });
    } else if (field !== wanted && Object.hasOwn(part, field)) {
      errors.push({ pointer: `${pointer}/${field}`, message: `is only for a ${kind} station`, fix: 'remove it' });
    }
  }
  if (part.bug && Object.hasOwn(part.bug, 'fixCommit') === Object.hasOwn(part.bug, 'plantedChange')) {
    errors.push({ pointer: `${pointer}/bug`, message: 'needs exactly one of fixCommit and plantedChange', fix: 'give the commit that fixed a real bug, or a change that plants one' });
  }
}

function checkSymbols(part, pointer, errors) {
  const seen = new Map();
  part.symbols.forEach((entry, i) => {
    if (seen.has(entry.symbol)) {
      errors.push({ pointer: `${pointer}/symbols/${i}/symbol`, message: `repeats symbols/${seen.get(entry.symbol)}`, fix: 'list each symbol once' });
    } else {
      seen.set(entry.symbol, i);
    }
  });
}

/** Validates one part of a lesson, as the lesson server's tool for its template does. */
function validatePart(part, pointer = '') {
  const errors = [];
  const id = part && typeof part === 'object' ? part.template : undefined;
  const schema = templates.get(id);
  if (!schema) {
    const known = [...templates.keys()];
    const name = typeof id === 'string' ? templateName(id) : undefined;
    const same = known.filter(other => templateName(other) === name);
    errors.push({
      pointer: `${pointer}/template`,
      message: id === undefined ? 'is missing' : `is ${JSON.stringify(id)}, which Planish does not know`,
      fix: same.length ? `use ${same.join(' or ')}` : `use one of: ${known.join(', ')}`,
    });
    return errors;
  }
  check(schema, part, pointer, errors);
  walk(part, pointer, errors);
  if (errors.length) {
    return errors;
  }
  const name = templateName(id);
  if (name === 'diagram') {
    checkMermaid(part.mermaid, `${pointer}/mermaid`, errors);
  } else if (name === 'code-station') {
    checkStation(part, pointer, errors);
  } else if (name === 'symbol-table') {
    checkSymbols(part, pointer, errors);
  }
  return errors;
}

/** Validates a parsed lesson: the envelope, each part, then the references between parts. */
function validateLesson(lesson) {
  const errors = [];
  check(lessonSchema, lesson, '', errors);
  if (!lesson || typeof lesson !== 'object' || !Array.isArray(lesson.parts)) {
    return errors;
  }
  const { parts, ...envelope } = lesson;
  walk(envelope, '', errors);
  if (parts.length > MAX_ITEMS) {
    errors.push({ pointer: '/parts', message: `has ${parts.length} parts`, fix: `split the lesson, or keep it to ${MAX_ITEMS} parts at most` });
  }

  const index = new Map();
  parts.forEach((part, i) => {
    const pointer = `/parts/${i}`;
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      return;
    }
    for (const error of validatePart(part, pointer)) {
      if (!errors.some(other => other.pointer === error.pointer && other.message === error.message)) {
        errors.push(error);
      }
    }
    if (typeof part.id !== 'string') {
      return;
    }
    if (index.has(part.id)) {
      errors.push({ pointer: `${pointer}/id`, message: `is also the id of /parts/${index.get(part.id)}`, fix: 'give each part its own id' });
    } else {
      index.set(part.id, i);
    }
  });

  parts.forEach((part, i) => {
    if (!part || typeof part !== 'object') {
      return;
    }
    const pointer = `/parts/${i}`;
    if (Array.isArray(part.after)) {
      part.after.forEach((ref, j) => {
        if (typeof ref === 'string' && !(index.get(ref) < i)) {
          errors.push({
            pointer: `${pointer}/after/${j}`,
            message: index.has(ref) ? `names ${index.get(ref) === i ? 'this part' : 'a later part'}` : 'names no part of this lesson',
            fix: 'name only parts that come before this one',
          });
        }
      });
    }
    for (const [field, wanted] of Object.entries(REFERENCES[templateName(part.template)] || {})) {
      const ref = part[field];
      if (typeof ref !== 'string') {
        continue;
      }
      const target = parts[index.get(ref)];
      if (!target) {
        errors.push({ pointer: `${pointer}/${field}`, message: 'names no part of this lesson', fix: `name a ${wanted} part, or leave ${field} out` });
      } else if (templateName(target.template) !== wanted) {
        errors.push({ pointer: `${pointer}/${field}`, message: `names a ${templateName(target.template) || 'part'} part`, fix: `name a ${wanted} part` });
      }
    }
  });
  return errors;
}

/** Parses and validates a lesson file's text. */
function parseLesson(text) {
  let lesson;
  try {
    lesson = JSON.parse(text);
  } catch (error) {
    return { lesson: undefined, errors: [{ pointer: '', message: `is not JSON (${error.message})`, fix: 'write the lesson as one JSON object' }] };
  }
  return { lesson, errors: validateLesson(lesson) };
}

/** The errors as lines for the agent that wrote the lesson. */
function formatErrors(errors) {
  return errors.map(({ pointer, message, fix }) => `- ${pointer || 'The lesson'} ${message}: ${fix}.`).join('\n');
}

module.exports = { formatErrors, parseLesson, templates, validateLesson, validatePart };
