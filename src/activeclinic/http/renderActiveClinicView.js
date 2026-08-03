"use strict";

/**
 * Render ActiveClinic EJS views (product-isolated under views/activeclinic).
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "activeclinic");

/**
 * @param {string} relativePath e.g. "app/home.ejs"
 * @param {object} data
 */
function renderActiveClinicView(relativePath, data) {
  const absolute = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(absolute, "utf8");
  return ejs.render(source, data || {}, {
    filename: absolute,
    root: VIEWS_ROOT,
    views: [VIEWS_ROOT],
  });
}

module.exports = {
  renderActiveClinicView,
  VIEWS_ROOT,
};
