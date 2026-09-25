"use strict";

const path = require("path");
const ejs = require("ejs");

const VIEW_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "views",
  "platform",
  "release-notes"
);

/**
 * @param {string} name
 * @param {object} locals
 * @returns {Promise<string>}
 */
function renderReleaseNotesViewAsync(name, locals) {
  const filePath = path.join(VIEW_DIR, `${name}.ejs`);
  return ejs.renderFile(filePath, { ...locals, escapeHtml }, {
    root: VIEW_DIR,
    views: [VIEW_DIR],
    rmWhitespace: false,
  });
}

/**
 * Sync render for handlers that are not async.
 * @param {string} name
 * @param {object} locals
 */
function renderReleaseNotesView(name, locals) {
  const fs = require("fs");
  const filePath = path.join(VIEW_DIR, `${name}.ejs`);
  const template = fs.readFileSync(filePath, "utf8");
  return ejs.render(
    template,
    { ...locals, escapeHtml },
    {
      filename: filePath,
      root: VIEW_DIR,
      views: [VIEW_DIR],
      rmWhitespace: false,
    }
  );
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  renderReleaseNotesView,
  renderReleaseNotesViewAsync,
  escapeHtml,
  VIEW_DIR,
};
