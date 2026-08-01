"use strict";

/**
 * In-process EJS source cache for BlessBoard V5 views.
 * Avoids sync readFileSync on every HTML response (not a data/result cache).
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const {
  resolveDeploymentBrand,
} = require("../../platform/config/deploymentBrand");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const TEMPLATE_CACHE = new Map();

/**
 * @param {string} relativePath path under views/blessboard/v5
 * @returns {{ source: string, filename: string }}
 */
function loadV5Template(relativePath) {
  const key = String(relativePath || "");
  if (TEMPLATE_CACHE.has(key)) return TEMPLATE_CACHE.get(key);
  const filename = path.join(VIEWS_ROOT, key);
  const source = fs.readFileSync(filename, "utf8");
  const tpl = { source, filename };
  TEMPLATE_CACHE.set(key, tpl);
  return tpl;
}

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderV5Ejs(relativePath, data) {
  const tpl = loadV5Template(relativePath);
  const locals = Object.assign(
    { deploymentBrand: resolveDeploymentBrand() },
    data || {}
  );
  return ejs.render(tpl.source, locals, { filename: tpl.filename });
}

module.exports = {
  VIEWS_ROOT,
  loadV5Template,
  renderV5Ejs,
};
