"use strict";

const LABELS = require("./sectionActionLabels");

function titleCase(key) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function sectionLabel(section) {
  if (section && section.label) return String(section.label);
  if (section && section.title) return String(section.title);
  return titleCase(section.sectionKey || section.type || "section");
}

/**
 * Normalize a section capability record for the shared editor client.
 * @param {object} input
 */
function presentSectionCapability(input) {
  const sectionKey = String((input && input.sectionKey) || "").trim();
  const pageKey = String((input && input.pageKey) || "home").trim() || "home";
  return {
    sectionKey,
    sectionId: String((input && input.sectionId) || sectionKey),
    pageKey,
    label: sectionLabel(input),
    canEdit: input && input.canEdit === true,
    canReorder: input && input.canReorder === true,
    canHide: input && input.canHide === true,
    canRestoreDefault: input && input.canRestoreDefault === true,
    isHidden: input && input.isHidden === true,
    isDefault: input && input.isDefault === true,
    sortIndex: Number(input && input.sortIndex) || 0,
    selector: input && input.selector ? String(input.selector) : "",
  };
}

/**
 * @param {{ pageKey?: string, sections?: object[], selectorAttr?: string }} input
 */
function presentSectionManifest(input) {
  const pageKey = String((input && input.pageKey) || "home").trim() || "home";
  const sections = Array.isArray(input && input.sections) ? input.sections : [];
  const selectorAttr = String((input && input.selectorAttr) || "data-website-section-key");
  return {
    pageKey,
    selectorAttr,
    labels: LABELS,
    sections: sections.map((s) => presentSectionCapability(s)),
  };
}

module.exports = {
  LABELS,
  sectionLabel,
  presentSectionCapability,
  presentSectionManifest,
};
