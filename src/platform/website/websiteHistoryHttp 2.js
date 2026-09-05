"use strict";

const versionService = require("./versionService");
const contentService = require("./contentService");
const historyModel = require("./historyModel");
const {
  renderWebsiteHistory,
  HISTORY_STYLESHEET,
  HISTORY_SCRIPT,
} = require("./renderWebsiteHistory");
const { renderWebsiteManagementPage } = require("./renderWebsiteManagementPage");

/**
 * @param {import('pg').Pool|{query: Function}} db
 * @param {{
 *   organizationId: string,
 *   instance: object,
 *   productCode?: string,
 *   siteLabel?: string,
 *   canRestore?: boolean,
 *   backHref?: string|null,
 *   previewHrefFor?: (versionId: string) => string|null,
 *   restoreHrefFor?: (versionId: string) => string|null,
 *   notice?: string|null,
 *   error?: string|null,
 *   csrfField?: string|null,
 *   csrfToken?: string|null,
 * }} input
 */
async function loadHistoryPresentation(db, input) {
  const opts = input && typeof input === "object" ? input : {};
  const organizationId = String(opts.organizationId || "");
  const instance = opts.instance;
  if (!organizationId || !instance || !instance.id) {
    throw new Error("loadHistoryPresentation requires organizationId and instance");
  }
  const listed = await versionService.listWebsiteVersions(db, {
    instanceId: instance.id,
    organizationId,
  });
  const changes = await contentService.listUnpublishedChanges(db, instance, organizationId);
  const history = historyModel.buildHistoryView({
    productCode: opts.productCode,
    siteLabel: opts.siteLabel,
    versions: listed.versions || [],
    unpublishedCount: changes.length,
    canRestore: opts.canRestore === true,
    backHref: opts.backHref,
    previewHrefFor: opts.previewHrefFor,
    restoreHrefFor: opts.restoreHrefFor,
    notice: opts.notice,
    error: opts.error,
    csrfField: opts.csrfField,
    csrfToken: opts.csrfToken,
  });
  const historyHtml = renderWebsiteHistory(history);
  return { history, historyHtml, unpublishedCount: changes.length };
}

/**
 * @param {{ history: object, historyHtml: string }} presentation
 */
function renderStandaloneHistoryPage(presentation) {
  const history = presentation && presentation.history;
  const historyHtml = presentation && presentation.historyHtml;
  return renderWebsiteManagementPage({
    pageTitle: history.pageTitle,
    productCode: history.productCode,
    siteLabel: history.siteLabel,
    backHref: history.backHref,
    backLabel: history.backLabel,
    bodyHtml: historyHtml,
    stylesheets: [HISTORY_STYLESHEET],
    scripts: [HISTORY_SCRIPT],
    csrfToken: history.csrfToken,
  });
}

module.exports = {
  loadHistoryPresentation,
  renderStandaloneHistoryPage,
};
