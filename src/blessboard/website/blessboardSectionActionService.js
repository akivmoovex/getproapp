"use strict";

const { presentSectionManifest } = require("../../platform/website-engine/presentSectionManifest");
const { saveStructuredDraft } = require("../services/websiteStructuredDraftService");
const contentRepo = require("../repositories/publicContentRepository");
const fieldDraftRepo = require("../repositories/websiteInlineFieldDraftRepository");

const LOCKED_SECTIONS = new Set(["hero", "service_times", "services", "worship_times"]);

function isLockedSection(sectionKey) {
  return LOCKED_SECTIONS.has(String(sectionKey || "").trim());
}

function sectionOrderKeys(sections) {
  return (sections || [])
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((s) => String(s.sectionKey || ""))
    .filter(Boolean);
}

function applyVisibilityDrafts(sections, drafts, pageKey) {
  const hidden = new Set();
  for (const d of drafts || []) {
    if (d.draftKind !== "page_section" || d.pageKey !== pageKey) continue;
    if (d.op !== "visibility") continue;
    const sk = String((d.payload && d.payload.sectionKey) || d.sectionKey || "");
    if (!sk) continue;
    if (d.payload && d.payload.hidden === true) hidden.add(sk);
    else hidden.delete(sk);
  }
  return (sections || []).map((s) => {
    const key = String(s.sectionKey || "");
    const isHidden = hidden.has(key) || String(s.status || "") === "archived";
    return {
      ...s,
      _draftHidden: hidden.has(key),
      status: hidden.has(key) ? "archived" : s.status,
      _editorHidden: isHidden,
    };
  });
}

function buildManifest(pageKey, sections, structuredDrafts) {
  const visibleSections = applyVisibilityDrafts(sections, structuredDrafts, pageKey);
  const ordered = visibleSections
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const total = ordered.length;
  const capabilities = ordered.map((section, index) => {
    const sectionKey = String(section.sectionKey || "");
    const locked = isLockedSection(sectionKey) || sectionKey === "hero";
    const isHidden =
      section._draftHidden === true ||
      section._editorHidden === true ||
      hidden.has(sectionKey) ||
      String(section.status || "") === "archived";
    return {
      sectionKey,
      sectionId: sectionKey,
      pageKey,
      label: section.heading ? String(section.heading) : null,
      title: section.heading || null,
      canEdit: true,
      canReorder: total > 1 && !locked,
      canHide: !locked,
      canRestoreDefault: !locked && Boolean(section.sectionKey),
      isHidden,
      isDefault: false,
      sortIndex: index,
      selector: `[data-section="${sectionKey}"]`,
    };
  });
  return presentSectionManifest({
    pageKey,
    selectorAttr: "data-section",
    sections: capabilities,
  });
}

async function reorderSections(db, input) {
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const order = Array.isArray(input.order) ? input.order.map(String) : [];
  if (!order.length) return { ok: false, code: "invalid_input" };
  await saveStructuredDraft(db, {
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: input.branchId || null,
    editorUserId: input.editorUserId,
    actorRole: input.actorRole || null,
    draftKind: "page_section",
    pageKey,
    sectionKey: null,
    entityKey: `page:${pageKey}:section-order`,
    op: "reorder",
    payload: { order },
    previousPayload: input.previousOrder ? { order: input.previousOrder } : null,
  });
  return { ok: true, order };
}

async function setSectionVisibility(db, input) {
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const sectionKey = String(input.sectionKey || "").trim();
  if (!sectionKey) return { ok: false, code: "invalid_input" };
  if (isLockedSection(sectionKey)) return { ok: false, code: "locked_item" };
  const hidden = input.hidden === true;
  await saveStructuredDraft(db, {
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: input.branchId || null,
    editorUserId: input.editorUserId,
    actorRole: input.actorRole || null,
    draftKind: "page_section",
    pageKey,
    sectionKey,
    entityKey: `section:${sectionKey}:visibility`,
    op: "visibility",
    payload: { sectionKey, hidden },
    previousPayload: input.previousPayload || null,
  });
  return { ok: true, hidden };
}

async function restoreSectionDefault(db, input) {
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const sectionKey = String(input.sectionKey || "").trim();
  if (!sectionKey || isLockedSection(sectionKey)) return { ok: false, code: "locked_item" };
  const page = await contentRepo.findPageByScope(db, {
    churchId: input.churchId,
    branchId: input.branchId || null,
    pageKey,
  });
  if (!page) return { ok: false, code: "not_found" };
  const sections = await contentRepo.listSectionsForPage(db, page.id, {});
  const section = (sections || []).find((s) => String(s.sectionKey) === sectionKey);
  if (!section) return { ok: false, code: "not_found" };
  await saveStructuredDraft(db, {
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: input.branchId || null,
    editorUserId: input.editorUserId,
    actorRole: input.actorRole || null,
    draftKind: "page_section",
    pageKey,
    sectionKey,
    entityKey: `section:${sectionKey}:restore_default`,
    op: "restore_default",
    payload: { sectionKey },
    previousPayload: {
      heading: section.heading,
      bodyText: section.bodyText,
      mediaUrl: section.mediaUrl,
    },
  });
  const drafts = await fieldDraftRepo.listDrafts(db, {
    churchId: input.churchId,
    branchId: input.branchId || null,
    pageKey,
    status: "draft",
  });
  for (const draft of drafts) {
    if (String(draft.sectionKey) !== sectionKey) continue;
    await fieldDraftRepo.discardDraft(db, { id: draft.id, churchId: input.churchId });
  }
  return { ok: true };
}

async function loadPageSections(db, input) {
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const page = await contentRepo.findPageByScope(db, {
    churchId: input.churchId,
    branchId: input.branchId || null,
    pageKey,
  });
  if (!page) return [];
  return contentRepo.listSectionsForPage(db, page.id, {});
}

async function applySectionAction(db, input) {
  const action = String(input.action || "").trim();
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const sections = await loadPageSections(db, input);

  if (action === "reorder") {
    return reorderSections(db, input);
  }
  if (action === "move_up" || action === "move_down") {
    const order = sectionOrderKeys(sections);
    const key = String(input.sectionKey || "");
    const idx = order.indexOf(key);
    if (idx < 0) return { ok: false, code: "not_found" };
    const next = order.slice();
    const swap = action === "move_up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return { ok: true, order: next };
    const tmp = next[idx];
    next[idx] = next[swap];
    next[swap] = tmp;
    return reorderSections(db, { ...input, pageKey, order: next, previousOrder: order });
  }
  if (action === "hide") {
    return setSectionVisibility(db, { ...input, hidden: true });
  }
  if (action === "show") {
    return setSectionVisibility(db, { ...input, hidden: false });
  }
  if (action === "restore_default") {
    return restoreSectionDefault(db, input);
  }
  return { ok: false, code: "invalid_action" };
}

module.exports = {
  LOCKED_SECTIONS,
  buildManifest,
  applySectionAction,
  applyVisibilityDrafts,
  sectionOrderKeys,
};
