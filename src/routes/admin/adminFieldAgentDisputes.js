"use strict";

const { canManageTenantUsers } = require("../../auth/roles");
const { isSuperAdmin } = require("../../auth");
const { getAdminTenantId } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const fieldAgentPayRunRepo = require("../../db/pg/fieldAgentPayRunRepo");
const fieldAgentPayRunDisputesRepo = require("../../db/pg/fieldAgentPayRunDisputesRepo");
const fieldAgentPayRunAdjustmentsRepo = require("../../db/pg/fieldAgentPayRunAdjustmentsRepo");
const tenantCommerceSettingsRepo = require("../../db/pg/tenantCommerceSettingsRepo");
const { buildStatementDetailFromSnapshotRow } = require("../../fieldAgent/fieldAgentStatementPayload");

function requirePayRunAdmin(req, res, next) {
  if (!req.session.adminUser) return res.redirect("/admin/login");
  if (!canManageTenantUsers(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Statement disputes require tenant manager or super admin.");
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

module.exports = function registerAdminFieldAgentDisputesRoutes(router) {
  router.get("/field-agent-disputes", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const status = String((req.query && req.query.status) || "").trim();
      const rows = await fieldAgentPayRunDisputesRepo.listDisputesForAdmin(pool, tid, {
        status: status || null,
        limit: 200,
      });
      const tenants = isSuperAdmin(req.session.adminUser.role)
        ? await tenantsRepo.listAllOrderedByNameForSettings(pool)
        : [];
      return res.render("admin/field_agent_disputes_list", {
        activeNav: "field_agent_disputes",
        disputes: rows,
        tenantId: tid,
        tenants,
        filterStatus: status,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-disputes/:id", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const disputeId = Number(req.params.id);
      if (!Number.isFinite(disputeId) || disputeId < 1) return res.status(404).type("text").send("Not found.");
      const dispute = await fieldAgentPayRunDisputesRepo.getDisputeById(pool, disputeId);
      if (!dispute) return res.status(404).type("text").send("Not found.");
      const tid = Number(dispute.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this dispute.");
      }
      const commerce = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
      const snap = await fieldAgentPayRunRepo.getPayRunStatementSnapshotForFieldAgent(
        pool,
        tid,
        dispute.pay_run_id,
        dispute.field_agent_id,
        { forAdmin: true }
      );
      const detail = snap ? buildStatementDetailFromSnapshotRow(snap, commerce) : null;
      const tenantRow = await tenantsRepo.getById(pool, tid);
      const tenantRegionLabel = tenantRow
        ? `${String(tenantRow.name || "").trim() || tenantRow.slug} (${tenantRow.slug})`
        : "";
      return res.render("admin/field_agent_dispute_detail", {
        activeNav: "field_agent_disputes",
        dispute,
        detail,
        tenantRegionLabel,
        tenantId: tid,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        embed: !!res.locals.embed,
        flashResolvedWithAdjustment: String(req.query.resolved || "") === "adjustment",
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-disputes/:id/status", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const disputeId = Number(req.params.id);
      if (!Number.isFinite(disputeId) || disputeId < 1) return res.status(400).type("text").send("Invalid id.");
      const dispute = await fieldAgentPayRunDisputesRepo.getDisputeById(pool, disputeId);
      if (!dispute) return res.status(404).type("text").send("Not found.");
      const tid = Number(dispute.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this dispute.");
      }
      const body = req.body || {};
      const newStatus = String(body.status || "").trim();
      const adminNotes = body.admin_notes;
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayRunDisputesRepo.updateDisputeStatus(pool, disputeId, tid, newStatus, adminId, adminNotes);
      if (result.error === "INVALID_TRANSITION") {
        return res.status(400).type("text").send("Invalid status transition.");
      }
      if (result.error === "FINAL") {
        return res.status(409).type("text").send("This dispute is already closed.");
      }
      if (result.error === "NOT_FOUND" || !result.dispute) {
        return res.status(409).type("text").send("Could not update dispute status.");
      }
      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      return res.redirect(302, `/admin/field-agent-disputes/${disputeId}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-disputes/:id/resolve-with-adjustment", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const disputeId = Number(req.params.id);
      if (!Number.isFinite(disputeId) || disputeId < 1) return res.status(400).type("text").send("Invalid id.");
      const dispute = await fieldAgentPayRunDisputesRepo.getDisputeById(pool, disputeId);
      if (!dispute) return res.status(404).type("text").send("Not found.");
      const tid = Number(dispute.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this dispute.");
      }
      if (String(dispute.status) !== "under_review") {
        return res.status(409).type("text").send("Dispute must be under review before resolving with an adjustment.");
      }
      const body = req.body || {};
      const amountRaw = body.adjustment_amount;
      const amount =
        typeof amountRaw === "string" && amountRaw.trim() !== "" ? Number(String(amountRaw).replace(/,/g, "")) : Number(amountRaw);
      const reason = String(body.reason || "").trim();
      const adminNotes = body.admin_notes != null && String(body.admin_notes).trim() !== "" ? String(body.admin_notes).trim() : null;
      const adjustmentType = String(body.adjustment_type || "manual").trim();
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;

      const result = await fieldAgentPayRunAdjustmentsRepo.createAdjustmentAndResolveDispute(pool, {
        tenantId: tid,
        originalPayRunItemId: Number(dispute.pay_run_item_id),
        adjustmentAmount: amount,
        adjustmentType,
        reason,
        adminNotes,
        createdByAdminUserId: adminId,
        disputeId,
      });

      if (result.error === "AMOUNT_NONZERO" || result.error === "REASON_REQUIRED") {
        return res.status(400).type("text").send(result.error === "AMOUNT_NONZERO" ? "Adjustment amount must be non-zero." : "Reason is required.");
      }
      if (result.error === "PAY_RUN_NOT_APPROVED" || result.error === "ITEM_NOT_FOUND") {
        return res.status(400).type("text").send("Invalid pay run line for adjustment.");
      }
      if (result.error === "INVALID_TYPE") {
        return res.status(400).type("text").send("Invalid adjustment type.");
      }
      if (result.error === "DISPUTE_MISMATCH") {
        return res.status(400).type("text").send("Dispute does not match this line.");
      }
      if (result.error === "DISPUTE_NOT_RESOLVABLE" || result.error === "CREATE_FAILED" || !result.adjustment || !result.dispute) {
        return res.status(409).type("text").send("Could not resolve dispute with adjustment.");
      }
      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      q.set("resolved", "adjustment");
      return res.redirect(302, `/admin/field-agent-disputes/${disputeId}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });
};
