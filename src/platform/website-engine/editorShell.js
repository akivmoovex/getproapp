"use strict";

/**
 * Shared editor-shell presentation. Products supply labels and hrefs;
 * they must not fork save / preview / publish controls.
 */

function presentEditorShell(input) {
  const facts = input || {};
  const unpublishedCount = Number(facts.unpublishedCount) || 0;
  const draft = unpublishedCount > 0 || facts.draft === true;
  return {
    productCode: facts.productCode || "",
    pageKey: facts.pageKey || "home",
    pages: Array.isArray(facts.pages) ? facts.pages : [],
    draft,
    draftLabel: draft ? "Unpublished draft" : "No unpublished changes",
    unpublishedCount,
    canEdit: facts.canEdit === true,
    canPublish: facts.canPublish === true,
    previewHref: facts.previewHref || null,
    publishHref: facts.publishHref || null,
    publishPath: facts.publishPath || null,
    historyHref: facts.historyHref || null,
    hubHref: facts.hubHref || null,
    saveLabel: facts.saveLabel || "Save draft",
    publishLabel: facts.publishLabel || "Publish",
    previewLabel: facts.previewLabel || "Preview",
  };
}

module.exports = {
  presentEditorShell,
};
