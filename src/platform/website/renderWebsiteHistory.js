"use strict";

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "platform");
const TEMPLATE = path.join(VIEWS_ROOT, "website", "history.ejs");

const HISTORY_STYLESHEET = "/platform/website-history.css?v=v7-history-1";
const HISTORY_SCRIPT = "/platform/website-history.js?v=v7-history-1";

let cachedSource = null;

function templateSource() {
  if (cachedSource && process.env.NODE_ENV === "production") return cachedSource;
  cachedSource = fs.readFileSync(TEMPLATE, "utf8");
  return cachedSource;
}

/**
 * @param {object} history view model from historyModel.buildHistoryView
 * @returns {string}
 */
function renderWebsiteHistory(history) {
  if (!history || typeof history !== "object") {
    throw new TypeError("renderWebsiteHistory requires a history view model");
  }
  return ejs.render(
    templateSource(),
    { history },
    { filename: TEMPLATE, root: VIEWS_ROOT, views: [VIEWS_ROOT] }
  );
}

module.exports = {
  VIEWS_ROOT,
  TEMPLATE,
  HISTORY_STYLESHEET,
  HISTORY_SCRIPT,
  renderWebsiteHistory,
};
