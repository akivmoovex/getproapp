"use strict";

/**
 * Wrap page body HTML in the ActiveClinic app shell layout.
 */

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");
const { renderActiveClinicView, VIEWS_ROOT } = require("./renderActiveClinicView");

/**
 * @param {string} bodyHtml
 * @param {object} shellLocals from buildActiveClinicShellViewModel (+ extras)
 */
function renderActiveClinicShellPage(bodyHtml, shellLocals) {
  const layoutPath = path.join(VIEWS_ROOT, "layouts", "app-shell.ejs");
  const source = fs.readFileSync(layoutPath, "utf8");
  return ejs.render(
    source,
    {
      ...shellLocals,
      shell: shellLocals,
      body: bodyHtml,
      pageHeader: shellLocals.pageHeader,
      breadcrumbs: shellLocals.breadcrumbs,
      flash: shellLocals.flash,
      activeNav: shellLocals.activeNav,
    },
    { filename: layoutPath, root: VIEWS_ROOT, views: [VIEWS_ROOT] }
  );
}

/**
 * Render a content partial then wrap in shell.
 * @param {string} contentRelativePath e.g. "app/home-content.ejs"
 * @param {object} shellLocals
 */
function renderActiveClinicAppPage(contentRelativePath, shellLocals) {
  const body = renderActiveClinicView(contentRelativePath, {
    ...shellLocals,
    shell: shellLocals,
    pageData: shellLocals.pageData || {},
  });
  return renderActiveClinicShellPage(body, shellLocals);
}

module.exports = {
  renderActiveClinicShellPage,
  renderActiveClinicAppPage,
};
