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
const fieldAgentPayoutBatchRepo = require("../../db/pg/fieldAgentPayoutBatchRepo");
const fieldAgentPayoutFinanceAuditRepo = require("../../db/pg/fieldAgentPayoutFinanceAuditRepo");

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

function requirePayRunPayoutBatchWrite(req, res, next) {
  if (!req.session.adminUser) return res.redirect("/admin/login");
  if (!canAccessPayRunSection(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Pay runs require finance access or tenant administration.");
  }
  if (isPayRunFinanceViewerOnly(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Finance viewer access is read-only.");
  }
  if (!canApprovePayrunForPayout(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Payout batches require tenant administration or finance operator/manager.");
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

function mapCompleteBatchError(code) {
  switch (code) {
    case "BANK_REFERENCE_REQUIRED":
      return "bank_ref";
    case "PAYMENT_METHOD_REQUIRED":
      return "pay_method";
    case "ALREADY_COMPLETED":
      return "already_done";
    case "BATCH_NOT_FOUND":
      return "not_found";
    case "BATCH_CANCELLED":
      return "cancelled";
    case "VOID_MEMBER":
      return "void_member";
    case "MEMBER_ALREADY_COMPLETED":
      return "member_done";
    case "NOT_PAYOUT_APPROVED":
      return "not_payout_approved";
    case "PAY_RUN_NOT_FOUND":
      return "pr_not_found";
    case "PERIOD_OR_CLOSE":
    case "PAY_RUN_CLOSED":
    case "ACCOUNTING_PERIOD_LOCKED":
      return "period_or_close";
    default:
      return "complete_failed";
  }
}

function mapAddPayRunError(code) {
  switch (code) {
    case "BATCH_NOT_FOUND":
      return "batch_not_found";
    case "NOT_OPEN":
      return "batch_not_open";
    case "PAY_RUN_NOT_FOUND":
      return "pay_run_not_found";
    case "NOT_PAYOUT_APPROVED":
      return "not_payout_approved";
    case "PERIOD_OR_CLOSE":
      return "period_or_close";
    case "ALREADY_IN_OPEN_BATCH":
      return "already_in_open_batch";
    case "ALREADY_IN_THIS_BATCH":
      return "already_in_batch";
    case "PAY_RUN_ALREADY_BATCHED":
      return "pay_run_already_batched";
    default:
      return "add_failed";
  }
}

module.exports = function registerAdminFieldAgentPayoutBatchesRoutes(router) {
  router.get("/field-agent-payout-batches", requirePayRunBeyondFinanceViewer, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const batches = await fieldAgentPayoutBatchRepo.listPayoutBatchesForTenant(pool, tid, 100);
      const tenants = isSuperAdmin(req.session.adminUser.role) ? await tenantsRepo.listAllOrderedByNameForSettings(pool) : [];
      return res.render("admin/field_agent_payout_batches_list", {
        activeNav: "field_agent_payout_batches",
        batches,
        tenantId: tid,
        tenants,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        canMutate: canApprovePayrunForPayout(req.session.adminUser.role),
        embed: !!res.locals.embed,
        flashDupRef: req.query.err === "dup_ref",
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-payout-batches", requirePayRunPayoutBatchWrite, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const body = req.body || {};
      const ref = String(body.batch_reference || "").trim();
      const notes = body.notes != null ? String(body.notes).trim() : "";
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayoutBatchRepo.createPayoutBatch(pool, tid, {
        batchReference: ref,
        notes: notes || null,
        createdByAdminUserId: adminId,
      });
      if (result.error === "DUPLICATE_REFERENCE") {
        const q = new URLSearchParams();
        if (isSuperAdmin(req.session.adminUser.role)) q.set("tenant_id", String(tid));
        q.set("err", "dup_ref");
        return res.redirect(302, redirectWithEmbed(req, `/admin/field-agent-payout-batches?${q.toString()}`));
      }
      if (result.error || !result.batch) {
        return res.status(400).type("text").send("Could not create batch. Reference is required.");
      }
      const q = new URLSearchParams();
      if (isSuperAdmin(req.session.adminUser.role)) q.set("tenant_id", String(tid));
      q.set("created", "1");
      return res.redirect(
        302,
        redirectWithEmbed(req, `/admin/field-agent-payout-batches/${result.batch.id}?${q.toString()}`)
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-payout-batches/:id", requirePayRunBeyondFinanceViewer, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(404).type("text").send("Not found.");
      const batch = await fieldAgentPayoutBatchRepo.getPayoutBatchByIdForTenant(pool, id, tid);
      if (!batch) return res.status(404).type("text").send("Not found.");
      const members = await fieldAgentPayoutBatchRepo.listPayRunsInPayoutBatch(pool, id, tid);
      const payoutFinanceAudit = await fieldAgentPayoutFinanceAuditRepo.listPayoutFinanceAuditForPayoutBatch(pool, tid, id, 80);
      const eligible = await fieldAgentPayoutBatchRepo.listPayRunsEligibleForPayoutBatch(pool, tid, 150);
      const tenants = isSuperAdmin(req.session.adminUser.role) ? await tenantsRepo.listAllOrderedByNameForSettings(pool) : [];
      let createdByLabel = "";
      if (batch.created_by_admin_user_id) {
        const u = await adminUsersRepo.getById(pool, Number(batch.created_by_admin_user_id));
        createdByLabel = u ? String(u.username || u.display_name || "").trim() || `#${batch.created_by_admin_user_id}` : "";
      }
      const addedIds = new Set(
        members.map((m) => (m.added_by_admin_user_id != null ? Number(m.added_by_admin_user_id) : null)).filter((x) => x != null)
      );
      const auditActorIds = (payoutFinanceAudit || [])
        .map((a) => (a.actor_admin_user_id != null ? Number(a.actor_admin_user_id) : null))
        .filter((x) => x != null && Number.isFinite(x) && x > 0);
      const labelIds = [
        ...new Set([
          ...(batch.created_by_admin_user_id ? [Number(batch.created_by_admin_user_id)] : []),
          ...(batch.completed_by_admin_user_id ? [Number(batch.completed_by_admin_user_id)] : []),
          ...(batch.reconciled_by_admin_user_id ? [Number(batch.reconciled_by_admin_user_id)] : []),
          ...addedIds,
          ...auditActorIds,
        ]),
      ];
      const labels = {};
      await Promise.all(
        labelIds.map(async (lid) => {
          const u = await adminUsersRepo.getById(pool, lid);
          labels[lid] = u ? String(u.username || u.display_name || "").trim() || `#${lid}` : `#${lid}`;
        })
      );
      return res.render("admin/field_agent_payout_batch_detail", {
        activeNav: "field_agent_payout_batches",
        batch,
        members,
        eligible,
        tenantId: tid,
        tenants,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        canMutate: canApprovePayrunForPayout(req.session.adminUser.role),
        embed: !!res.locals.embed,
        createdByLabel,
        actorLabels: labels,
        flashBatchCreated: req.query.created === "1",
        flashAdded: req.query.added === "1",
        flashClosed: req.query.closed === "1",
        closeErr: req.query.close_err || "",
        addErr: req.query.add_err || "",
        flashPayoutCompleted: req.query.payout_completed === "1",
        completeErr: req.query.complete_err || "",
        payoutFinanceAudit,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-payout-batches/:id/pay-runs", requirePayRunPayoutBatchWrite, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const batchId = Number(req.params.id);
      if (!Number.isFinite(batchId) || batchId < 1) return res.status(404).type("text").send("Not found.");
      const payRunId = Number((req.body && req.body.pay_run_id) || "");
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayoutBatchRepo.addPayRunToPayoutBatch(pool, {
        batchId,
        payRunId,
        tenantId: tid,
        adminUserId: adminId,
      });
      const q = new URLSearchParams();
      if (isSuperAdmin(req.session.adminUser.role)) q.set("tenant_id", String(tid));
      if (result.ok) {
        q.set("added", "1");
      } else {
        q.set("add_err", mapAddPayRunError(result.error));
      }
      return res.redirect(302, redirectWithEmbed(req, `/admin/field-agent-payout-batches/${batchId}?${q.toString()}`));
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-payout-batches/:id/complete-payout", requirePayRunPayoutBatchWrite, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const batchId = Number(req.params.id);
      if (!Number.isFinite(batchId) || batchId < 1) return res.status(404).type("text").send("Not found.");
      const body = req.body || {};
      const bankReference = String(body.bank_reference || "").trim();
      const paymentMethod = String(body.payment_method || "").trim();
      const completionNote = body.completion_note != null ? String(body.completion_note).trim() : "";
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayoutBatchRepo.completePayoutBatchWithEvidence(pool, {
        batchId,
        tenantId: tid,
        adminUserId: adminId,
        bankReference,
        paymentMethod,
        completionNote: completionNote || null,
      });
      const q = new URLSearchParams();
      if (isSuperAdmin(req.session.adminUser.role)) q.set("tenant_id", String(tid));
      if (result.error) {
        q.set("complete_err", mapCompleteBatchError(result.error));
      } else {
        q.set("payout_completed", "1");
      }
      return res.redirect(302, redirectWithEmbed(req, `/admin/field-agent-payout-batches/${batchId}?${q.toString()}`));
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-payout-batches/:id/close", requirePayRunPayoutBatchWrite, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const batchId = Number(req.params.id);
      if (!Number.isFinite(batchId) || batchId < 1) return res.status(404).type("text").send("Not found.");
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayoutBatchRepo.closePayoutBatch(pool, batchId, tid, adminId);
      const q = new URLSearchParams();
      if (isSuperAdmin(req.session.adminUser.role)) q.set("tenant_id", String(tid));
      if (result.error) {
        q.set("close_err", result.error);
      } else {
        q.set("closed", "1");
      }
      return res.redirect(302, redirectWithEmbed(req, `/admin/field-agent-payout-batches/${batchId}?${q.toString()}`));
    } catch (e) {
      return next(e);
    }
  });
};
