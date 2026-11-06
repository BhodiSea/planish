// SPDX-License-Identifier: Apache-2.0
// Checks a value against one of Planish's bundled schemas. They use only the keywords below,
// so no JSON Schema library ships, and no $ref can name anything outside the schema.
'use strict';

const KEYWORDS = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description',
  'type', 'properties', 'required', 'additionalProperties', 'items', 'minItems',
  'const', 'enum', 'pattern',
]);

const PATTERN_FIXES = {
  '^[a-z][a-z0-9-]{0,47}$': 'use up to 48 lowercase letters, digits and hyphens, starting with a letter',
  '^([0-9a-f]{40}|[0-9a-f]{64})$': 'give the full commit hash in lowercase hex',
};

const NAMES = {
  object: 'an object', array: 'an array', string: 'a string', integer: 'a whole number',
  number: 'a number', boolean: 'true or false', null: 'null',
};

/** Escapes one JSON Pointer token (RFC 6901). */
function token(key) {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

function typeOf(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (Number.isInteger(value)) {
    return 'integer';
  }
  return typeof value;
}

function resolve(root, ref) {
  const match = /^#\/\$defs\/([a-zA-Z0-9-]+)$/.exec(ref);
  if (!match || !Object.hasOwn(root.$defs || {}, match[1])) {
    throw new Error(`${root.$id}: unsupported $ref ${ref}`);
  }
  return root.$defs[match[1]];
}

/** Throws if a schema uses a keyword or $ref that check() does not implement. */
function assertSupported(schema, root = schema, at = '') {
  for (const [key, value] of Object.entries(schema)) {
    if (!KEYWORDS.has(key)) {
      throw new Error(`${root.$id}${at}: unsupported keyword ${key}`);
    }
    if (key === '$ref') {
      resolve(root, value);
    } else if (key === 'properties' || key === '$defs') {
      for (const [name, sub] of Object.entries(value)) {
        assertSupported(sub, root, `${at}/${key}/${token(name)}`);
      }
    } else if (key === 'items') {
      assertSupported(value, root, `${at}/items`);
    } else if (key === 'additionalProperties' && value !== false) {
      throw new Error(`${root.$id}${at}: additionalProperties must be false`);
    }
  }
}

/** Appends to errors a {pointer, message, fix} for each way value fails schema. */
function check(schema, value, pointer, errors, root = schema) {
  if (schema.$ref) {
    check(resolve(root, schema.$ref), value, pointer, errors, root);
  }
  if ('const' in schema && value !== schema.const) {
    errors.push({ pointer, message: `is ${JSON.stringify(value)}`, fix: `set it to ${JSON.stringify(schema.const)}` });
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ pointer, message: `is ${JSON.stringify(value)}`, fix: `use one of: ${schema.enum.join(', ')}` });
    return;
  }
  const type = typeOf(value);
  if (schema.type && type !== schema.type) {
    errors.push({ pointer, message: `is ${NAMES[type]}`, fix: `make it ${NAMES[schema.type]}` });
    return;
  }
  if (schema.pattern && type === 'string' && !new RegExp(schema.pattern, 'u').test(value)) {
    errors.push({ pointer, message: `is ${JSON.stringify(value)}`, fix: PATTERN_FIXES[schema.pattern] || `match ${schema.pattern}` });
  }
  if (type === 'array') {
    if (schema.minItems && value.length < schema.minItems) {
      errors.push({ pointer, message: 'is empty', fix: 'add at least one item' });
    }
    if (schema.items) {
      value.forEach((item, i) => check(schema.items, item, `${pointer}/${i}`, errors, root));
    }
  }
  if (type === 'object') {
    const properties = schema.properties || {};
    for (const name of schema.required || []) {
      if (!Object.hasOwn(value, name)) {
        errors.push({ pointer: `${pointer}/${token(name)}`, message: 'is missing', fix: `add ${name}` });
      }
    }
    for (const [name, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, name)) {
        check(properties[name], item, `${pointer}/${token(name)}`, errors, root);
      } else if (schema.additionalProperties === false) {
        errors.push({ pointer: `${pointer}/${token(name)}`, message: 'is not a field of this object', fix: `remove it; the fields are ${Object.keys(properties).join(', ')}` });
      }
    }
  }
}

module.exports = { assertSupported, check, token };
