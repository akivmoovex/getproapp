"use strict";

/**
 * Attach admin website chrome + optional edit-mode draft overlays to a public page model.
 * Public visitors and unauthorized users always get websiteAdmin = null.
 */

const {
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  authorizeBlessBoardTenantAccess,
} = require("../services/authorizeBlessBoardTenantAccess");
const {
  loadDraftOverlayMap,
  applyDraftsToSections,
  resolveWebsiteAdminStatus,
  displayWithDraft,
  readPublishedFieldValue,
} = require("../services/websiteInlineDraftService");
const fieldDraftRepo = require("../repositories/websiteInlineFieldDraftRepository");
const {
  countAllWebsiteDrafts,
  listStructuredDrafts,
  applyStructuredDraftsToModel,
  listDemoImages,
} = require("../services/websiteStructuredDraftService");

const EDIT_QUERY = "website_edit";

const SECTION_BASELINE_FIELDS = ["heading", "bodyText", "buttonText", "buttonUrl"];
const CONTACT_BASELINE_FIELDS = ["email", "phone", "address"];

/**
 * Snapshot visitor-visible field values before draft overlays are applied.
 * @param {object[]} sections
 * @param {object|null|undefined} publicContact
 */
function buildDisplayBaselineMap(sections, publicContact) {
  const map = Object.create(null);
  for (const section of sections || []) {
    const sectionKey = String(section.sectionKey || "");
    if (!sectionKey) continue;
    for (const fieldKey of SECTION_BASELINE_FIELDS) {
      map[`${sectionKey}::${fieldKey}`] = readPublishedFieldValue(section, fieldKey, null);
    }
  }
  if (publicContact && typeof publicContact === "object") {
    for (const fieldKey of CONTACT_BASELINE_FIELDS) {
      map[`details::${fieldKey}`] = readPublishedFieldValue(null, fieldKey, publicContact);
    }
  }
  return map;
}

/**
 * @param {object|null|undefined} authz
 */
function resolveWebsiteEditCapability(authz) {
  if (!authz || !authz.authenticated || !authz.authorized) {
    return { canEdit: false, isHqEditor: false, isBranchEditor: false, actorRole: null };
  }
  const roles = Array.isArray(authz.effectiveRoles) ? authz.effectiveRoles : [];
  const keys = new Set(roles.map((r) => String(r.roleKey || "")));
  const isHqEditor = keys.has("church_hq_admin") || keys.has("platform_admin");
  const isBranchEditor = keys.has("branch_admin");
  if (!isHqEditor && !isBranchEditor) {
    return { canEdit: false, isHqEditor: false, isBranchEditor: false, actorRole: null };
  }
  let actorRole = null;
  if (keys.has("platform_admin")) actorRole = "platform_admin";
  else if (keys.has("church_hq_admin")) actorRole = "church_hq_admin";
  else if (keys.has("branch_admin")) actorRole = "branch_admin";
  return { canEdit: true, isHqEditor, isBranchEditor, actorRole };
}

/**
 * @param {string} path
 * @param {boolean} editing
 */
function withEditQuery(path, editing) {
  const raw = String(path || "/");
  const [base, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  if (editing) params.set(EDIT_QUERY, "1");
  else params.delete(EDIT_QUERY);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * @param {{
 *   req: import('express').Request,
 *   res: import('express').Response,
 *   db: import('pg').Pool,
 *   model: object,
 *   tenant?: object|null,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 */
async function attachWebsiteAdminChrome(opts) {
  const { req, res, db, model, env } = opts;
  if (!model || model.kind !== "ok") {
    if (model) model.websiteAdmin = null;
    return model;
  }

  const tenant =
    opts.tenant ||
    req.blessBoardTenantContext ||
    null;

  if (tenant && tenant.resolved) {
    req.blessBoardTenantContext = tenant;
  }

  let authz = req.blessBoardAuthorizationContext || null;
  const session =
    req.v5Session && req.v5Session.authenticated && req.v5Session.session
      ? req.v5Session.session
      : null;

  // Re-authorize against the page tenant (required for /c/:org path sites).
  if (session && tenant && tenant.resolved) {
    try {
      const result = await authorizeBlessBoardTenantAccess(db, {
        userId: session.userId,
        tenant,
        branchId: tenant.primaryBranch ? tenant.primaryBranch.id : null,
      });
      authz = result.context || authz;
      req.blessBoardAuthorizationContext = authz;
    } catch {
      // keep prior fail-soft context
    }
  }

  const capability = resolveWebsiteEditCapability(authz);
  if (!capability.canEdit) {
    model.websiteAdmin = null;
    return model;
  }

  const churchId = tenant && tenant.church ? tenant.church.id : authz.churchId;
  const organizationId =
    tenant && tenant.organization ? tenant.organization.id : authz.organizationId;

  // HQ / platform editors work on church-wide drafts (branch_id null).
  // Branch admins store drafts scoped to their authorized branch.
  const draftBranchId = capability.isHqEditor
    ? null
    : authz.branchId ||
      (tenant && tenant.primaryBranch ? tenant.primaryBranch.id : null);

  const editingMode = String(req.query[EDIT_QUERY] || "") === "1";

  let draftCount = 0;
  let overlayMap = new Map();
  let structuredDrafts = [];
  /** @type {Record<string, string>} */
  let publishedBaselines = Object.create(null);
  try {
    draftCount = await countAllWebsiteDrafts(db, {
      churchId,
      branchId: draftBranchId,
    });
    if (editingMode) {
      // Capture visitor-visible text before draft overlays mutate the model.
      publishedBaselines = buildDisplayBaselineMap(model.sections, model.publicContact);
      try {
        const activeDrafts = await fieldDraftRepo.listDrafts(db, {
          churchId,
          branchId: draftBranchId,
          pageKey: model.pageKey,
          status: "draft",
        });
        for (const draft of activeDrafts) {
          const key = `${draft.sectionKey}::${draft.fieldKey}`;
          publishedBaselines[key] =
            draft.previousValue != null ? String(draft.previousValue) : "";
        }
      } catch {
        // Baselines remain visitor-visible snapshot.
      }

      overlayMap = await loadDraftOverlayMap(db, {
        churchId,
        branchId: draftBranchId,
        pageKey: model.pageKey,
      });
      model.sections = applyDraftsToSections(model.sections, overlayMap);
      if (model.pageKey === "contact" && model.publicContact) {
        const email = overlayMap.get("details::email");
        const phone = overlayMap.get("details::phone");
        const address = overlayMap.get("details::address");
        if (email !== undefined || phone !== undefined || address !== undefined) {
          model.publicContact = {
            ...model.publicContact,
            email: email !== undefined ? email : model.publicContact.email,
            phone: phone !== undefined ? phone : model.publicContact.phone,
            addressText:
              address !== undefined ? address : model.publicContact.addressText,
            hasAny: true,
          };
        }
      }
      structuredDrafts = await listStructuredDrafts(db, {
        churchId,
        branchId: draftBranchId,
        status: "draft",
      });
      applyStructuredDraftsToModel(model, structuredDrafts);
    }
  } catch {
    draftCount = 0;
    overlayMap = new Map();
    structuredDrafts = [];
    publishedBaselines = Object.create(null);
  }

  const hasDraftChanges = draftCount > 0;
  const websiteEnabled = String(model.websiteStatus || "") === "published";
  const usedPublicDemoFill = Boolean(model.usedPublicDemoFill);
  const status = resolveWebsiteAdminStatus({
    websiteEnabled,
    hasDraftChanges,
    usedPublicDemoFill,
    accessRestricted: false,
  });

  const csrfToken = issueCsrfToken(env || process.env);
  setCsrfCookie(res, csrfToken, {
    secure: String((env || process.env).NODE_ENV || "") === "production",
  });

  const currentPath = String(model.path || "/");
  const manageHref = capability.isHqEditor ? "/hq/website" : "/branch-admin/content";
  const saveUrl = capability.isHqEditor
    ? "/hq/content/api/inline-field"
    : "/branch-admin/content/api/inline-field";
  const structuredSaveUrl = capability.isHqEditor
    ? "/hq/content/api/structured-draft"
    : "/branch-admin/content/api/structured-draft";
  const mediaUploadUrl = capability.isHqEditor
    ? "/hq/content/media/upload"
    : "/branch-admin/content/media/upload";
  const mediaListUrl = capability.isHqEditor
    ? "/hq/content/media"
    : "/branch-admin/content/media";
  const reviewHref = capability.isHqEditor
    ? "/hq/content/draft-changes"
    : "/branch-admin/content/draft-changes";
  const publishUrl = capability.isHqEditor
    ? "/hq/content/api/inline-field/publish"
    : "/branch-admin/content/api/inline-field/publish";
  const draftPreviewHref = capability.isHqEditor
    ? "/hq/content/draft-preview/home"
    : "/branch-admin/content/draft-preview/home";

  const overrides = Object.create(null);
  for (const [k, v] of overlayMap.entries()) {
    overrides[k] = v;
  }

  if (editingMode && Array.isArray(model.navItems)) {
    model.navItems = model.navItems.map((item) => ({
      ...item,
      href: withEditQuery(item.href, true),
    }));
    model.homeHref = withEditQuery(model.homeHref || model.pathPrefix || "/", true);
    model.visitHref = withEditQuery(
      model.visitHref || `${model.pathPrefix || ""}/contact`,
      true
    );
    const priorHrefFor = typeof model.hrefFor === "function" ? model.hrefFor.bind(model) : null;
    model.hrefFor = function hrefForEdit(pagePath) {
      const base = priorHrefFor ? priorHrefFor(pagePath) : String(pagePath || "/");
      return withEditQuery(base, true);
    };
  }

  model.websiteAdmin = {
    canEdit: true,
    editingMode,
    status,
    showDemoNotice: usedPublicDemoFill,
    manageHref,
    editHref: withEditQuery(currentPath, true),
    exitHref: withEditQuery(currentPath, false),
    reviewHref,
    draftPreviewHref,
    hasDraftChanges,
    draftCount,
    csrfToken,
    saveUrl,
    publishUrl,
    structuredSaveUrl,
    mediaUploadUrl,
    mediaListUrl,
    demoImages: editingMode ? listDemoImages() : [],
    pageKey: model.pageKey,
    organizationId,
    churchId,
    branchId: draftBranchId,
    actorRole: capability.actorRole,
    overrides,
    publishedBaselines,
    structuredDrafts: editingMode
      ? structuredDrafts.map((d) => ({
          draftKind: d.draftKind,
          pageKey: d.pageKey,
          sectionKey: d.sectionKey,
          entityKey: d.entityKey,
          op: d.op,
        }))
      : [],
    displayValue(sectionKey, fieldKey, fallback) {
      return displayWithDraft(overrides, sectionKey, fieldKey, fallback);
    },
    publishedValue(sectionKey, fieldKey, fallback) {
      const key = `${sectionKey}::${fieldKey}`;
      if (Object.prototype.hasOwnProperty.call(publishedBaselines, key)) {
        return publishedBaselines[key];
      }
      return fallback != null ? String(fallback) : "";
    },
  };

  model.cssHref = "/blessboard/v5/tenant-public.css?v=45";

  return model;
}

module.exports = {
  EDIT_QUERY,
  attachWebsiteAdminChrome,
  resolveWebsiteEditCapability,
  withEditQuery,
  buildDisplayBaselineMap,
};
