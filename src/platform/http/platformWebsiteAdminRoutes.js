"use strict";

const submissionService = require("../website/submissionService");
const instanceRepo = require("../website/instanceRepository");
const contentService = require("../website/contentService");
const resolver = require("../website/resolver");
const versionService = require("../website/versionService");
const mediaService = require("../website/mediaService");
const checklistService = require("../website/checklistService");
const auditService = require("../website/auditService");
const { buildWebsiteReviewDiff } = require("../website/reviewDiff");
const { PERMISSIONS, hasWebsitePermission } = require("../website/permissions");
const { ALLOWED_IMAGE_MIME } = require("../website/mediaService");
const { CSRF_FIELD, validateCsrf } = require("./v5Csrf");
const { listRecentWebsiteChanges } = require("../website/recentChangesService");
const {
  takeWebsiteOffline,
  suspendWebsite,
  restoreWebsiteAvailability,
  setWebsitePublishPolicy,
  requestLiveWebsiteChanges,
} = require("../website/lifecycleService");
const { restoreWebsiteVersionLive } = require("../website/publicationService");
const { LIFECYCLE_STATUS } = require("../website/lifecycleStatus");
const {
  getClinicWebsiteAvailability,
  setClinicWebsiteAvailability,
  loadClinicWebsiteOperational,
} = require("../../activeclinic/services/clinicWebsiteAvailabilityService");

function actorId(req) {
  const ctx = req.platformAdminContext || {};
  return ctx.platformIdentityId || ctx.userId || null;
}

function granted(req) {
  const ctx = req.platformAdminContext || {};
  return Array.isArray(ctx.permissions) ? ctx.permissions : [];
}

function registerPlatformWebsiteAdminRoutes(router, deps) {
  const {
    getPool,
    env,
    requireApex,
    requirePlatformAdmin,
    renderPlatformAdminView,
    buildPlatformAdminShellLocals,
    setAdminNoStore,
  } = deps;

  require("../../activeclinic/website/activeClinicWebsiteTemplate").registerActiveClinicWebsiteTemplate();
  require("../../blessboard/website/blessboardChurchTemplate").registerBlessBoardWebsiteTemplate();

  function canReview(req) {
    const keys = granted(req);
    if (!keys.length) return true;
    return (
      hasWebsitePermission(keys, PERMISSIONS.REVIEW) ||
      hasWebsitePermission(keys, PERMISSIONS.PUBLISH)
    );
  }

  function canToggleAvailability(req) {
    const keys = granted(req);
    if (!keys.length) return true;
    return hasWebsitePermission(keys, PERMISSIONS.PUBLISH);
  }

  function canModerate(req) {
    const keys = granted(req);
    if (!keys.length) return true;
    return (
      hasWebsitePermission(keys, PERMISSIONS.MODERATE) ||
      hasWebsitePermission(keys, PERMISSIONS.REVIEW)
    );
  }

  function canTakeOffline(req) {
    const keys = granted(req);
    if (!keys.length) return true;
    return hasWebsitePermission(keys, PERMISSIONS.TAKE_OFFLINE);
  }

  function canSuspend(req) {
    const keys = granted(req);
    if (!keys.length) return true;
    return hasWebsitePermission(keys, PERMISSIONS.SUSPEND);
  }

  function canRestore(req) {
    const keys = granted(req);
    if (!keys.length) return true;
    return (
      hasWebsitePermission(keys, PERMISSIONS.RESTORE) ||
      hasWebsitePermission(keys, PERMISSIONS.ROLLBACK)
    );
  }

  function canManagePolicy(req) {
    const keys = granted(req);
    if (!keys.length) return true;
    return hasWebsitePermission(keys, PERMISSIONS.MANAGE_POLICY);
  }

  router.get("/admin/website-changes", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const status = String(req.query.status || "submitted").trim();
      const clinic = String(req.query.clinic || "").trim();
      const listed = await submissionService.listWebsiteSubmissions(getPool(), {
        status: status === "all" ? null : status,
        limit: 100,
      });
      let rows = listed.submissions || [];
      if (clinic) {
        rows = rows.filter(
          (r) =>
            String(r.organizationKey || "").includes(clinic) ||
            String(r.organizationName || "").toLowerCase().includes(clinic.toLowerCase())
        );
      }
      const html = renderPlatformAdminView("platform-admin/website-changes.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "website-changes",
          pageTitle: "Website Changes",
        }),
        submissions: rows,
        filters: { status, clinic },
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/website-changes/:submissionId", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const row = await getPool().query(
        `SELECT s.*, i.slug, o.organization_key, o.display_name, o.id AS org_id
           FROM platform.website_submissions s
           JOIN platform.website_instances i ON i.id = s.instance_id
           JOIN platform.organizations o ON o.id = s.organization_id
          WHERE s.id = $1
          LIMIT 1`,
        [req.params.submissionId]
      );
      if (!row.rows[0]) return res.status(404).type("html").send("Submission not found.");
      const sub = submissionService.mapSubmission(row.rows[0]);
      const instance = await instanceRepo.findWebsiteInstanceById(
        getPool(),
        sub.instanceId,
        sub.organizationId
      );
      const template = instance
        ? require("../website/templateRegistry").getWebsiteTemplate(
            instance.templateId,
            instance.templateVersion
          )
        : null;
      const readiness = checklistService.evaluatePublicationReadiness({
        template,
        resolved: { values: (sub.snapshot && sub.snapshot.values) || {} },
        hasPublishedVersion: Boolean(instance && (instance.publishedAt || instance.lastPublishedAt)),
        firstPublication: !(instance && (instance.publishedAt || instance.lastPublishedAt)),
      });
      const reviewDiff = buildWebsiteReviewDiff({
        snapshot: sub.snapshot || {},
        template,
        changedKeys: sub.changedKeys,
      });
      const html = renderPlatformAdminView("platform-admin/website-change-review.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "website-changes",
          pageTitle: "Review website changes",
        }),
        sub: {
          ...sub,
          organizationKey: row.rows[0].organization_key,
          organizationName: row.rows[0].display_name,
          slug: row.rows[0].slug,
        },
        reviewDiff,
        readiness,
        canReview: canReview(req),
        requestChangesNoteRequired: false,
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/website-media/:mediaId", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const loaded = await mediaService.getWebsiteMediaById(getPool(), req.params.mediaId);
      if (!loaded.ok) return res.status(404).type("text").send("Not found");
      const payload = await mediaService.getWebsiteMediaPayload(getPool(), {
        mediaId: loaded.media.id,
        organizationId: loaded.media.organizationId,
      });
      if (!payload.ok) return res.status(404).type("text").send("Not found");
      const mime = String(payload.mimeType || "").toLowerCase();
      if (!ALLOWED_IMAGE_MIME.has(mime)) return res.status(404).type("text").send("Not found");
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=120");
      return res.status(200).send(payload.buffer);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/website-changes/:submissionId/:decision", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, `/admin/website-changes/${req.params.submissionId}?error=csrf`);
      }
      if (!canReview(req)) {
        return res.redirect(303, `/admin/website-changes/${req.params.submissionId}?error=forbidden`);
      }
      const row = await getPool().query(
        `SELECT organization_id, row_version FROM platform.website_submissions WHERE id = $1 LIMIT 1`,
        [req.params.submissionId]
      );
      if (!row.rows[0]) return res.redirect(303, "/admin/website-changes?error=not_found");
      const decided = await submissionService.decideWebsiteSubmission(getPool(), {
        organizationId: row.rows[0].organization_id,
        submissionId: req.params.submissionId,
        decision: req.params.decision,
        rowVersion: Number(req.body.rowVersion || row.rows[0].row_version),
        reviewNote: req.body.review_note || null,
        overrideReadiness: req.body.override_readiness === "1",
        actorIdentityId: actorId(req),
      });
      if (!decided.ok) {
        return res.redirect(
          303,
          `/admin/website-changes/${req.params.submissionId}?error=${encodeURIComponent(decided.code)}`
        );
      }
      return res.redirect(303, `/admin/website-changes?status=${encodeURIComponent(decided.submission.status)}`);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/organizations/:organizationKey/website", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const org = await getPool().query(
        `SELECT id, organization_key, display_name FROM platform.organizations
          WHERE organization_key = $1 LIMIT 1`,
        [String(req.params.organizationKey || "").toLowerCase()]
      );
      if (!org.rows[0]) return res.status(404).type("html").send("Organization not found.");
      const availability = await getClinicWebsiteAvailability(getPool(), {
        organizationKey: org.rows[0].organization_key,
        env,
      });
      const instances = await instanceRepo.listWebsiteInstancesForOrganization(
        getPool(),
        org.rows[0].id,
        "activeclinic"
      );
      const instance = (availability.ok && availability.instance) || instances[0] || null;
      let unpublishedCount = 0;
      let versions = [];
      let media = [];
      let audit = { events: [] };
      let checklist = null;
      let pending = [];
      if (instance) {
        const changes = await contentService.listUnpublishedChanges(getPool(), instance, instance.organizationId);
        unpublishedCount = changes.length;
        versions = (await versionService.listWebsiteVersions(getPool(), {
          instanceId: instance.id,
          organizationId: instance.organizationId,
        })).versions;
        media = (await mediaService.listWebsiteMedia(getPool(), {
          organizationId: instance.organizationId,
          instanceId: instance.id,
        })).media;
        audit = await auditService.listWebsiteAudit(getPool(), {
          organizationId: instance.organizationId,
          instanceId: instance.id,
          limit: 50,
        });
        const cl = await checklistService.getWebsiteChecklist(getPool(), {
          organizationId: instance.organizationId,
          instance,
          operational: availability.ok
            ? await loadClinicWebsiteOperational(getPool(), org.rows[0].id)
            : {},
        });
        checklist = cl.ok ? cl.checklist : null;
        pending = (await submissionService.listWebsiteSubmissions(getPool(), {
          organizationId: instance.organizationId,
          instanceId: instance.id,
          status: "submitted",
        })).submissions;
      }
      const html = renderPlatformAdminView("platform-admin/organization-website.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "organizations",
          pageTitle: "Clinic website",
        }),
        organization: org.rows[0],
        instance,
        unpublishedCount,
        versions,
        media,
        auditEvents: audit.events || [],
        checklist,
        pendingSubmissions: pending,
        availability: availability.ok ? availability : null,
        canToggleAvailability: canToggleAvailability(req),
        canModerate: canModerate(req),
        canTakeOffline: canTakeOffline(req),
        canSuspend: canSuspend(req),
        canRestore: canRestore(req),
        canManagePolicy: canManagePolicy(req),
        notice: String(req.query.notice || ""),
        error: String(req.query.error || ""),
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  function websiteManagePath(organizationKey, query) {
    const base = `/admin/organizations/${encodeURIComponent(organizationKey)}/website`;
    if (!query) return base;
    return `${base}?${query}`;
  }

  async function handleAvailabilityToggle(req, res, next, wantPublic) {
    try {
      const organizationKey = String(req.params.organizationKey || "").toLowerCase();
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=csrf"));
      }
      if (!canToggleAvailability(req)) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
      }
      const result = await setClinicWebsiteAvailability(getPool(), {
        organizationKey,
        public: wantPublic,
        actorIdentityId: actorId(req),
        overrideReadiness: req.body && req.body.override_readiness === "1",
        reason: req.body && req.body.reason,
        env,
      });
      if (!result.ok) {
        return res.redirect(
          303,
          websiteManagePath(organizationKey, `error=${encodeURIComponent(result.code)}`)
        );
      }
      return res.redirect(
        303,
        websiteManagePath(organizationKey, wantPublic ? "notice=published" : "notice=unpublished")
      );
    } catch (err) {
      return next(err);
    }
  }

  router.post(
    "/admin/organizations/:organizationKey/website/publish",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleAvailabilityToggle(req, res, next, true)
  );

  router.post(
    "/admin/organizations/:organizationKey/website/unpublish",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleAvailabilityToggle(req, res, next, false)
  );

  router.post("/admin/organizations/:organizationKey/website/versions/:versionId/restore", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, `/admin/organizations/${req.params.organizationKey}/website?error=csrf`);
      }
      if (!canRestore(req)) {
        return res.redirect(303, `/admin/organizations/${req.params.organizationKey}/website?error=forbidden`);
      }
      const org = await getPool().query(
        `SELECT id, organization_key FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
        [String(req.params.organizationKey || "").toLowerCase()]
      );
      if (!org.rows[0]) return res.redirect(303, "/admin/organizations?error=not_found");
      const instances = await instanceRepo.listWebsiteInstancesForOrganization(getPool(), org.rows[0].id);
      const instance = instances[0];
      if (!instance) {
        return res.redirect(303, `/admin/organizations/${req.params.organizationKey}/website?error=not_found`);
      }
      const restored = await restoreWebsiteVersionLive(getPool(), {
        organizationId: org.rows[0].id,
        instanceId: instance.id,
        versionId: req.params.versionId,
        actorIdentityId: actorId(req),
      });
      if (!restored.ok) {
        return res.redirect(
          303,
          `/admin/organizations/${req.params.organizationKey}/website?error=${encodeURIComponent(restored.code)}`
        );
      }
      return res.redirect(303, `/admin/organizations/${req.params.organizationKey}/website?notice=restored`);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/recent-website-changes", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const listed = await listRecentWebsiteChanges(getPool(), {
        productCode: String(req.query.product || "").trim() || null,
        lifecycleStatus: String(req.query.lifecycle || "").trim() || null,
        tenant: String(req.query.tenant || "").trim() || null,
        flagged: String(req.query.flagged || "") === "1",
        limit: 80,
      });
      let rows = listed.changes || [];
      const filter = String(req.query.filter || "").trim();
      if (filter === "provisional") rows = rows.filter((r) => r.lifecycleStatus === "provisional");
      if (filter === "public") rows = rows.filter((r) => r.lifecycleStatus === "public");
      if (filter === "suspended") rows = rows.filter((r) => r.lifecycleStatus === "suspended");
      if (filter === "under_review") {
        rows = rows.filter(
          (r) => r.lifecycleStatus === "under_review" || r.moderationState === "submitted"
        );
      }
      const html = renderPlatformAdminView("platform-admin/recent-website-changes.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "recent-website-changes",
          pageTitle: "Recent Website Changes",
        }),
        changes: rows,
        filters: {
          product: String(req.query.product || ""),
          tenant: String(req.query.tenant || ""),
          lifecycle: String(req.query.lifecycle || ""),
          filter,
          flagged: String(req.query.flagged || "") === "1",
        },
        canModerate: canModerate(req),
        canTakeOffline: canTakeOffline(req),
        canSuspend: canSuspend(req),
        canRestore: canRestore(req),
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  async function loadOrgInstance(organizationKey) {
    const org = await getPool().query(
      `SELECT id, organization_key, display_name FROM platform.organizations
        WHERE organization_key = $1 LIMIT 1`,
      [String(organizationKey || "").toLowerCase()]
    );
    if (!org.rows[0]) return { org: null, instance: null };
    const instances = await instanceRepo.listWebsiteInstancesForOrganization(
      getPool(),
      org.rows[0].id
    );
    return { org: org.rows[0], instance: instances[0] || null };
  }

  async function handleModerationAction(req, res, next, action) {
    try {
      const organizationKey = String(req.params.organizationKey || "").toLowerCase();
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=csrf"));
      }
      const loaded = await loadOrgInstance(organizationKey);
      if (!loaded.org || !loaded.instance) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=not_found"));
      }
      const body = {
        organizationId: loaded.org.id,
        instanceId: loaded.instance.id,
        actorIdentityId: actorId(req),
        reason: req.body && req.body.reason,
        notes: req.body && req.body.notes,
        notePublic: req.body && req.body.note_public,
        notesTenantVisible: true,
      };
      let result;
      if (action === "offline") {
        if (!canTakeOffline(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await takeWebsiteOffline(getPool(), body);
      } else if (action === "suspend") {
        if (!canSuspend(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await suspendWebsite(getPool(), {
          ...body,
          editLocked: req.body && req.body.edit_lock !== "0",
          publishLocked: req.body && req.body.publish_lock !== "0",
        });
      } else if (action === "restore-site") {
        if (!canRestore(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await restoreWebsiteAvailability(getPool(), {
          ...body,
          lifecycleStatus: req.body && req.body.lifecycle_status,
        });
      } else if (action === "request-changes") {
        if (!canModerate(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await requestLiveWebsiteChanges(getPool(), {
          ...body,
          takeOffline: req.body && req.body.take_offline === "1",
          targetVersionId: req.body && req.body.version_id,
        });
      } else if (action === "policy") {
        if (!canManagePolicy(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await setWebsitePublishPolicy(getPool(), {
          ...body,
          publishPolicy: req.body && req.body.publish_policy,
        });
      } else {
        result = { ok: false, code: "invalid_input" };
      }
      if (!result.ok) {
        return res.redirect(303, websiteManagePath(organizationKey, `error=${encodeURIComponent(result.code)}`));
      }
      return res.redirect(303, websiteManagePath(organizationKey, `notice=${encodeURIComponent(action)}`));
    } catch (err) {
      return next(err);
    }
  }

  router.post(
    "/admin/organizations/:organizationKey/website/offline",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "offline")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/suspend",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "suspend")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/restore-site",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "restore-site")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/request-changes",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "request-changes")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/policy",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "policy")
  );

  void resolver;
  void LIFECYCLE_STATUS;
}

module.exports = {
  registerPlatformWebsiteAdminRoutes,
};
