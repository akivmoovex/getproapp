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
  authorize,
  listEffectivePermissions,
} = require("../services/blessBoardRbacAuthorizationService");
const {
  resolveWebsiteScope,
  SCOPE_TYPE,
} = require("../services/resolveWebsiteScope");
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
const {
  buildWebsitePublicEditSettingsCatalog,
} = require("../services/websitePublicEditSettingsLinks");

const EDIT_QUERY = "website_edit";

const SECTION_BASELINE_FIELDS = [
  "heading",
  "bodyText",
  "buttonText",
  "buttonUrl",
  "tagline",
  "eyebrow",
  "secondaryButtonText",
  "secondaryButtonUrl",
];
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
 * @param {{ query: Function }} pool
 * @param {{
 *   userId: string,
 *   tenant: object,
 *   branchId?: string|null,
 * }} opts
 */
async function resolveWebsiteEditCapability(pool, opts) {
  const tenant = opts.tenant;
  if (!tenant || tenant.resolved !== true) {
    return { canEdit: false, isHqEditor: false, isBranchEditor: false, actorRole: null };
  }

  const resourceContext = {
    organizationId: tenant.organization.id,
    churchId: tenant.church.id,
    branchId: opts.branchId || null,
  };

  const editCheck = await authorize(pool, {
    actor: { userId: opts.userId },
    permission: "website.edit",
    tenantContext: tenant,
    resourceContext,
  });

  if (!editCheck.allowed) {
    return { canEdit: false, isHqEditor: false, isBranchEditor: false, actorRole: null };
  }

  // Determine editor type from permissions context (for audit labels only)
  const perms = await listEffectivePermissions(pool, {
    actor: { userId: opts.userId },
    tenantContext: tenant,
    resourceContext,
  });

  const permissionKeys = (perms.permissions || []).map((p) =>
    typeof p === "string" ? p : String((p && (p.permissionKey || p.permission_key)) || "")
  );
  const hasOrgSettingsManage = permissionKeys.includes("organisation.settings.manage");

  const isHqEditor = hasOrgSettingsManage;
  const isBranchEditor = !isHqEditor;

  // actorRole for audit labels only
  let actorRole = null;
  if (hasOrgSettingsManage) {
    actorRole = "church_hq_admin"; // or platform_admin
  } else {
    actorRole = "branch_admin";
  }

  return { canEdit: true, isHqEditor, isBranchEditor, actorRole };
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
function uuidEqual(a, b) {
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * Whether the authenticated editor may show edit chrome on this public page.
 * HQ/platform: any church-wide or branch page in the tenant.
 * Branch admin (multi-site): only the public page for their assigned branch.
 * Branch admin (single-site): church-wide shared site only — never another branch
 * path such as /branches/hq or /branches/other (matches save-scope product rule).
 *
 * @param {{
 *   isHqEditor: boolean,
 *   draftBranchId: string|null,
 *   model: object,
 * }} input
 */
function canShowWebsiteEditChrome(input) {
  if (input && input.isHqEditor) return true;
  const draftBranchId = input && input.draftBranchId ? String(input.draftBranchId) : null;
  if (!draftBranchId) return false;

  const model = input.model || {};
  const pageScope = model.websiteScope || {};
  const scopeType = String(pageScope.scopeType || "");
  const websiteMode = String(model.websiteMode || "");

  if (scopeType === "church" || scopeType === "") {
    // Canonical shared-site edit surface for branch admins in SINGLE_SITE only.
    return websiteMode === "single_site";
  }

  if (scopeType !== "branch") return false;

  const pageBranchId =
    pageScope.branchId != null
      ? String(pageScope.branchId)
      : model.branch && model.branch.id != null
        ? String(model.branch.id)
        : null;
  return uuidEqual(pageBranchId, draftBranchId);
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

  /** @type {string|null} */
  let draftBranchId = null;
  /** @type {boolean} */
  let isHqEditor = false;
  /** @type {string|null} */
  let actorRole = null;

  // Resolve website edit scope from trusted tenant + session (never primaryBranch for Branch Admin).
  if (session && tenant && tenant.resolved) {
    try {
      const websiteScope = await resolveWebsiteScope(db, {
        tenant,
        authenticatedUser: session.userId,
        requestedBranchKey: null,
        organizationId: tenant.organization ? tenant.organization.id : null,
        churchId: tenant.church ? tenant.church.id : null,
      });
      if (websiteScope.ok) {
        isHqEditor = websiteScope.scopeType === SCOPE_TYPE.CHURCH;
        draftBranchId =
          websiteScope.scopeType === SCOPE_TYPE.BRANCH ? websiteScope.branchId : null;
      }
    } catch {
      // keep prior fail-soft context
    }
  }

  const capability = await resolveWebsiteEditCapability(db, {
    userId: session && session.userId,
    tenant,
    branchId: draftBranchId,
  });

  if (!capability.canEdit) {
    model.websiteAdmin = null;
    return model;
  }

  // Prefer resolver outcome; fall back to capability for HQ/platform.
  if (capability.isHqEditor) {
    isHqEditor = true;
    draftBranchId = null;
    actorRole = capability.actorRole;
  } else if (!isHqEditor && capability.isBranchEditor && draftBranchId == null) {
    // Resolver failed soft — do not fall back to primaryBranch.
    model.websiteAdmin = null;
    return model;
  } else if (!isHqEditor && draftBranchId) {
    actorRole = capability.actorRole || actorRole;
  }

  if (
    !canShowWebsiteEditChrome({
      isHqEditor,
      draftBranchId,
      model,
    })
  ) {
    model.websiteAdmin = null;
    return model;
  }

  const churchId = tenant && tenant.church ? tenant.church.id : authz.churchId;
  const organizationId =
    tenant && tenant.organization ? tenant.organization.id : authz.organizationId;

  const editingMode = String(req.query[EDIT_QUERY] || "") === "1";
  const previewDraftMode =
    String((req.query && (req.query.website_mode || req.query.websiteMode)) || "").toLowerCase() ===
    "draft";
  const showDraftContent = editingMode || previewDraftMode;

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
    if (showDraftContent) {
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
      // Footer tagline is stored against the home page so shared chrome resolves
      // consistently from any public page in edit mode.
      if (model.pageKey !== "home") {
        try {
          const homeFooterDrafts = await fieldDraftRepo.listDrafts(db, {
            churchId,
            branchId: draftBranchId,
            pageKey: "home",
            status: "draft",
          });
          for (const draft of homeFooterDrafts || []) {
            if (String(draft.sectionKey) !== "footer") continue;
            const key = `${draft.sectionKey}::${draft.fieldKey}`;
            overlayMap.set(key, draft.newValue);
            publishedBaselines[key] =
              draft.previousValue != null ? String(draft.previousValue) : "";
          }
        } catch {
          // Non-fatal — page-local drafts still apply.
        }
      }
      model.sections = applyDraftsToSections(model.sections, overlayMap);
      if (overlayMap.has("footer::tagline")) {
        model.footerTagline = overlayMap.get("footer::tagline");
      }
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
      if (model._draftHeroMediaUrl) {
        if (model.homeDemoFallback) {
          model.homeDemoFallback = {
            ...model.homeDemoFallback,
            heroMediaUrl: model._draftHeroMediaUrl,
          };
        }
        const hasHero = (model.sections || []).some(
          (s) => s && String(s.sectionKey || "") === "hero"
        );
        if (!hasHero) {
          model.sections = [
            ...(model.sections || []),
            {
              sectionKey: "hero",
              sectionType: "hero",
              heading: null,
              bodyText: null,
              mediaUrl: model._draftHeroMediaUrl,
              sortOrder: 0,
              status: "draft",
              layoutMetadata: null,
            },
          ];
        }
      }
      // Soft-fill section overlays for demo-backed copy (no CMS section yet).
      if (overlayMap.size) {
        const applySoftSection = (fallbackObj, sectionKey, headingKey, bodyKey) => {
          if (!fallbackObj) return;
          const h = overlayMap.get(`${sectionKey}::heading`);
          const b = overlayMap.get(`${sectionKey}::bodyText`);
          if (h !== undefined && headingKey) fallbackObj[headingKey] = h;
          if (b !== undefined && bodyKey) fallbackObj[bodyKey] = b;
        };
        if (model.homeDemoFallback) {
          applySoftSection(model.homeDemoFallback, "ministries_intro", "ministriesIntroHeading", "ministriesIntroBody");
          applySoftSection(model.homeDemoFallback, "events_intro", "eventsIntroHeading", "eventsIntroBody");
          applySoftSection(model.homeDemoFallback, "sermons_intro", "sermonIntroHeading", "sermonIntroBody");
          applySoftSection(model.homeDemoFallback, "leadership_intro", "leadershipIntroHeading", "leadershipIntroBody");
          applySoftSection(model.homeDemoFallback, "giving_cta", "givingHeading", "givingBody");
          applySoftSection(model.homeDemoFallback, "contact_intro", "contactHeading", "contactBody");
          const giveBtn = overlayMap.get("giving_cta::buttonText");
          if (giveBtn !== undefined) model.homeDemoFallback.givingButtonText = giveBtn;
        }
        if (model.contactDemoFallback) {
          applySoftSection(model.contactDemoFallback, "visitor_guidance", null, "visitorGuidance");
          const vgHeading = overlayMap.get("visitor_guidance::heading");
          if (vgHeading !== undefined) model.contactDemoFallback.visitorGuidanceHeading = vgHeading;
          applySoftSection(model.contactDemoFallback, "office_hours", "officeHoursHeading", "officeHoursBody");
          applySoftSection(model.contactDemoFallback, "directions", "directionsHeading", "directionsBody");
          applySoftSection(model.contactDemoFallback, "service_reminder", "serviceReminderHeading", "serviceReminderBody");
          applySoftSection(model.contactDemoFallback, "message", "messageHeading", "messageBody");
        }
        if (model.givingDemoFallback) {
          applySoftSection(model.givingDemoFallback, "why", "whyHeading", null);
          applySoftSection(model.givingDemoFallback, "ways", "waysHeading", "waysBody");
          applySoftSection(model.givingDemoFallback, "accountability", "accountabilityHeading", null);
          const accBody = overlayMap.get("accountability::bodyText");
          if (accBody !== undefined) model.givingDemoFallback.accountability = accBody;
          applySoftSection(model.givingDemoFallback, "stewardship", "stewardshipHeading", "stewardshipBody");
          applySoftSection(model.givingDemoFallback, "assistance", "assistanceHeading", null);
          const assistBody = overlayMap.get("assistance::bodyText");
          if (assistBody !== undefined) model.givingDemoFallback.assistanceContact = assistBody;
          const assistBtn = overlayMap.get("assistance::buttonText");
          if (assistBtn !== undefined) model.givingDemoFallback.assistanceButtonText = assistBtn;
          if (Array.isArray(model.givingDemoFallback.whyItems)) {
            model.givingDemoFallback.whyItems = model.givingDemoFallback.whyItems.map((item) => {
              const key = item.sectionKey || "";
              if (!key) return item;
              const title = overlayMap.get(`${key}::heading`);
              const body = overlayMap.get(`${key}::bodyText`);
              if (title === undefined && body === undefined) return item;
              return {
                ...item,
                title: title !== undefined ? title : item.title,
                body: body !== undefined ? body : item.body,
              };
            });
          }
        }
        if (model.aboutDemoFallback) {
          const valuesHeading = overlayMap.get("values::heading");
          if (valuesHeading !== undefined) model.aboutDemoFallback.valuesHeading = valuesHeading;
          const galleryHeading = overlayMap.get("gallery::heading");
          if (galleryHeading !== undefined) model.aboutDemoFallback.galleryHeading = galleryHeading;
          applySoftSection(model.aboutDemoFallback, "visitor_cta", "visitorCtaHeading", "visitorCtaBody");
          const visitorBtn = overlayMap.get("visitor_cta::buttonText");
          if (visitorBtn !== undefined) model.aboutDemoFallback.visitorCtaButtonText = visitorBtn;
          ["beliefs", "community", "mission", "vision", "story"].forEach((key) => {
            const block = model.aboutDemoFallback[key];
            if (!block || typeof block !== "object") return;
            const h = overlayMap.get(`${key}::heading`);
            const b = overlayMap.get(`${key}::bodyText`);
            if (h !== undefined || b !== undefined) {
              model.aboutDemoFallback[key] = {
                ...block,
                heading: h !== undefined ? h : block.heading,
                bodyText: b !== undefined ? b : block.bodyText,
              };
            }
          });
          if (Array.isArray(model.aboutDemoFallback.values)) {
            model.aboutDemoFallback.values = model.aboutDemoFallback.values.map((item) => {
              const key = item.sectionKey || "";
              if (!key) return item;
              const h = overlayMap.get(`${key}::heading`);
              const b = overlayMap.get(`${key}::bodyText`);
              if (h === undefined && b === undefined) return item;
              return {
                ...item,
                heading: h !== undefined ? h : item.heading,
                bodyText: b !== undefined ? b : item.bodyText,
              };
            });
          }
        }
      }
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

  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, {
    secure: String((env && env.NODE_ENV) || "") === "production",
    env,
    req,
  });

  const currentPath = String(model.path || "/");
  const manageHref = isHqEditor ? "/hq/website" : "/branch-admin/content";
  const saveUrl = isHqEditor
    ? "/hq/content/api/inline-field"
    : "/branch-admin/content/api/inline-field";
  const structuredSaveUrl = isHqEditor
    ? "/hq/content/api/structured-draft"
    : "/branch-admin/content/api/structured-draft";
  const mediaUploadUrl = isHqEditor
    ? "/hq/content/media/upload"
    : "/branch-admin/content/media/upload";
  const mediaListUrl = isHqEditor
    ? "/hq/content/media"
    : "/branch-admin/content/media";
  const reviewHref = isHqEditor
    ? "/hq/content/draft-changes"
    : "/branch-admin/content/draft-changes";
  const publishUrl = isHqEditor
    ? "/hq/content/api/inline-field/publish"
    : "/branch-admin/content/api/inline-field/publish";
  const draftPreviewHref = isHqEditor
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
    if (model.giveHref) {
      model.giveHref = withEditQuery(model.giveHref, true);
    }
    const priorHrefFor = typeof model.hrefFor === "function" ? model.hrefFor.bind(model) : null;
    model.hrefFor = function hrefForEdit(pagePath) {
      const base = priorHrefFor ? priorHrefFor(pagePath) : String(pagePath || "/");
      return withEditQuery(base, true);
    };

    function mapNavTree(items) {
      if (!Array.isArray(items)) return items;
      return items.map((item) => {
        const next = {
          ...item,
          href: item.href ? withEditQuery(item.href, true) : item.href,
        };
        if (Array.isArray(item.children)) {
          next.children = mapNavTree(item.children);
        }
        return next;
      });
    }
    if (model.navigation) {
      model.navigation = {
        ...model.navigation,
        primaryItems: mapNavTree(model.navigation.primaryItems),
        mobileItems: mapNavTree(model.navigation.mobileItems),
        footerItems: mapNavTree(model.navigation.footerItems),
        navItems: mapNavTree(model.navigation.navItems),
        ctaItem: model.navigation.ctaItem
          ? {
              ...model.navigation.ctaItem,
              href: withEditQuery(model.navigation.ctaItem.href, true),
            }
          : null,
      };
      model.footerNavItems = model.navigation.footerItems;
    }
  }

  const publicBranchKey =
    (model.websiteScope && model.websiteScope.branchKey) ||
    (model.branch && model.branch.key) ||
    null;
  const primaryBranchKey =
    (tenant && tenant.primaryBranch && tenant.primaryBranch.key) ||
    (model.church && model.church.primaryBranchKey) ||
    null;
  const websiteScopeType =
    (model.websiteScope && model.websiteScope.scopeType) ||
    (publicBranchKey ? "branch" : "church");

  const settingsCatalog = editingMode
    ? buildWebsitePublicEditSettingsCatalog({
        isHqEditor,
        isBranchEditor: !isHqEditor && capability.isBranchEditor,
        pageKey: model.pageKey,
        currentPath,
        websiteScopeType,
        publicBranchKey,
        primaryBranchKey,
        contentBasePath: isHqEditor ? "/hq/content" : "/branch-admin/content",
      })
    : null;

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
    scopeType: isHqEditor ? SCOPE_TYPE.CHURCH : SCOPE_TYPE.BRANCH,
    actorRole: actorRole || capability.actorRole,
    settingsCatalog,
    settingsLinks: settingsCatalog ? settingsCatalog.links : null,
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

  model.cssHref = "/blessboard/v5/tenant-public.css?v=54";

  return model;
}

module.exports = {
  EDIT_QUERY,
  attachWebsiteAdminChrome,
  resolveWebsiteEditCapability,
  canShowWebsiteEditChrome,
  withEditQuery,
  buildDisplayBaselineMap,
};
