"use strict";

/**
 * Shared HTTP presentation for the Choose Website (scope) list.
 */

const { buildWebsiteScopeListPageView } = require("./websiteScopeListPageModel");
const {
  renderWebsiteScopeListPage,
  WEBSITE_SCOPE_STYLESHEET,
} = require("./renderWebsiteScopeList");
const { renderWebsiteManagementPage } = require("./renderWebsiteManagementPage");
const { HISTORY_STYLESHEET } = require("./renderWebsiteHistory");

function loadWebsiteScopeListPresentation(input) {
  const page = buildWebsiteScopeListPageView(input);
  return { page, bodyHtml: renderWebsiteScopeListPage(page) };
}

function renderStandaloneWebsiteScopeListPage(presentation) {
  const page = presentation.page;
  return renderWebsiteManagementPage({
    pageTitle: page.pageTitle,
    productCode: page.productCode,
    siteLabel: page.siteLabel,
    backHref: page.backHref,
    backLabel: page.backLabel,
    bodyHtml: presentation.bodyHtml,
    stylesheets: [HISTORY_STYLESHEET, WEBSITE_SCOPE_STYLESHEET],
    scripts: [],
    csrfToken: page.csrfToken,
  });
}

module.exports = {
  loadWebsiteScopeListPresentation,
  renderStandaloneWebsiteScopeListPage,
  WEBSITE_SCOPE_STYLESHEET,
};
