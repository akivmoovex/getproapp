"use strict";

/**
 * Shared editor-shell presentation. Products supply labels, hrefs, and pages;
 * they must not fork save / preview / publish / exit controls.
 */

const { listProductPageTypes } = require("./productSchemaRegistry");

function presentEditorShell(input) {
  const facts = input || {};
  const unpublishedCount = Number(facts.unpublishedCount) || 0;
  const draft = unpublishedCount > 0 || facts.draft === true;
  const productCode = facts.productCode || "";
  const schemaPages = listProductPageTypes(productCode);
  const pages = Array.isArray(facts.pages) && facts.pages.length ? facts.pages : schemaPages;
  return {
    productCode,
    pageKey: facts.pageKey || "home",
    pages,
    draft,
    draftLabel: draft
      ? unpublishedCount > 0
        ? `Unpublished draft (${unpublishedCount})`
        : "Unpublished draft"
      : "No unpublished changes",
    saveStateLabel: facts.saveStateLabel || (draft ? "Saved to draft" : "Up to date"),
    unpublishedCount,
    canEdit: facts.canEdit === true,
    canPublish: facts.canPublish === true,
    editing: facts.editing === true,
    previewHref: facts.previewHref || null,
    publishHref: facts.publishHref || null,
    publishPath: facts.publishPath || null,
    historyHref: facts.historyHref || null,
    hubHref: facts.hubHref || null,
    exitHref: facts.exitHref || null,
    saveUrl: facts.saveUrl || null,
    mediaUrl: facts.mediaUrl || null,
    csrfToken: facts.csrfToken || "",
    csrfField: facts.csrfField || "_csrf",
    saveLabel: facts.saveLabel || "Save draft",
    publishLabel: facts.publishLabel || "Publish",
    previewLabel: facts.previewLabel || "Preview",
    exitLabel: facts.exitLabel || "Exit Editing",
    editLabel: facts.editLabel || "Edit Website",
    pageSelectLabel: facts.pageSelectLabel || "Page",
  };
}

module.exports = {
  presentEditorShell,
};
