"use strict";

/**
 * Alias entrypoint for historical npm script test:church:pilot-smoke.
 * Canonical suite: tests/church-foundation-growth-regression.test.js
 *
 * This file intentionally does not register duplicate journeys when `npm test`
 * discovers both files. Use the regression suite (or the npm scripts below).
 */
const test = require("node:test");

test("pilot-smoke alias: use church-foundation-growth-regression.test.js", { skip: "Canonical suite is church-foundation-growth-regression.test.js (npm run test:church:regression)" }, () => {});
