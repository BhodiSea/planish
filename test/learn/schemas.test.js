// SPDX-License-Identifier: Apache-2.0
// The schemas pass the 2020-12 meta-schema, as Claude Code requires of a tool's schema, and
// keep to the shape that strict tool use accepts: no recursion and no root-level union.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Ajv2020 = require('ajv/dist/2020');

const SCHEMAS = path.join(__dirname, '..', '..', 'src', 'stable', 'extensions', 'planish-learn', 'schemas');
const PREFIX = 'tag:cogveralabs.ai,2026:planish/';

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

function refs(value) {
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) => key === '$ref' ? [item] : refs(item));
}

for (const file of files(SCHEMAS)) {
  const relative = path.relative(SCHEMAS, file).split(path.sep).join('/');
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));

  test(`${relative} passes the 2020-12 meta-schema`, () => {
    const ajv = new Ajv2020({ strict: true });
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.ok(ajv.validateSchema(schema), ajv.errorsText());
    ajv.compile(schema);
  });

  test(`${relative} has an $id that carries its path and major version`, () => {
    assert.match(relative, /\/v[0-9]+\.json$/);
    assert.equal(schema.$id, PREFIX + relative.replace(/\.json$/, ''));
    if (relative.startsWith('templates/')) {
      assert.equal(schema.properties.template.const, schema.$id);
    }
  });

  test(`${relative} has an object root with no union, and no recursion`, () => {
    assert.equal(schema.type, 'object');
    for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
      assert.ok(!(keyword in schema), `root-level ${keyword}`);
    }
    const defs = schema.$defs || {};
    for (const ref of refs(schema)) {
      assert.match(ref, /^#\/\$defs\//, 'a $ref outside the schema');
    }
    const cyclic = trail => refs(defs[trail.at(-1)]).some(ref => {
      const next = ref.slice('#/$defs/'.length);
      return trail.includes(next) || cyclic([...trail, next]);
    });
    for (const name of Object.keys(defs)) {
      assert.ok(!cyclic([name]), `$defs/${name} is recursive`);
    }
  });
}
