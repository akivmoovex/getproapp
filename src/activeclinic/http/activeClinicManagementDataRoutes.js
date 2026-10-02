"use strict";

/**
 * ACN25 Performance Dashboard + ACN26 Import/Export Centre routes.
 */

const multer = require("multer");
const {
  validateCsrf,
  CSRF_FIELD,
} = require("../../platform/http/v5Csrf");
const {
  createRequireActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
  renderSimpleState,
} = require("./activeClinicPermissionMiddleware");
const {
  createActiveClinicAppRenderer,
} = require("./renderActiveClinicShell");
const {
  loadClinicPerformanceDashboard,
} = require("../services/activeClinicPerformanceService");
const {
  registerActiveClinicDataJobAdapters,
  SETUP_REQUIRED,
} = require("../services/activeClinicDataJobAdapters");
const {
  previewDataJobImport,
  commitDataJobImport,
  runDataJobExport,
  downloadDataJobArtifact,
  listOrganizationDataJobs,
  getDataJob,
  listDataJobAdapters,
} = require("../../platform/jobs");
const {
  listStaffMembersByFacility,
} = require("../services/activeClinicStaffService");
const {
  listFacilitiesByOrganization,
} = require("../services/facilityService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

let adaptersRegistered = false;
function ensureAdapters() {
  if (!adaptersRegistered) {
    registerActiveClinicDataJobAdapters();
    adaptersRegistered = true;
  }
}

function trustedFromAuth(auth) {
  const facility = auth.selectedFacility || null;
  const staff = auth.staff || auth.staffMember || null;
  return {
    organizationId: auth.tenantId || (auth.organization && auth.organization.id),
    facilityId: facility && facility.id,
    healthcareOrganizationId:
      auth.healthcareOrganizationId ||
      (auth.healthcareOrganization && auth.healthcareOrganization.id) ||
      null,
    staffId: staff && staff.id,
  };
}

function actorIdentityId(auth) {
  return (
    (auth.platformIdentity && auth.platformIdentity.id) ||
    auth.identityId ||
    auth.platformIdentityId ||
    null
  );
}

function registerActiveClinicManagementDataRoutes(app, deps) {
  ensureAdapters();
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });
  const { renderShell } = createActiveClinicAppRenderer({
    getPool,
    env,
    isProduction,
  });

  // ========================================================================
  // ACN25 — Performance dashboard
  // ========================================================================

  app.get(
    "/app/performance",
    requireAuth,
    requirePermission("activeclinic.performance.view"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/performance");
        }
        const orgId = auth.tenantId || (auth.organization && auth.organization.id);
        const hcoId =
          auth.healthcareOrganizationId ||
          (auth.healthcareOrganization && auth.healthcareOrganization.id);

        const facilitiesListed = await listFacilitiesByOrganization(getPool(), {
          organizationId: orgId,
          healthcareOrganizationId: hcoId,
        });
        const facilities = (facilitiesListed.facilities || []).map((f) => ({
          id: f.id,
          displayName: f.displayName || f.display_name || "Facility",
        }));

        let practitioners = [];
        const staffListed = await listStaffMembersByFacility(getPool(), {
          organizationId: orgId,
          facilityId: facility.id,
        });
        if (staffListed.ok) {
          practitioners = (staffListed.staffMembers || []).map((s) => ({
            id: s.id,
            displayName:
              [s.firstName || s.first_name, s.lastName || s.last_name]
                .filter(Boolean)
                .join(" ") || "Staff",
          }));
        }

        const loaded = await loadClinicPerformanceDashboard(getPool(), {
          organizationId: orgId,
          healthcareOrganizationId: hcoId,
          facilityId: facility.id,
          permissions: auth.permissions || [],
          filters: {
            from: req.query.from,
            to: req.query.to,
            practitionerId: req.query.practitioner,
            facilityId: req.query.location || facility.id,
          },
          facilities,
          practitioners,
        });

        if (!loaded.ok) {
          return res.status(loaded.httpStatus || 403).type("html").send(
            renderSimpleState("Access denied", "Unable to load performance dashboard.", {
              status: loaded.httpStatus || 403,
              linkHref: "/app",
              linkLabel: "Back to dashboard",
            })
          );
        }

        return await renderShell(req, res, {
          activeNav: "performance",
          content: "app/performance-dashboard-content.ejs",
          pageHeader: {
            title: "Clinic performance",
            description: "Aggregated appointments, wait times, and revenue. No clinical narratives.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Management", href: "/app" },
            { label: "Performance" },
          ],
          pageData: loaded,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // ACN26 — Import / Export centre
  // ========================================================================

  app.get(
    "/app/data",
    requireAuth,
    requirePermission(["activeclinic.data.import", "activeclinic.data.export"]),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/data");
        }
        const trusted = trustedFromAuth(auth);
        const perms = new Set(auth.permissions || []);
        const jobs = await listOrganizationDataJobs(getPool(), {
          trusted,
          productCode: "activeclinic",
          limit: 20,
          offset: 0,
        });
        const adapters = listDataJobAdapters("activeclinic");

        return await renderShell(req, res, {
          activeNav: "data",
          content: "app/data-import-export-content.ejs",
          pageHeader: {
            title: "Import & export",
            description: "Import setup catalogue data or export operational lists. Audited platform jobs.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Management", href: "/app" },
            { label: "Import & export" },
          ],
          pageData: {
            stitch: {
              desktop: "4137e48363914fa1be8a0bff9b3970c3",
              mobile: "ef7f27a94f464d6daa4d39d0a81771d9",
            },
            capabilities: {
              canImport: perms.has("activeclinic.data.import"),
              canExport: perms.has("activeclinic.data.export"),
            },
            importTypes: [
              {
                entityKey: "ac.setup_catalogue",
                label: "Charge catalogue (setup)",
                requiredHeaders: SETUP_REQUIRED,
              },
            ],
            exportTypes: [
              { entityKey: "ac.patients", label: "Patient list" },
              { entityKey: "ac.appointments", label: "Appointments" },
              { entityKey: "ac.services", label: "Services / catalogue" },
              { entityKey: "ac.financial_summary", label: "Financial summary" },
            ],
            adapters,
            jobs: jobs.ok ? jobs.jobs : [],
            flash: {
              error: req.query.error || null,
              success: req.query.success || null,
            },
            preview: null,
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/data/import/preview",
    requireAuth,
    requirePermission("activeclinic.data.import"),
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const entityKey = String(req.body.entity_key || "").trim();
        if (entityKey !== "ac.setup_catalogue") {
          return res.redirect(303, "/app/data?error=unsupported_type");
        }
        if (!req.file) {
          return res.redirect(303, "/app/data?error=file_required");
        }
        const trusted = trustedFromAuth(auth);
        const result = await previewDataJobImport(getPool(), {
          trusted,
          productCode: "activeclinic",
          entityKey,
          actorIdentityId: actorIdentityId(auth),
          buffer: req.file.buffer,
          filename: req.file.originalname,
          requiredHeaders: SETUP_REQUIRED,
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/data?error=${encodeURIComponent(result.code || "preview_failed")}`
          );
        }
        return await renderShell(req, res, {
          activeNav: "data",
          content: "app/data-import-export-content.ejs",
          pageHeader: {
            title: "Import preview",
            description: "Review validation results before confirming.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Import & export", href: "/app/data" },
            { label: "Preview" },
          ],
          pageData: {
            stitch: {
              desktop: "4137e48363914fa1be8a0bff9b3970c3",
              mobile: "ef7f27a94f464d6daa4d39d0a81771d9",
            },
            capabilities: { canImport: true, canExport: false },
            importTypes: [],
            exportTypes: [],
            adapters: [],
            jobs: [],
            flash: {},
            preview: {
              jobId: result.job.id,
              validation: result.validation,
              preview: result.preview,
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/data/import/confirm",
    requireAuth,
    requirePermission("activeclinic.data.import"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const jobId = String(req.body.job_id || "").trim();
        const trusted = trustedFromAuth(auth);
        const result = await commitDataJobImport(getPool(), {
          trusted,
          jobId,
          actorIdentityId: actorIdentityId(auth),
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/data?error=${encodeURIComponent(result.code || "commit_failed")}`
          );
        }
        return res.redirect(
          303,
          `/app/data/jobs/${result.job.id}?success=import_committed`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/data/export",
    requireAuth,
    requirePermission("activeclinic.data.export"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const entityKey = String(req.body.entity_key || "").trim();
        const allowed = new Set([
          "ac.patients",
          "ac.appointments",
          "ac.services",
          "ac.financial_summary",
        ]);
        if (!allowed.has(entityKey)) {
          return res.redirect(303, "/app/data?error=unsupported_type");
        }
        const trusted = trustedFromAuth(auth);
        const result = await runDataJobExport(getPool(), {
          trusted,
          productCode: "activeclinic",
          entityKey,
          actorIdentityId: actorIdentityId(auth),
          filters: {
            from: String(req.body.from || "").trim() || null,
            to: String(req.body.to || "").trim() || null,
          },
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/data?error=${encodeURIComponent(result.code || "export_failed")}`
          );
        }
        return res.redirect(303, `/app/data/jobs/${result.job.id}/download`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/data/jobs/:jobId",
    requireAuth,
    requirePermission(["activeclinic.data.import", "activeclinic.data.export"]),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const trusted = trustedFromAuth(auth);
        const result = await getDataJob(getPool(), {
          trusted,
          jobId: req.params.jobId,
        });
        if (!result.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Data job not found.", { status: 404 })
          );
        }
        return await renderShell(req, res, {
          activeNav: "data",
          content: "app/data-job-result-content.ejs",
          pageHeader: {
            title: "Job result",
            description: `${result.job.jobKind} · ${result.job.entityKey}`,
            actions: result.job.outputFileRef
              ? [
                  {
                    label: "Download",
                    href: `/app/data/jobs/${result.job.id}/download`,
                  },
                ]
              : [],
          },
          breadcrumbs: [
            { label: "Import & export", href: "/app/data" },
            { label: "Result" },
          ],
          pageData: {
            job: result.job,
            events: result.events,
            success: req.query.success || null,
            stitch: {
              desktop: "4137e48363914fa1be8a0bff9b3970c3",
              mobile: "ef7f27a94f464d6daa4d39d0a81771d9",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/data/jobs/:jobId/download",
    requireAuth,
    requirePermission("activeclinic.data.export"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const trusted = trustedFromAuth(auth);
        const result = await downloadDataJobArtifact(getPool(), {
          trusted,
          jobId: req.params.jobId,
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/data?error=${encodeURIComponent(result.code || "download_failed")}`
          );
        }
        res.setHeader("Content-Type", result.artifact.contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${String(result.artifact.filename).replace(/"/g, "")}"`
        );
        return res.status(200).send(result.artifact.body);
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicManagementDataRoutes,
};
