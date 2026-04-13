"use strict";

const { canManageTenantUsers } = require("../../auth/roles");
const { isSuperAdmin } = require("../../auth");
const { getAdminTenantId } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const fieldAgentPayRunAdjustmentsRepo = require("../../db/pg/fieldAgentPayRunAdjustmentsRepo");

function requirePayRunAdmin(req, res, next) {
  if (!req.session.adminUser) return res.redirect("/admin/login");
  if (!canManageTenantUsers(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Pay-run adjustments require tenant manager or super admin.");
  }
  return next();
}

function resolveTargetTenantId(req) {
  const u = req.session.adminUser;
  if (isSuperAdmin(u.role)) {
    const raw = (req.query && req.query.tenant_id) || (req.body && req.body.tenant_id);
    const tid = raw != null && String(raw).trim() !== "" ? Number(raw) : null;
    if (tid != null && Number.isFinite(tid) && tid > 0) return tid;
    return getAdminTenantId(req);
  }
  return getAdminTenantId(req);
}

async function assertTenantAccessible(pool, req, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return false;
  const ok = await tenantsRepo.tenantExistsById(pool, tid);
  if (!ok) return false;
  const u = req.session.adminUser;
  if (isSuperAdmin(u.role)) return true;
  return Number(getAdminTenantId(req)) === tid;
}

function mapCreateErrorToMessage(code) {
  switch (code) {
    case "INVALID":
    case "INVALID_ADMIN":
      return "Invalid request.";
    case "REASON_REQUIRED":
      return "Reason is required.";
    case "AMOUNT_NONZERO":
      return "Adjustment amount must be non-zero.";
    case "INVALID_TYPE":
      return "Invalid adjustment type.";
    case "ITEM_NOT_FOUND":
      return "Pay run line not found for this region.";
    case "PAY_RUN_NOT_APPROVED":
      return "Adjustments are only allowed after the pay run is approved or paid.";
    case "DISPUTE_MISMATCH":
      return "Dispute does not match this line or region.";
    default:
      return "Could not create adjustment.";
  }
}

module.exports = function registerAdminFieldAgentAdjustmentsRoutes(router) {
  router.get("/field-agent-adjustments", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const q = req.query || {};
      const rows = await fieldAgentPayRunAdjustmentsRepo.listAdjustmentsForAdmin(pool, tid, {
        fieldAgentId: q.field_agent_id,
        originalPayRunId: q.original_pay_run_id,
        disputeId: q.dispute_id,
        limit: 250,
      });
      const tenants = isSuperAdmin(req.session.adminUser.role)
        ? await tenantsRepo.listAllOrderedByNameForSettings(pool)
        : [];
      return res.render("admin/field_agent_adjustments_list", {
        activeNav: "field_agent_adjustments",
        adjustments: rows,
        tenantId: tid,
        tenants,
        filterFieldAgentId: String(q.field_agent_id || "").trim(),
        filterOriginalPayRunId: String(q.original_pay_run_id || "").trim(),
        filterDisputeId: String(q.dispute_id || "").trim(),
        isSuper: isSuperAdmin(req.session.adminUser.role),
        embed: !!res.locals.embed,
        flashCreated: req.query.created === "1",
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-adjustments", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const body = req.body || {};
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const itemId = Number(body.original_pay_run_item_id);
      const amountRaw = body.adjustment_amount;
      const amount =
        typeof amountRaw === "string" && amountRaw.trim() !== "" ? Number(String(amountRaw).replace(/,/g, "")) : Number(amountRaw);
      const reason = String(body.reason || "").trim();
      const adminNotes = body.admin_notes != null && String(body.admin_notes).trim() !== "" ? String(body.admin_notes).trim() : null;
      const adjustmentType = String(body.adjustment_type || "manual").trim();
      let disputeId = body.dispute_id != null && String(body.dispute_id).trim() !== "" ? Number(body.dispute_id) : null;
      if (disputeId != null && (!Number.isFinite(disputeId) || disputeId < 1)) disputeId = null;

      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;

      const created = await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
        tenantId: tid,
        originalPayRunItemId: itemId,
        adjustmentAmount: amount,
        adjustmentType,
        reason,
        adminNotes,
        createdByAdminUserId: adminId,
        disputeId,
      });

      if (created.error) {
        return res.status(400).type("text").send(mapCreateErrorToMessage(created.error));
      }

      const redirectRunId = body.redirect_pay_run_id != null && String(body.redirect_pay_run_id).trim() !== ""
        ? Number(body.redirect_pay_run_id)
        : null;
      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      q.set("adjustment", "1");
      if (redirectRunId != null && Number.isFinite(redirectRunId) && redirectRunId > 0) {
        return res.redirect(302, `/admin/field-agent-pay-runs/${redirectRunId}?${q.toString()}`);
      }
      q.set("created", "1");
      const listQs = new URLSearchParams();
      if (isSuperAdmin(req.session.adminUser.role)) listQs.set("tenant_id", String(tid));
      if (res.locals.embed) listQs.set("embed", "1");
      listQs.set("created", "1");
      return res.redirect(302, `/admin/field-agent-adjustments?${listQs.toString()}`);
    } catch (e) {
      return next(e);
    }
  });
};
