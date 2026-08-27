"use strict";

const contentRepo = require("../repositories/publicContentRepository");
const draftRepo = require("../repositories/websiteInlineFieldDraftRepository");
const {
  resolveEditableField,
  listEditableFieldsForPage,
} = require("./websiteInlineEditableFields");
const auditSvc = require("./websiteAuditService");

function mapError(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

/**
 * Read published baseline value for an allowlisted field.
 * @param {object|null} sectionRow
 * @param {string} fieldKey
 * @param {object|null} [publicContact]
 */
function readPublishedFieldValue(sectionRow, fieldKey, publicContact) {
  if (fieldKey === "email" || fieldKey === "phone" || fieldKey === "address") {
    const contact = publicContact && typeof publicContact === "object" ? publicContact : {};
    if (fieldKey === "address") {
      return contact.addressText != null
        ? String(contact.addressText)
        : contact.address != null
          ? String(contact.address)
          : "";
    }
    return contact[fieldKey] != null ? String(contact[fieldKey]) : "";
  }
  if (!sectionRow) return "";
  if (fieldKey === "heading") {
    return sectionRow.heading != null ? String(sectionRow.heading) : "";
  }
  if (fieldKey === "bodyText") {
    return sectionRow.bodyText != null ? String(sectionRow.bodyText) : "";
  }
  const meta =
    sectionRow.layoutMetadata && typeof sectionRow.layoutMetadata === "object"
      ? sectionRow.layoutMetadata
      : {};
  if (fieldKey === "tagline") {
    if (meta.tagline != null) return String(meta.tagline);
    return sectionRow.bodyText != null ? String(sectionRow.bodyText) : "";
  }
  if (fieldKey === "buttonText") {
    return meta.buttonText != null ? String(meta.buttonText) : "";
  }
  if (fieldKey === "buttonUrl") {
    return meta.buttonUrl != null ? String(meta.buttonUrl) : "";
  }
  if (fieldKey === "eyebrow") {
    return meta.eyebrow != null ? String(meta.eyebrow) : "";
  }
  if (fieldKey === "secondaryButtonText") {
    return meta.secondaryButtonText != null ? String(meta.secondaryButtonText) : "";
  }
  if (fieldKey === "secondaryButtonUrl") {
    return meta.secondaryButtonUrl != null ? String(meta.secondaryButtonUrl) : "";
  }
  return "";
}

/**
 * Resolve the published page row for church-wide or branch scope (same preference as public).
 * @param {import('pg').Pool} db
 * @param {{ churchId: string, branchId?: string|null, pageKey: string }} opts
 */
async function resolveContentPage(db, opts) {
  if (opts.branchId) {
    const branchPage = await contentRepo.findPageByScope(db, {
      churchId: opts.churchId,
      branchId: opts.branchId,
      pageKey: opts.pageKey,
    });
    if (branchPage) return branchPage;
  }
  return contentRepo.findPageByScope(db, {
    churchId: opts.churchId,
    branchId: null,
    pageKey: opts.pageKey,
  });
}

/**
 * Save an inline field draft. Does not publish.
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string|null,
 *   editorUserId: string,
 *   actorRole?: string|null,
 *   pageKey: string,
 *   sectionKey: string,
 *   fieldKey: string,
 *   newValue: string,
 *   publicContact?: object|null,
 * }} input
 */
async function saveInlineFieldDraft(db, input) {
  let pageKey = input.pageKey;
  let sectionKey = input.sectionKey;
  let fieldKey = input.fieldKey;
  // Shared footer chrome always persists under the home page key.
  if (sectionKey === "footer" && fieldKey === "tagline") {
    pageKey = "home";
  }
  const {
    assertEditableMutation,
    PRODUCT_CODE,
    ensureProductFieldsRegistered,
  } = require("../../platform/website/editableFieldSchema");
  ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
  const asserted = assertEditableMutation({
    productCode: PRODUCT_CODE.BLESSBOARD,
    pageKey,
    sectionKey,
    fieldKey,
    value: input.newValue,
    grantedPermissions: input.grantedPermissions,
  });
  if (!asserted.ok) {
    if (asserted.code === "forbidden") {
      throw mapError("FORBIDDEN", "That field cannot be edited.", 403);
    }
    if (asserted.code === "validation_failed") {
      throw mapError("VALIDATION", asserted.message || "Invalid value.", 400);
    }
    throw mapError("INVALID_FIELD", "That field cannot be edited.", 400);
  }
  const validated = { ok: true, value: asserted.value };

  try {
    const page = await resolveContentPage(db, {
      churchId: input.churchId,
      branchId: input.branchId || null,
      pageKey,
    });
    // Page may be missing when soft-fill demo is showing; drafts are still allowed.
    let section = null;
    if (page) {
      section = await contentRepo.findSectionByPageAndKey(db, page.id, sectionKey);
    }

    const previousValue = readPublishedFieldValue(
      section,
      fieldKey,
      input.publicContact || null
    );

    const existing = await draftRepo.findActiveDraft(db, {
      churchId: input.churchId,
      branchId: input.branchId || null,
      pageKey,
      sectionKey,
      fieldKey,
    });
    const baselinePrevious =
      existing && existing.previousValue != null ? existing.previousValue : previousValue;

    if (String(validated.value) === String(baselinePrevious || "")) {
      if (existing) {
        await draftRepo.discardDraft(db, { id: existing.id, churchId: input.churchId });
      }
      return {
        saved: true,
        published: false,
        draftCleared: Boolean(existing),
        value: validated.value,
        previousValue: baselinePrevious,
      };
    }

    const draft = await draftRepo.upsertDraftCompat(db, {
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId || null,
      pageKey,
      sectionKey,
      fieldKey,
      previousValue: baselinePrevious,
      newValue: validated.value,
      editorUserId: input.editorUserId,
    });

    try {
      await auditSvc.recordWebsiteAuditEvent(db, {
        organizationId: input.organizationId,
        branchId: input.branchId || null,
        actorUserId: input.editorUserId,
        actorRole: input.actorRole || null,
        actionType: "draft_saved",
        pageKey,
        sectionKey,
        entityType: "inline_field",
        entityId: draft.id,
        result: "success",
        before: { fieldKey, value: baselinePrevious },
        after: { fieldKey, value: draft.newValue },
        metadata: { source: "inline_text_edit", published: false },
      });
    } catch {
      // Audit must not block draft save.
    }

    try {
      const { syncDraftToEngine } = require("../../platform/website-engine/blessboardBridge");
      await syncDraftToEngine(db, {
        organizationId: input.organizationId,
        churchId: input.churchId,
        branchId: input.branchId || null,
        actorIdentityId: input.editorUserId || null,
      });
    } catch {
      // Engine draft sync must not block overlay save.
    }

    return {
      saved: true,
      published: false,
      draftCleared: false,
      draftId: draft.id,
      value: draft.newValue,
      previousValue: draft.previousValue,
      updatedAt: draft.updatedAt,
    };
  } catch (err) {
    if (err && err.status) throw err;
    const pgCode = err && err.code != null ? String(err.code) : "";
    if (pgCode.toUpperCase() === "42P01") {
      const mapped = mapError(
        "SAVE_FAILED",
        "Could not save this change. Please try again.",
        500
      );
      mapped.pgCode = "42P01";
      throw mapped;
    }
    const mapped = mapError(
      "SAVE_FAILED",
      "Could not save this change. Please try again.",
      500
    );
    mapped.pgCode = pgCode || null;
    throw mapped;
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{ churchId: string, branchId?: string|null, pageKey?: string|null }} opts
 * @returns {Promise<Map<string, string>>}
 */
async function loadDraftOverlayMap(db, opts) {
  const drafts = await draftRepo.listDrafts(db, {
    churchId: opts.churchId,
    branchId: opts.branchId === undefined ? null : opts.branchId,
    pageKey: opts.pageKey || null,
    status: "draft",
  });
  const map = new Map();
  for (const d of drafts) {
    map.set(`${d.sectionKey}::${d.fieldKey}`, d.newValue);
  }
  return map;
}

/**
 * Apply draft overlays onto mapped section rows (admin edit display only).
 * @param {object[]} sections
 * @param {Map<string, string>} overlayMap
 */
function applyDraftsToSections(sections, overlayMap) {
  if (!overlayMap || !overlayMap.size) return sections || [];
  return (sections || []).map((s) => {
    const key = String(s.sectionKey || "");
    const heading = overlayMap.get(`${key}::heading`);
    const bodyText = overlayMap.get(`${key}::bodyText`);
    const buttonText = overlayMap.get(`${key}::buttonText`);
    const buttonUrl = overlayMap.get(`${key}::buttonUrl`);
    const tagline = overlayMap.get(`${key}::tagline`);
    const eyebrow = overlayMap.get(`${key}::eyebrow`);
    const secondaryButtonText = overlayMap.get(`${key}::secondaryButtonText`);
    const secondaryButtonUrl = overlayMap.get(`${key}::secondaryButtonUrl`);
    if (
      heading === undefined &&
      bodyText === undefined &&
      buttonText === undefined &&
      buttonUrl === undefined &&
      tagline === undefined &&
      eyebrow === undefined &&
      secondaryButtonText === undefined &&
      secondaryButtonUrl === undefined
    ) {
      return s;
    }
    const layoutMetadata = {
      ...(s.layoutMetadata && typeof s.layoutMetadata === "object" ? s.layoutMetadata : {}),
    };
    if (buttonText !== undefined) layoutMetadata.buttonText = buttonText;
    if (buttonUrl !== undefined) layoutMetadata.buttonUrl = buttonUrl;
    if (tagline !== undefined) layoutMetadata.tagline = tagline;
    if (eyebrow !== undefined) layoutMetadata.eyebrow = eyebrow;
    if (secondaryButtonText !== undefined) layoutMetadata.secondaryButtonText = secondaryButtonText;
    if (secondaryButtonUrl !== undefined) layoutMetadata.secondaryButtonUrl = secondaryButtonUrl;
    return {
      ...s,
      heading: heading !== undefined ? heading : s.heading,
      bodyText:
        bodyText !== undefined
          ? bodyText
          : tagline !== undefined && key === "footer"
            ? tagline
            : s.bodyText,
      layoutMetadata,
    };
  });
}

/**
 * Resolve display value with draft override.
 * @param {Map<string, string>|Record<string,string>|null} overrides
 * @param {string} sectionKey
 * @param {string} fieldKey
 * @param {string} fallback
 */
function displayWithDraft(overrides, sectionKey, fieldKey, fallback) {
  if (!overrides) return fallback;
  const key = `${sectionKey}::${fieldKey}`;
  if (overrides instanceof Map) {
    if (overrides.has(key)) return overrides.get(key);
  } else if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key];
  }
  return fallback;
}

/**
 * Website status label for admin chrome.
 * @param {{
 *   websiteEnabled: boolean,
 *   hasDraftChanges: boolean,
 *   usedPublicDemoFill: boolean,
 *   accessRestricted?: boolean,
 * }} opts
 */
function resolveWebsiteAdminStatus(opts) {
  if (opts.accessRestricted) {
    return { key: "access_restricted", label: "Access restricted" };
  }
  if (!opts.websiteEnabled) {
    return { key: "publishing_unavailable", label: "Publishing unavailable" };
  }
  if (opts.usedPublicDemoFill && !opts.hasDraftChanges) {
    return { key: "unpublished_demo", label: "Unpublished demo" };
  }
  if (opts.hasDraftChanges) {
    return { key: "draft_changes", label: "Draft changes" };
  }
  return { key: "published", label: "Published" };
}

module.exports = {
  saveInlineFieldDraft,
  loadDraftOverlayMap,
  applyDraftsToSections,
  displayWithDraft,
  resolveWebsiteAdminStatus,
  readPublishedFieldValue,
  listEditableFieldsForPage,
  resolveEditableField,
  resolveContentPage,
};
