"use strict";

/**
 * Wrap page body HTML in the ActiveClinic app shell layout.
 */

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");
const { issueCsrfToken, setCsrfCookie } = require("../../platform/http/v5Csrf");
const {
  buildActiveClinicShellViewModel,
} = require("../services/buildActiveClinicShellViewModel");
const { renderActiveClinicView, VIEWS_ROOT } = require("./renderActiveClinicView");

function csrfLocals(shellLocals) {
  const csrf = (shellLocals && shellLocals.csrf) || {};
  return {
    csrfField: csrf.field || "_csrf",
    csrfToken: csrf.token || "",
  };
}

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
      ...csrfLocals(shellLocals),
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
    ...csrfLocals(shellLocals),
    shell: shellLocals,
    pageData: shellLocals.pageData || {},
  });
  return renderActiveClinicShellPage(body, shellLocals);
}

/**
 * Shared authenticated-app page renderer (Phase 4–14 route files).
 * `input.assetVersion` on the shell view-model is ignored; CSS cache-bust
 * comes from SHELL_ASSET_VERSION inside buildActiveClinicShellViewModel.
 */
function createActiveClinicAppRenderer(deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction === true;

  function issuePageCsrf(res, req) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env, req });
    return token;
  }

  async function renderShell(req, res, options) {
    const csrfToken = issuePageCsrf(res, req);
    const shell = await buildActiveClinicShellViewModel(getPool(), {
      req,
      auth: req.activeClinicAuth,
      csrfToken,
      activeNav: options.activeNav,
      pageHeader: options.pageHeader,
      breadcrumbs: options.breadcrumbs,
      flash: options.flash || null,
      pageData: options.pageData || {},
    });
    if (shell.selectedFacility && req.activeClinicAuth) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  return { issuePageCsrf, renderShell };
}

module.exports = {
  renderActiveClinicShellPage,
  renderActiveClinicAppPage,
  createActiveClinicAppRenderer,
};
