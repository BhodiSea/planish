<!-- SPDX-License-Identifier: Apache-2.0 -->
# Planish Learn

Planish's learn mode, as a built-in extension. So far it holds the lesson contract ([spec](../../../../docs/spec/agent-integration.md#the-lesson-contract)):

- `schemas/lesson/v1.json`, a lesson: a flat list of parts, shown in order.
- `schemas/templates/<name>/v<major>.json`, one schema for each template and major version, whose `$id` is the template's id. A breaking change gets a new major version in a new file; other changes only add.
- `src/lessons/validate.js`, the validator: `validateLesson(lesson)` and `validatePart(part)` return a list of `{ pointer, message, fix }`, empty when the lesson passes, and `formatErrors` turns that list into lines for the agent that wrote it.
- `src/lessons/store.js`: `writeLesson(folder, lesson)` validates a lesson and writes it to `.planish/lessons/<id>.json`, after listing `.planish/` in git's `info/exclude`.

The schemas use only the keywords in `src/lessons/schema.js`, which checks them. The tests are in `test/learn/`: `npm ci --ignore-scripts && node --test` there.
