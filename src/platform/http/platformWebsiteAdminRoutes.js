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
const {
  approveAndProvisionClinicRegistration,
  rejectClinicRegistration,
} = require("../../activeclinic/services/approveClinicRegistrationService");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const { getDeploymentEnvMode } = require("../../church/blessBoardEnv");

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
      const instances = await instanceRepo.listWebsiteInstancesForOrganization(getPool(), org.rows[0].id);
      const instance = instances[0] || null;
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
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/organizations/:organizationKey/website/versions/:versionId/restore", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, `/admin/organizations/${req.params.organizationKey}/website?error=csrf`);
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
      const restored = await versionService.restoreWebsiteVersionToDraft(getPool(), {
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

  router.get("/admin/clinic-registrations", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const status = String(req.query.status || "pending_review").trim();
      const listed = await getPool().query(
        `SELECT id, application_number, clinic_name, contact_name, contact_email_display,
                contact_phone_display, province, city, address, country_code,
                status, provisioning_status, created_at, organization_id
           FROM activeclinic.clinic_registration_applications
          WHERE ($1 = 'all' OR status = $1)
          ORDER BY created_at DESC
          LIMIT 100`,
        [status]
      );
      const html = renderPlatformAdminView("platform-admin/clinic-registrations.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "clinic-registrations",
          pageTitle: "Clinic Registrations",
        }),
        applications: listed.rows,
        filters: { status },
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/clinic-registrations/:applicationId", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const listed = await getPool().query(
        `SELECT id, application_number, clinic_name, contact_name, contact_email_display,
                contact_phone_display, province, city, address, country_code, notes,
                status, provisioning_status, created_at, reviewed_at, organization_id,
                last_provision_error
           FROM activeclinic.clinic_registration_applications
          WHERE id = $1
          LIMIT 1`,
        [req.params.applicationId]
      );
      if (!listed.rows[0]) {
        return res.redirect(303, "/admin/clinic-registrations?error=not_found");
      }
      const html = renderPlatformAdminView("platform-admin/clinic-registration-detail.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "clinic-registrations",
          pageTitle: "Clinic registration",
        }),
        application: listed.rows[0],
        notice: String(req.query.notice || ""),
        error: String(req.query.error || ""),
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/clinic-registrations/:applicationId/approve", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, "/admin/clinic-registrations?error=csrf");
      }
      const mode = getDeploymentEnvMode(env);
      const result = await approveAndProvisionClinicRegistration(getPool(), {
        applicationId: req.params.applicationId,
        actorIdentityId: actorId(req),
        dataEnvironment: mode === "production" ? "production" : "testing",
        deploymentCode: getPlatformDeploymentCode(env),
      });
      if (!result.ok) {
        return res.redirect(303, `/admin/clinic-registrations/${encodeURIComponent(req.params.applicationId)}?error=${encodeURIComponent(result.code)}`);
      }
      return res.redirect(303, `/admin/clinic-registrations/${encodeURIComponent(req.params.applicationId)}?notice=approved`);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/clinic-registrations/:applicationId/reject", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, "/admin/clinic-registrations?error=csrf");
      }
      const result = await rejectClinicRegistration(getPool(), {
        applicationId: req.params.applicationId,
        actorIdentityId: actorId(req),
      });
      if (!result.ok) {
        return res.redirect(303, `/admin/clinic-registrations/${encodeURIComponent(req.params.applicationId)}?error=${encodeURIComponent(result.code)}`);
      }
      return res.redirect(303, `/admin/clinic-registrations/${encodeURIComponent(req.params.applicationId)}?notice=rejected`);
    } catch (err) {
      return next(err);
    }
  });

  void resolver;
}

module.exports = {
  registerPlatformWebsiteAdminRoutes,
};
