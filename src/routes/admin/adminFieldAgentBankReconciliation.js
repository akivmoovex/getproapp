"use strict";

const {
  canAccessPayRunSection,
  isPayRunFinanceViewerOnly,
  canApprovePayrunForPayout,
} = require("../../auth/roles");
const { isSuperAdmin } = require("../../auth");
const { getAdminTenantId, redirectWithEmbed } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const adminUsersRepo = require("../../db/pg/adminUsersRepo");
const fieldAgentPayRunRepo = require("../../db/pg/fieldAgentPayRunRepo");
const fieldAgentPayoutBatchRepo = require("../../db/pg/fieldAgentPayoutBatchRepo");
const fieldAgentBankReconciliationRepo = require("../../db/pg/fieldAgentBankReconciliationRepo");

function requirePayRunBeyondFinanceViewer(req, res, next) {
  if (!req.session.adminUser) return res.redirect("/admin/login");
  if (!canAccessPayRunSection(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Pay runs require finance access or tenant administration.");
  }
  if (isPayRunFinanceViewerOnly(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Finance viewer access is limited to the finance dashboard and finance detail.");
  }
  next();
}

function requireBankReconciliationWrite(req, res, next) {
  if (!req.session.adminUser) return res.redirect("/admin/login");
  if (!canAccessPayRunSection(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Pay runs require finance access or tenant administration.");
  }
  if (isPayRunFinanceViewerOnly(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Finance viewer access is read-only.");
  }
  if (!canApprovePayrunForPayout(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Bank reconciliation requires tenant administration or finance operator/manager.");
  }
  next();
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

async function loadReconcilerLabels(pool, batchRows, standaloneRows) {
  const ids = new Set();
  for (const row of batchRows || []) {
    const b = row.batch;
    if (b && b.reconciled_by_admin_user_id) ids.add(Number(b.reconciled_by_admin_user_id));
  }
  for (const row of standaloneRows || []) {
    const r = row.run;
    if (r && r.reconciled_by_admin_user_id) ids.add(Number(r.reconciled_by_admin_user_id));
  }
  const labels = {};
  await Promise.all(
    [...ids].map(async (id) => {
      if (!Number.isFinite(id) || id < 1) return;
      const u = await adminUsersRepo.getById(pool, id);
      labels[id] = u ? String(u.username || u.display_name || "").trim() || `#${id}` : `#${id}`;
    })
  );
  return labels;
}

function mapBatchReconcileErr(code) {
  switch (code) {
    case "BATCH_NOT_FOUND":
      return "batch_nf";
    case "ALREADY_RECONCILED":
      return "batch_done";
    case "BATCH_CANCELLED":
      return "batch_cancel";
    default:
      return "batch_fail";
  }
}

function mapPayRunReconcileErr(code) {
  switch (code) {
    case "NOT_FOUND":
      return "pr_nf";
    case "ALREADY_RECONCILED":
      return "pr_done";
    default:
      return "pr_fail";
  }
}

module.exports = function registerAdminFieldAgentBankReconciliationRoutes(router) {
  router.get("/field-agent-bank-reconciliation", requirePayRunBeyondFinanceViewer, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const [batchRows, standaloneRows] = await Promise.all([
        fieldAgentBankReconciliationRepo.listPayoutBatchReconciliationRows(pool, tid, 80),
        fieldAgentBankReconciliationRepo.listStandalonePayRunReconciliationRows(pool, tid, 80),
      ]);
      const reconcilerLabels = await loadReconcilerLabels(pool, batchRows, standaloneRows);
      const tenants = isSuperAdmin(req.session.adminUser.role) ? await tenantsRepo.listAllOrderedByNameForSettings(pool) : [];
      return res.render("admin/field_agent_bank_reconciliation", {
        activeNav: "field_agent_bank_reconciliation",
        tenantId: tid,
        tenants,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        batchRows,
        standaloneRows,
        reconcilerLabels,
        canMutate: canApprovePayrunForPayout(req.session.adminUser.role),
        embed: !!res.locals.embed,
        flashReconciled: req.query.reconciled === "1",
        flashScope: req.query.scope || "",
        errBatch: req.query.err_b || "",
        errPayRun: req.query.err_p || "",
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    "/field-agent-bank-reconciliation/batch/:id/reconcile",
    requireBankReconciliationWrite,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const tid = resolveTargetTenantId(req);
        if (!(await assertTenantAccessible(pool, req, tid))) {
          return res.status(400).type("text").send("Invalid or inaccessible region.");
        }
        const batchId = Number(req.params.id);
        if (!Number.isFinite(batchId) || batchId < 1) return res.status(404).type("text").send("Not found.");
        const note = req.body && req.body.reconciliation_note != null ? String(req.body.reconciliation_note).trim() : "";
        const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
        const result = await fieldAgentPayoutBatchRepo.markPayoutBatchBankReconciled(pool, {
          batchId,
          tenantId: tid,
          adminUserId: adminId,
          reconciliationNote: note || null,
        });
        const q = new URLSearchParams();
        if (isSuperAdmin(req.session.adminUser.role)) q.set("tenant_id", String(tid));
        if (result.error) {
          q.set("err_b", mapBatchReconcileErr(result.error));
        } else {
          q.set("reconciled", "1");
          q.set("scope", "batch");
        }
        return res.redirect(302, redirectWithEmbed(req, `/admin/field-agent-bank-reconciliation?${q.toString()}`));
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/field-agent-bank-reconciliation/pay-run/:id/reconcile",
    requireBankReconciliationWrite,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const tid = resolveTargetTenantId(req);
        if (!(await assertTenantAccessible(pool, req, tid))) {
          return res.status(400).type("text").send("Invalid or inaccessible region.");
        }
        const payRunId = Number(req.params.id);
        if (!Number.isFinite(payRunId) || payRunId < 1) return res.status(404).type("text").send("Not found.");
        const note = req.body && req.body.reconciliation_note != null ? String(req.body.reconciliation_note).trim() : "";
        const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
        const result = await fieldAgentPayRunRepo.markPayRunBankReconciled(pool, {
          payRunId,
          tenantId: tid,
          adminUserId: adminId,
          reconciliationNote: note || null,
        });
        const q = new URLSearchParams();
        if (isSuperAdmin(req.session.adminUser.role)) q.set("tenant_id", String(tid));
        if (result.error) {
          q.set("err_p", mapPayRunReconcileErr(result.error));
        } else {
          q.set("reconciled", "1");
          q.set("scope", "pay_run");
        }
        return res.redirect(302, redirectWithEmbed(req, `/admin/field-agent-bank-reconciliation?${q.toString()}`));
      } catch (e) {
        return next(e);
      }
    }
  );
};
