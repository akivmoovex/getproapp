"use strict";

/**
 * Shared website editor shell presentation (Stitch WE01).
 * Products supply configuration (pages, More destinations, permissions).
 * They must not fork toolbar markup or labels.
 */

const { listProductPageTypes } = require("./productSchemaRegistry");
const {
  buildPublicWebsiteEditPath,
} = require("../website/publicWebsiteUrl");

const LABELS = Object.freeze({
  editingWebsite: "Editing website",
  previewingDraft: "Previewing unpublished draft",
  preview: "Preview",
  publish: "Publish",
  backToEditing: "Back to editing",
  exitEditing: "Exit editing",
  moreAria: "More actions",
  pagesHeading: "Pages",
  pageSelectorHeading: "Page Selector",
  editWebsite: "Edit website",
  discardDraft: "Discard draft changes",
  unpublishWebsite: "Unpublish website",
  keepEditing: "Keep editing",
  discardChanges: "Discard changes",
  publishConfirmTitle: "Publish website?",
  publishConfirmBody: "Your draft changes will become public. Visitors will see the updated website.",
  discardConfirmTitle: "Discard draft changes?",
  discardConfirmBody:
    "Unpublished draft changes will be removed. The live published website will stay unchanged.",
  unpublishConfirmTitle: "Unpublish website?",
  unpublishConfirmBody:
    "The public website will be taken offline. Content and version history are preserved.",
  unsavedTitle: "Unsaved changes",
  unsavedBody: "You have unsaved changes that are not saved to draft yet.",
});

const PAGE_ICONS = Object.freeze({
  home: "home",
  about: "info",
  leadership: "groups",
  ministries: "volunteer_activism",
  events: "event",
  sermons: "library_music",
  giving: "favorite",
  contact: "mail",
  services: "medical_services",
  doctors: "stethoscope",
  pricing: "payments",
  location: "location_on",
  book: "calendar_month",
});

function draftStatusLabel(unpublishedCount) {
  const n = Number(unpublishedCount) || 0;
  return `Draft • ${n} unpublished changes`;
}

function draftStatusLabelShort(unpublishedCount) {
  const n = Number(unpublishedCount) || 0;
  return `Draft • ${n} changes`;
}

function decoratePage(page, currentKey) {
  const key = String((page && page.key) || "").trim() || "home";
  return {
    key,
    label: (page && page.label) || key,
    path: page && page.path != null ? String(page.path) : "",
    icon: (page && page.icon) || PAGE_ICONS[key] || "description",
    editHref: (page && page.editHref) || null,
    current: page && page.current === true ? true : key === currentKey,
  };
}

/**
 * Build editor page rails from the product schema registry.
 * @param {{
 *   productCode: string,
 *   organizationKey: string,
 *   pageKey?: string,
 *   scope?: { kind?: string, branchKey?: string } | null,
 * }} input
 */
function buildEditorPages(input) {
  const productCode = String((input && input.productCode) || "").trim();
  const organizationKey = String((input && input.organizationKey) || "").trim();
  const pageKey = String((input && input.pageKey) || "home").trim() || "home";
  const scope = (input && input.scope) || null;
  return listProductPageTypes(productCode).map((page) =>
    decoratePage(
      {
        ...page,
        editHref: organizationKey
          ? buildPublicWebsiteEditPath({
              product: productCode,
              organizationKey,
              pageKey: page.key,
              scope,
            })
          : null,
      },
      pageKey
    )
  );
}

function normalizeMoreItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    if (!item || !item.id || !item.label) continue;
    if (item.available === false) continue;
    const href = item.href ? String(item.href) : null;
    const action = item.action ? String(item.action) : null;
    const method = String(item.method || "GET").toUpperCase();
    if (!href && !action) continue;
    out.push({
      id: String(item.id),
      label: String(item.label),
      icon: item.icon ? String(item.icon) : "chevron_right",
      href,
      action,
      method: href && method === "POST" ? "POST" : "GET",
      group: item.group ? String(item.group) : "general",
      destructive: item.destructive === true,
      lifecycle: item.lifecycle ? String(item.lifecycle) : null,
    });
  }
  return out;
}

function defaultMobileNav(facts) {
  const brandingHref = facts.brandingHref || null;
  const historyHref = facts.historyHref || null;
  const hubHref = facts.hubHref || null;
  return [
    { id: "pages", label: "Pages", icon: "layers", action: "pages", available: true },
    {
      id: "styles",
      label: "Styles",
      icon: "palette",
      href: brandingHref,
      available: Boolean(brandingHref),
      unavailableReason: brandingHref ? null : "Styles editor is not available in this editor yet",
    },
    {
      id: "history",
      label: "History",
      icon: "history",
      href: historyHref,
      available: Boolean(historyHref),
      unavailableReason: historyHref ? null : "Version history is not available here",
    },
    {
      id: "settings",
      label: "Settings",
      icon: "settings",
      href: hubHref,
      available: Boolean(hubHref),
      unavailableReason: hubHref ? null : "Website settings are not available here",
    },
  ];
}

function normalizeMobileNav(items, facts) {
  const source = Array.isArray(items) && items.length ? items : defaultMobileNav(facts);
  return source.map((item) => {
    const href = item.href ? String(item.href) : null;
    const action = item.action ? String(item.action) : null;
    const available =
      item.available === false ? false : Boolean(href || action);
    return {
      id: String(item.id || ""),
      label: String(item.label || item.id || ""),
      icon: String(item.icon || "circle"),
      href: available ? href : null,
      action: available ? action : null,
      available,
      unavailableReason: available
        ? null
        : item.unavailableReason || "Not available in this editor yet",
    };
  });
}

function presentEditorShell(input) {
  const facts = input || {};
  const unpublishedCount = Number(facts.unpublishedCount) || 0;
  const draft = unpublishedCount > 0 || facts.draft === true;
  const productCode = facts.productCode || "";
  const pageKey = facts.pageKey || "home";
  const schemaPages = listProductPageTypes(productCode);
  const rawPages =
    Array.isArray(facts.pages) && facts.pages.length
      ? facts.pages
      : facts.organizationKey
        ? buildEditorPages({
            productCode,
            organizationKey: facts.organizationKey,
            pageKey,
            scope: facts.scope || null,
          })
        : schemaPages;
  const pages = rawPages.map((page) => decoratePage(page, pageKey));
  const moreItems = normalizeMoreItems(facts.moreItems);
  const mobileNav = normalizeMobileNav(facts.mobileNav, facts);
  const canPublish = facts.canPublish === true;
  const previewMode = facts.previewMode === true;
  const editing = facts.editing === true && !previewMode;
  const exitMethod = String(facts.exitMethod || "GET").toUpperCase() === "POST" ? "POST" : "GET";

  return {
    productCode,
    pageKey,
    pages,
    moreItems,
    mobileNav,
    draft,
    draftLabel: draftStatusLabel(unpublishedCount),
    draftLabelShort: draftStatusLabelShort(unpublishedCount),
    saveStateLabel: facts.saveStateLabel || (draft ? "Saved to draft" : "Up to date"),
    unpublishedCount,
    canEdit: facts.canEdit === true,
    canPublish,
    previewMode,
    editing,
    previewHref: facts.previewHref || null,
    backToEditHref: facts.backToEditHref || null,
    publishHref: facts.publishHref || null,
    publishPath: facts.publishPath || null,
    discardPath: facts.discardPath || null,
    unpublishPath: facts.unpublishPath || null,
    historyHref: facts.historyHref || null,
    hubHref: facts.hubHref || null,
    brandingHref: facts.brandingHref || null,
    managePagesHref: facts.managePagesHref || null,
    exitHref: facts.exitHref || null,
    exitMethod,
    exitAction: facts.exitAction || (exitMethod === "POST" ? facts.exitHref : null),
    saveUrl: facts.saveUrl || null,
    mediaUrl: facts.mediaUrl || null,
    csrfToken: facts.csrfToken || "",
    csrfField: facts.csrfField || "_csrf",
    labels: {
      editingWebsite: LABELS.editingWebsite,
      previewingDraft: LABELS.previewingDraft,
      preview: facts.previewLabel || LABELS.preview,
      publish: facts.publishLabel || LABELS.publish,
      backToEditing: LABELS.backToEditing,
      exitEditing: facts.exitLabel || LABELS.exitEditing,
      moreAria: LABELS.moreAria,
      pagesHeading: LABELS.pagesHeading,
      pageSelectorHeading: LABELS.pageSelectorHeading,
      editWebsite: facts.editLabel || LABELS.editWebsite,
      discardDraft: LABELS.discardDraft,
      unpublishWebsite: LABELS.unpublishWebsite,
      keepEditing: LABELS.keepEditing,
      discardChanges: LABELS.discardChanges,
      publishConfirmTitle: LABELS.publishConfirmTitle,
      publishConfirmBody: LABELS.publishConfirmBody,
      discardConfirmTitle: LABELS.discardConfirmTitle,
      discardConfirmBody: LABELS.discardConfirmBody,
      unpublishConfirmTitle: LABELS.unpublishConfirmTitle,
      unpublishConfirmBody: LABELS.unpublishConfirmBody,
      unsavedTitle: LABELS.unsavedTitle,
      unsavedBody: LABELS.unsavedBody,
    },
    saveLabel: facts.saveLabel || "Save draft",
    publishLabel: facts.publishLabel || LABELS.publish,
    previewLabel: facts.previewLabel || LABELS.preview,
    exitLabel: facts.exitLabel || LABELS.exitEditing,
    editLabel: facts.editLabel || LABELS.editWebsite,
    pageSelectLabel: facts.pageSelectLabel || "Page",
  };
}

module.exports = {
  LABELS,
  PAGE_ICONS,
  draftStatusLabel,
  draftStatusLabelShort,
  buildEditorPages,
  presentEditorShell,
};
