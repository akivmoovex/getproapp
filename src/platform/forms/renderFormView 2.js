"use strict";

const ejs = require("ejs");
const path = require("path");
const fs = require("fs");

const VIEWS_ROOT = path.join(__dirname, "../../../views/platform/forms");

function renderFormView(viewName, locals) {
  const layoutPath = path.join(VIEWS_ROOT, "layout.ejs");
  const bodyPath = path.join(VIEWS_ROOT, `${viewName}.ejs`);
  if (!fs.existsSync(bodyPath)) {
    throw new Error(`form view missing: ${viewName}`);
  }
  const body = ejs.render(fs.readFileSync(bodyPath, "utf8"), locals, {
    filename: bodyPath,
  });
  return ejs.render(
    fs.readFileSync(layoutPath, "utf8"),
    { ...locals, body },
    { filename: layoutPath }
  );
}

module.exports = {
  VIEWS_ROOT,
  renderFormView,
};
