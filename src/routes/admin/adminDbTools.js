/**
 * Admin test-data seed / clear: GET page + JSON API (super-admin only).
 * Enable/disable: `areAdminDbFixturesEnabled()` in `src/admin/dbFixturesEnv.js` only (no NODE_ENV-only bypass here).
 */
"use strict";

const { requireSuperAdmin } = require("../../auth");
const { canAccessSuperConsole } = require("../../auth/roles");
const { getAdminTenantId } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const adminTestDataService = require("../../admin/adminTestDataService");
const adminDemoLeadsCrmResetService = require("../../admin/adminDemoLeadsCrmResetService");
const { areAdminDbFixturesEnabled } = require("../../admin/dbFixturesEnv");

function blockWhenDbFixturesDisabled(req, res, next) {
  if (!areAdminDbFixturesEnabled()) {
    return res.status(403).json({
      ok: false,
      error: "forbidden",
      message: "DB test-data tools are disabled in this environment.",
    });
  }
  return next();
}

function requireSuperAdminJson(req, res, next) {
  if (!req.session || !req.session.adminUser) {
    return res.status(401).json({ ok: false, error: "unauthorized", message: "Login required." });
  }
  if (!canAccessSuperConsole(req.session.adminUser.role)) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Super admin required." });
  }
  return next();
}

module.exports = function registerAdminDbToolsRoutes(router) {
  router.get("/db", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const tenant = await tenantsRepo.getById(pool, tid);
      const slug = tenant ? String(tenant.slug || "").trim() : "";
      const name = tenant ? String(tenant.name || "").trim() : "";
      let clearPreview = { batchCount: 0, byTable: [], totalTrackedRows: 0 };
      try {
        clearPreview = await adminTestDataService.getSeedDataPreview(pool, tid);
      } catch (_) {
        /* ignore preview errors; page still loads */
      }
      return res.render("admin/db_tools", {
        activeNav: "db",
        navTitle: "DB tools",
        tenantContext: { id: tid, slug, name },
        dbToolsDisabled: !areAdminDbFixturesEnabled(),
        clearPreview,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/db/seed", blockWhenDbFixturesDisabled, requireSuperAdminJson, async (req, res) => {
    try {
      const pool = getPgPool();
      const tenantId = getAdminTenantId(req);
      const adminUserId = Number(req.session.adminUser.id);
      const result = await adminTestDataService.createTestData(pool, { tenantId, adminUserId });
      const status = result.ok ? 200 : result.error === "validation" ? 400 : 500;
      return res.status(status).json(result);
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "Error";
      return res.status(500).json({ ok: false, error: "server", message: msg });
    }
  });

  router.post("/db/clear", blockWhenDbFixturesDisabled, requireSuperAdminJson, async (req, res) => {
    try {
      const pool = getPgPool();
      const tenantId = getAdminTenantId(req);
      const body = req.body || {};
      const confirmSlug = String(body.confirmSlug || body.confirm_slug || "").trim();
      const batchUuidRaw = body.batchUuid != null ? body.batchUuid : body.batch_uuid;
      const batchUuid =
        batchUuidRaw != null && String(batchUuidRaw).trim() !== "" ? String(batchUuidRaw).trim() : undefined;
      const result = await adminTestDataService.clearTestData(pool, { tenantId, confirmSlug, batchUuid });
      const status = result.ok ? 200 : result.error === "validation" ? 400 : 500;
      return res.status(status).json(result);
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "Error";
      return res.status(500).json({ ok: false, error: "server", message: msg });
    }
  });

  router.post("/db/reset-demo-leads-crm", blockWhenDbFixturesDisabled, requireSuperAdminJson, async (req, res) => {
    try {
      const pool = getPgPool();
      const body = req.body || {};
      const confirmSlug = String(body.confirmSlug || body.confirm_slug || "").trim();
      const result = await adminDemoLeadsCrmResetService.resetDemoLeadsAndCrm(pool, { confirmSlug });
      const status = result.ok ? 200 : result.error === "validation" ? 400 : 500;
      return res.status(status).json(result);
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "Error";
      return res.status(500).json({ ok: false, error: "server", message: msg });
    }
  });
};
