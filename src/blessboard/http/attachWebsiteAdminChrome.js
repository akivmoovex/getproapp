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
const {
  DEFAULT_BLESSBOARD_LOGO_SRC,
} = require("../website/blessboardChurchTemplate");
const { findBlessBoardWebsiteInstance } = require("../website/blessboardWebsiteAdapter");
const { resolveWebsiteContent, MODE } = require("../../platform/website/resolver");
const {
  imageFromWebsiteValue,
  pickHexColor,
  publicBrandStyle,
} = require("../../platform/website/branding");
const { PRODUCT_CODE, withEditorNavigationQuery, withoutEditorNavigationQuery, withPreviewNavigationQuery } = require("../../platform/website/publicWebsiteUrl");

const EDIT_QUERY = "website_edit";

async function attachBlessBoardWebsiteBranding(db, model, tenant, mode) {
  if (!model) return;
  if (!model.websiteLogoUrl) {
    model.websiteLogoUrl = DEFAULT_BLESSBOARD_LOGO_SRC;
    model.websiteLogoAlt = "";
    model.websiteLogoMediaId = "";
  }
  const organizationId =
    tenant && tenant.organization && tenant.organization.id
      ? String(tenant.organization.id)
      : "";
  if (!organizationId || !db || typeof db.query !== "function") return;
  try {
    const instance = await findBlessBoardWebsiteInstance(db, organizationId);
    if (!instance) return;
    const resolved = await resolveWebsiteContent(db, {
      organizationId,
      instance,
      mode: mode === "draft" ? MODE.DRAFT : MODE.LIVE,
    });
    if (!resolved.ok) return;
    const img = imageFromWebsiteValue(resolved.values && resolved.values["home.logo"]);
    if (img.src) {
      model.websiteLogoUrl = img.src;
      model.websiteLogoAlt = img.alt;
      model.websiteLogoMediaId = img.mediaId;
    }
    const hero = imageFromWebsiteValue(resolved.values && resolved.values["home.hero.image"]);
    if (hero.src) {
      model.websiteHeroUrl = hero.src;
      model.websiteHeroAlt = hero.alt;
      model.websiteHeroMediaId = hero.mediaId;
      if (model.homeDemoFallback) {
        model.homeDemoFallback = {
          ...model.homeDemoFallback,
          heroMediaUrl: hero.src,
        };
      }
      const sections = Array.isArray(model.sections) ? model.sections : [];
      const heroSection = sections.find(
        (s) =>
          s &&
          (String(s.sectionKey || "") === "hero" ||
            String(s.sectionType || "") === "hero" ||
            String(s.sectionKey || "").indexOf("hero") >= 0)
      );
      if (heroSection) {
        heroSection.mediaUrl = hero.src;
        heroSection.layoutMetadata = {
          ...(heroSection.layoutMetadata || {}),
          altText: hero.alt || (heroSection.layoutMetadata && heroSection.layoutMetadata.altText) || "",
        };
      }
    }
    const brandPrimary = pickHexColor(resolved.values, "brand.primary_color");
    const brandAccent = pickHexColor(resolved.values, "brand.accent_color");
    if (brandPrimary) model.brandPrimary = brandPrimary;
    if (brandAccent) model.brandAccent = brandAccent;
    model.brandStyle = publicBrandStyle(PRODUCT_CODE.BLESSBOARD, brandPrimary, brandAccent);
  } catch {
    /* keep default platform mark */
  }
}

function queryRequestsWebsitePreview(req) {
  const q = (req && req.query) || {};
  if (String(q[EDIT_QUERY] || "") === "1") return true;
  const mode = String(q.website_mode || "").trim().toLowerCase();
  return mode === "draft" || mode === "preview";
}

/**
 * Authorized editors may preview unpublished websites; anonymous visitors cannot.
 * @param {{ query: Function }} pool
 * @param {import('express').Request} req
 * @param {object|null} tenant
 * @param {string|null} [branchId]
 */
async function resolveAuthorizedPublicPreview(pool, req, tenant, branchId) {
  if (!queryRequestsWebsitePreview(req)) return false;
  const session =
    req && req.v5Session && req.v5Session.authenticated && req.v5Session.session
      ? req.v5Session.session
      : null;
  if (!session || !session.userId) return false;
  try {
    const cap = await resolveWebsiteEditCapability(pool, {
      userId: session.userId,
      tenant,
      branchId: branchId || null,
    });
    return Boolean(cap && cap.canEdit);
  } catch {
    return false;
  }
}

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
  return editing ? withEditorNavigationQuery(path) : withoutEditorNavigationQuery(path);
}

function withPreviewQuery(path) {
  return withPreviewNavigationQuery(path);
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

  await attachBlessBoardWebsiteBranding(db, model, tenant, "live");

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
  if (showDraftContent) {
    await attachBlessBoardWebsiteBranding(db, model, tenant, "draft");
  }

  let draftCount = 0;
  let overlayMap = new Map();
  let structuredDrafts = [];
  /** @type {Record<string, string>} */
  let publishedBaselines = Object.create(null);
  try {
    draftCount = await countAllWebsiteDrafts(db, {
      organizationId,
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
        organizationId,
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

  const {
    presentEditorShell,
    buildEditorPages,
  } = require("../../platform/website-engine/editorShell");
  const {
    PRODUCT_CODE,
    buildPublicOrganizationWebsitePath,
    buildPublicWebsiteEditPath,
    buildPublicWebsitePreviewPath,
    buildPublicWebsiteDiscardPath,
    buildPublicWebsiteUnpublishPath,
    buildPublicWebsiteHistoryPath,
    buildPublicWebsiteMediaLibraryPath,
    buildPublicWebsiteStylesPath,
    buildPublicWebsiteSeoPath,
    buildPublicWebsiteAddSectionPath,
  } = require("../../platform/website/publicWebsiteUrl");
  const currentPath = String(model.path || "/");
  const orgKey =
    (tenant && tenant.organization && (tenant.organization.key || tenant.organization.organizationKey)) ||
    "";
  const pathMode = String(model.routingMode || "") === "path" || String(currentPath).indexOf("/c/") === 0;
  const publicBase = pathMode && orgKey
    ? buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: orgKey,
      })
    : "";
  const manageHref = isHqEditor ? "/hq/website" : "/branch-admin/content";
  const saveUrl = pathMode && publicBase
    ? `${publicBase}/website/drafts`
    : "/website/drafts";
  const structuredSaveUrl = isHqEditor
    ? "/hq/content/api/structured-draft"
    : "/branch-admin/content/api/structured-draft";
  const mediaUploadUrl = pathMode && publicBase
    ? `${publicBase}/website/media`
    : "/website/media";
  const mediaListUrl = mediaUploadUrl;
  const reviewHref = isHqEditor
    ? "/hq/content/draft-changes"
    : "/branch-admin/content/draft-changes";
  const publishUrl = pathMode && publicBase
    ? `${publicBase}/website/publish`
    : "/website/publish";
  const draftPreviewHref = orgKey
    ? buildPublicWebsitePreviewPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: orgKey,
      })
    : "/hq/content/draft-preview/home";

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

  const editorScope =
    publicBranchKey && websiteScopeType === "branch"
      ? { kind: "branch", branchKey: publicBranchKey }
      : null;
  const draftPreviewHrefResolved = orgKey
    ? buildPublicWebsitePreviewPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: orgKey,
        pageKey: model.pageKey,
        scope: editorScope,
      })
    : draftPreviewHref;
  const backToEditHref = orgKey
    ? buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: orgKey,
        pageKey: model.pageKey,
        scope: editorScope,
      })
    : withEditQuery(currentPath, true);
  const discardPath =
    pathMode && publicBase ? `${publicBase}/website/drafts/discard` : null;
  const sectionActionsUrl =
    pathMode && publicBase ? `${publicBase}/website/section-actions` : null;
  const addSectionUrl =
    pathMode && publicBase ? `${publicBase}/website/add-section` : null;
  const unpublishPath = isHqEditor
    ? buildPublicWebsiteUnpublishPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: orgKey,
      })
    : null;

  if (previewDraftMode && !editingMode) {
    const mapPreviewNav = function mapPreviewNav(items) {
      if (!Array.isArray(items)) return items;
      return items.map((item) => {
        const next = {
          ...item,
          href: item.href ? withPreviewQuery(item.href) : item.href,
        };
        if (Array.isArray(item.children)) next.children = mapPreviewNav(item.children);
        return next;
      });
    };
    if (Array.isArray(model.navItems)) {
      model.navItems = model.navItems.map((item) => ({
        ...item,
        href: item.href ? withPreviewQuery(item.href) : item.href,
      }));
    }
    if (model.navigation) {
      model.navigation = {
        ...model.navigation,
        primaryItems: mapPreviewNav(model.navigation.primaryItems),
        mobileItems: mapPreviewNav(model.navigation.mobileItems),
        footerItems: mapPreviewNav(model.navigation.footerItems),
        navItems: mapPreviewNav(model.navigation.navItems),
        ctaItem: model.navigation.ctaItem
          ? {
              ...model.navigation.ctaItem,
              href: model.navigation.ctaItem.href
                ? withPreviewQuery(model.navigation.ctaItem.href)
                : model.navigation.ctaItem.href,
            }
          : null,
      };
      model.footerNavItems = model.navigation.footerItems;
    }
  }

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

  const seoLink =
    pathMode && publicBase && (isHqEditor || capability.isBranchEditor)
      ? {
          available: true,
          href: buildPublicWebsiteSeoPath({
            product: PRODUCT_CODE.BLESSBOARD,
            organizationKey: orgKey,
            scope: editorScope,
          }),
        }
      : settingsCatalog && settingsCatalog.links && settingsCatalog.links.seo;
  const brandingHref =
    pathMode && publicBase && (isHqEditor || capability.isBranchEditor)
      ? buildPublicWebsiteStylesPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: orgKey,
          scope: editorScope,
        })
      : isHqEditor
        ? "/hq/website/branding"
        : null;
  const historyHref =
    pathMode && publicBase && (isHqEditor || capability.isBranchEditor)
      ? buildPublicWebsiteHistoryPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: orgKey,
          scope: editorScope,
        })
      : null;
  const mediaLibraryHref =
    pathMode && publicBase && (isHqEditor || capability.isBranchEditor)
      ? buildPublicWebsiteMediaLibraryPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: orgKey,
          scope: editorScope,
        })
      : null;
  const editorPages = orgKey
    ? buildEditorPages({
        productCode: PRODUCT_CODE.BLESSBOARD,
        organizationKey: orgKey,
        pageKey: model.pageKey,
        scope: editorScope,
      })
    : [];
  const moreItems = [];
  if (manageHref) {
    moreItems.push({
      id: "settings",
      label: "Website settings",
      icon: "settings",
      href: manageHref,
      group: "general",
    });
  }
  if (brandingHref) {
    moreItems.push({
      id: "branding",
      label: "Branding",
      icon: "palette",
      href: brandingHref,
      group: "general",
    });
  }
  if (historyHref) {
    moreItems.push({
      id: "history",
      label: "Version history",
      icon: "history",
      href: historyHref,
      group: "general",
    });
  }
  if (mediaLibraryHref) {
    moreItems.push({
      id: "assets",
      label: "Assets",
      icon: "folder",
      href: mediaLibraryHref,
      group: "product",
    });
  }
  moreItems.push({
    id: "features",
    label: "Website features",
    icon: "widgets",
    action: "features",
    group: "product",
  });
  if (seoLink && seoLink.available && seoLink.href) {
    moreItems.push({
      id: "seo",
      label: "SEO",
      icon: "search",
      href: seoLink.href,
      group: "product",
    });
  }
  if (hasDraftChanges) {
    moreItems.push({
      id: "discard-draft",
      label: "Discard draft changes",
      icon: "delete",
      action: "lifecycle",
      lifecycle: "discard",
      destructive: true,
      group: "lifecycle",
    });
  }
  if (isHqEditor && unpublishPath) {
    moreItems.push({
      id: "unpublish",
      label: "Unpublish website",
      icon: "public_off",
      action: "lifecycle",
      lifecycle: "unpublish",
      destructive: true,
      group: "lifecycle",
    });
  }

  const {
    buildManifest: buildBlessBoardSectionManifest,
  } = require("../website/blessboardSectionActionService");
  const sectionManifest = editingMode
    ? buildBlessBoardSectionManifest(model.pageKey, model.sections, structuredDrafts)
    : null;

  const shellFacts = {
    productCode: PRODUCT_CODE.BLESSBOARD,
    pageKey: model.pageKey,
    pages: editorPages,
    moreItems,
    brandingHref,
    historyHref,
    hubHref: manageHref,
    draft: hasDraftChanges,
    unpublishedCount: draftCount,
    canEdit: true,
    canPublish: isHqEditor,
    previewHref: draftPreviewHrefResolved,
    backToEditHref,
    publishPath: publishUrl,
    discardPath,
    unpublishPath,
    exitHref: withEditQuery(currentPath, false),
    exitMethod: "GET",
    saveUrl,
    mediaUrl: mediaUploadUrl,
    csrfToken,
    csrfField: "_csrf",
    sectionActionsUrl,
    addSectionUrl,
    sectionManifest,
  };

  model.websiteAdmin = {
    canEdit: true,
    editingMode,
    previewDraftMode: previewDraftMode && !editingMode,
    status,
    showDemoNotice: usedPublicDemoFill,
    manageHref,
    editHref: withEditQuery(currentPath, true),
    exitHref: withEditQuery(currentPath, false),
    reviewHref,
    draftPreviewHref: draftPreviewHrefResolved,
    hasDraftChanges,
    draftCount,
    csrfToken,
    saveUrl,
    publishUrl,
    structuredSaveUrl,
    mediaUploadUrl,
    mediaListUrl,
    pathPrefix: model.pathPrefix || publicBase || "",
    canPublish: isHqEditor,
    editorShell: editingMode
      ? presentEditorShell({ ...shellFacts, editing: true })
      : previewDraftMode
        ? presentEditorShell({ ...shellFacts, previewMode: true, editing: false })
        : null,
    legacyInlineSaveUrl: isHqEditor
      ? "/hq/content/api/inline-field"
      : "/branch-admin/content/api/inline-field",
    legacyInlinePublishUrl: isHqEditor
      ? "/hq/content/api/inline-field/publish"
      : "/branch-admin/content/api/inline-field/publish",
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

  model.cssHref = "/blessboard/v5/tenant-public.css?v=55";

  return model;
}

module.exports = {
  EDIT_QUERY,
  attachWebsiteAdminChrome,
  resolveWebsiteEditCapability,
  resolveAuthorizedPublicPreview,
  canShowWebsiteEditChrome,
  withEditQuery,
  buildDisplayBaselineMap,
};
