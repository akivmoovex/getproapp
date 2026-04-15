"use strict";

const { canManageTenantUsers } = require("../../auth/roles");
const { isSuperAdmin } = require("../../auth");
const { getAdminTenantId, redirectWithEmbed } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const fieldAgentPayRunRepo = require("../../db/pg/fieldAgentPayRunRepo");
const financeCfoDashboardRepo = require("../../db/pg/financeCfoDashboardRepo");
const fieldAgentPayRunAdjustmentsRepo = require("../../db/pg/fieldAgentPayRunAdjustmentsRepo");
const tenantCommerceSettingsRepo = require("../../db/pg/tenantCommerceSettingsRepo");
const adminUsersRepo = require("../../db/pg/adminUsersRepo");
const { computePayRunPreview } = require("../../admin/fieldAgentPayRunCompute");
const { buildPayRunItemsCsv, buildPayRunAccountingReconciliationCsv } = require("../../admin/fieldAgentPayRunExportCsv");
const { buildCfoPayRunSummaryCsv, buildCfoPayRunLedgerCsv } = require("../../admin/financeCfoExportCsv");
const { buildStatementDetailFromSnapshotRow } = require("../../fieldAgent/fieldAgentStatementPayload");

function requirePayRunAdmin(req, res, next) {
  if (!req.session.adminUser) return res.redirect("/admin/login");
  if (!canManageTenantUsers(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Draft pay-run snapshots require tenant manager or super admin.");
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

async function loadActorLabels(pool, run, paymentRows) {
  if (!run) return {};
  const ids = [
    run.created_by_admin_user_id,
    run.locked_by_admin_user_id,
    run.approved_by_admin_user_id,
    run.paid_by_admin_user_id,
  ]
    .map((x) => (x != null ? Number(x) : null))
    .filter((x) => x != null && Number.isFinite(x) && x > 0);
  if (Array.isArray(paymentRows)) {
    paymentRows.forEach((row) => {
      const id = row && row.created_by_admin_user_id != null ? Number(row.created_by_admin_user_id) : null;
      if (id != null && Number.isFinite(id) && id > 0) ids.push(id);
    });
  }
  const uniq = [...new Set(ids)];
  const labels = {};
  await Promise.all(
    uniq.map(async (id) => {
      const u = await adminUsersRepo.getById(pool, id);
      labels[id] = u ? String(u.username || u.display_name || "").trim() || `#${id}` : `#${id}`;
    })
  );
  return labels;
}

function isAccountingReportAllowed(run) {
  const st = run && run.status != null ? String(run.status) : "";
  return st === "approved" || st === "paid";
}

function buildPaymentLedgerUiRows(payments) {
  const { parsePaymentMetadata, LEDGER_ENTRY_TYPE } = fieldAgentPayRunRepo;
  const reversedOriginalIds = new Set();
  for (const row of payments || []) {
    const m = parsePaymentMetadata(row);
    if (m.reverses_payment_id != null && Number.isFinite(Number(m.reverses_payment_id))) {
      reversedOriginalIds.add(Number(m.reverses_payment_id));
    }
  }
  return (payments || []).map((p) => {
    const m = parsePaymentMetadata(p);
    const amt = Number(p.amount);
    const id = Number(p.id);
    const isReversalLine = String(m.type || "") === LEDGER_ENTRY_TYPE.REVERSAL || amt < 0;
    const canReverseOrCorrect =
      amt > 0 && String(m.type || "") !== LEDGER_ENTRY_TYPE.REVERSAL && !reversedOriginalIds.has(id);
    return { ...p, _ledgerMeta: m, _isReversalLine: isReversalLine, _canReverseOrCorrect: canReverseOrCorrect };
  });
}

async function loadAdminUserLabelsByIds(pool, ids) {
  const uniq = [...new Set((ids || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  const out = {};
  await Promise.all(
    uniq.map(async (id) => {
      const u = await adminUsersRepo.getById(pool, id);
      out[id] = u ? String(u.username || u.display_name || "").trim() || `#${id}` : `#${id}`;
    })
  );
  return out;
}

module.exports = function registerAdminFieldAgentPayRunsRoutes(router) {
  router.get("/field-agent-pay-runs", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const runs = await fieldAgentPayRunRepo.listPayRunsForTenant(pool, tid, 50);
      const tenants = isSuperAdmin(req.session.adminUser.role)
        ? await tenantsRepo.listAllOrderedByNameForSettings(pool)
        : [];
      return res.render("admin/field_agent_pay_runs_list", {
        activeNav: "field_agent_pay_runs",
        runs,
        tenantId: tid,
        tenants,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/new", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const tenants = isSuperAdmin(req.session.adminUser.role)
        ? await tenantsRepo.listAllOrderedByNameForSettings(pool)
        : [];
      return res.render("admin/field_agent_pay_runs_new", {
        activeNav: "field_agent_pay_runs",
        tenantId: tid,
        tenants,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        embed: !!res.locals.embed,
        periodStart: "",
        periodEnd: "",
        preview: null,
        previewError: null,
        formTenantId: tid,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/finance-dashboard", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const tenants = isSuperAdmin(req.session.adminUser.role)
        ? await tenantsRepo.listAllOrderedByNameForSettings(pool)
        : [];
      const tenantRow = await tenantsRepo.getById(pool, tid);
      if (!tenantRow) return res.status(404).type("text").send("Tenant not found.");

      const financeExceptionPreset = financeCfoDashboardRepo.normalizeFinanceExceptionPreset(req.query.exception);
      const financeExceptionMeta = financeCfoDashboardRepo.getFinanceExceptionPresetMeta(financeExceptionPreset);

      const [summary, recentRuns, reopenHistory, tenantLedgerAdj, tenantReopen] = await Promise.all([
        financeCfoDashboardRepo.getFieldAgentPayoutDashboardSummary(pool, tid),
        financeCfoDashboardRepo.listPayRunsForPayoutDashboard(pool, tid, {
          limit: 25,
          exceptionPreset: financeExceptionPreset,
        }),
        financeCfoDashboardRepo.listRecentPayRunReopenHistory(pool, tid, { limit: 15 }),
        financeCfoDashboardRepo.getTenantLedgerHasReversalOrCorrection(pool, tid),
        financeCfoDashboardRepo.getTenantHasPaidToApprovedHistory(pool, tid),
      ]);

      const s =
        summary || {
          statusCounts: { draft: 0, locked: 0, approved: 0, paid: 0, void: 0 },
          frozenPayableApprovedPaid: 0,
          totalNetPaidLedger: 0,
          outstandingAmount: 0,
          ledgerPaidOnApprovedPaidRuns: 0,
        };
      const stripCore = financeCfoDashboardRepo.buildReconciliationStripCore(
        s.frozenPayableApprovedPaid,
        s.totalNetPaidLedger,
        s.outstandingAmount
      );
      const reconciliationStrip = {
        ...stripCore,
        adjustmentState: tenantLedgerAdj ? "Adjusted" : "Unadjusted",
        reopenState: tenantReopen ? "Reopened after payment" : null,
      };

      return res.render("admin/field_agent_pay_run_finance_dashboard", {
        activeNav: "field_agent_payout_finance",
        tenantId: tid,
        tenant: tenantsRepo.serializeTenantRow(tenantRow),
        tenants,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        summary: s,
        reconciliationStrip,
        reconciliationStripTitle: "Region reconciliation",
        recentRuns,
        reopenHistory,
        financeExceptionPreset,
        financeExceptionMeta,
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/finance-dashboard/export.csv", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = resolveTargetTenantId(req);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }
      const rows = await financeCfoDashboardRepo.listPayRunsForCfoSummaryExport(pool, tid);
      const csv = buildCfoPayRunSummaryCsv(rows);
      const filename = `cfo-pay-runs-tenant-${tid}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(Buffer.from(csv, "utf8"));
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-pay-runs/preview", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const body = req.body || {};
      const periodStart = String(body.period_start || "").trim();
      const periodEnd = String(body.period_end || "").trim();
      const formTenantId = body.tenant_id != null && String(body.tenant_id).trim() !== "" ? Number(body.tenant_id) : null;
      const tid =
        isSuperAdmin(req.session.adminUser.role) && formTenantId != null && Number.isFinite(formTenantId) && formTenantId > 0
          ? formTenantId
          : resolveTargetTenantId(req);

      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }

      const tenants = isSuperAdmin(req.session.adminUser.role)
        ? await tenantsRepo.listAllOrderedByNameForSettings(pool)
        : [];

      let preview = null;
      let previewError = null;
      try {
        preview = await computePayRunPreview(pool, tid, periodStart, periodEnd);
      } catch (e) {
        if (e && e.code === "INVALID_PERIOD") {
          previewError = "Enter a valid period: start and end dates (YYYY-MM-DD), end on or after start.";
        } else {
          return next(e);
        }
      }

      return res.render("admin/field_agent_pay_runs_new", {
        activeNav: "field_agent_pay_runs",
        tenantId: tid,
        tenants,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        embed: !!res.locals.embed,
        periodStart,
        periodEnd,
        preview,
        previewError,
        formTenantId: tid,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-pay-runs", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const body = req.body || {};
      const periodStart = String(body.period_start || "").trim();
      const periodEnd = String(body.period_end || "").trim();
      const formTenantId = body.tenant_id != null && String(body.tenant_id).trim() !== "" ? Number(body.tenant_id) : null;
      const tid =
        isSuperAdmin(req.session.adminUser.role) && formTenantId != null && Number.isFinite(formTenantId) && formTenantId > 0
          ? formTenantId
          : resolveTargetTenantId(req);

      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(400).type("text").send("Invalid or inaccessible region.");
      }

      let preview;
      try {
        preview = await computePayRunPreview(pool, tid, periodStart, periodEnd);
      } catch (e) {
        if (e && e.code === "INVALID_PERIOD") {
          const q = new URLSearchParams();
          if (res.locals.embed) q.set("embed", "1");
          return res.redirect(302, `/admin/field-agent-pay-runs/new?${q.toString()}`);
        }
        return next(e);
      }

      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const notes = String(body.notes || "").slice(0, 2000);

      const previewRows = preview.rows.map((r) => ({
        fieldAgentId: r.fieldAgentId,
        fieldAgentLabel: r.fieldAgentLabel,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        spRatingValue: r.spRatingValue != null ? Number(r.spRatingValue) : null,
        spRatingLowThresholdUsed: r.spRatingLowThresholdUsed,
        spRatingHighThresholdUsed: r.spRatingHighThresholdUsed,
        spHighRatingBonusPercentUsed: settingsBonusForRow(preview.settingsUsed.bonusPercent),
        earnedSpCommission: r.earnedSpCommission,
        spBonusAmount: r.spBonusAmount,
        spWithheldAmount: r.spWithheldAmount,
        spPayableAmount: r.spPayableAmount,
        earnedEcCommission: r.earnedEcCommission,
        ecWithheldAmount: r.ecWithheldAmount,
        ecPayableAmount: r.ecPayableAmount,
        recruitmentCommissionAmount: r.recruitmentCommissionAmount,
        qualityStatusLabelSp: r.qualityStatusLabelSp,
        qualityStatusLabelEc: r.qualityStatusLabelEc,
      }));

      let payRunId;
      try {
        payRunId = await fieldAgentPayRunRepo.createDraftPayRunWithCarryForward(pool, {
          tenantId: tid,
          periodStart: preview.periodStart,
          periodEnd: preview.periodEnd,
          adminUserId: Number.isFinite(adminId) && adminId > 0 ? adminId : null,
          notes,
          previewRows,
        });
      } catch (e) {
        if (e && e.code === "23505") {
          return res.status(409).type("text").send(
            "A pay run already exists for this region and period. Draft snapshots are unique per tenant and period. Delete or void (future) the existing run before creating another."
          );
        }
        if (e && (e.code === "ADJUSTMENT_LINK_MISMATCH" || String(e.message || "").includes("ADJUSTMENT_LINK_MISMATCH"))) {
          return res.status(409).type("text").send("Could not attach adjustments (concurrent change). Retry.");
        }
        return next(e);
      }

      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      return res.redirect(302, `/admin/field-agent-pay-runs/${payRunId}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/:id/export", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).type("text").send("Invalid id.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const st = String(runProbe.status || "");
      if (st !== "approved" && st !== "paid") {
        return res.status(409).type("text").send("Export is only available after the pay run is approved.");
      }
      const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, id, tid);
      const commerce = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
      const currency = commerce && commerce.currency ? String(commerce.currency).trim() : "ZMW";
      const csv = buildPayRunItemsCsv(items, currency);
      await fieldAgentPayRunRepo.recordPayRunExportGenerated(pool, id, tid);
      const filename = `field-agent-pay-run-${id}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(Buffer.from(csv, "utf8"));
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-pay-runs/:id/mark-paid", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).type("text").send("Invalid id.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const body = req.body || {};
      const payoutReference = body.payout_reference;
      const payoutNotes = body.payout_notes;
      const result = await fieldAgentPayRunRepo.markPayRunApprovedAsPaidViaLedger(pool, id, tid, adminId, {
        payoutReference,
        payoutNotes,
      });
      if (result.error === "INVALID_STATE" || !result.run) {
        return res.status(409).type("text").send("Invalid state transition: only approved runs can be marked as paid.");
      }
      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      q.set("paid", "1");
      return res.redirect(302, `/admin/field-agent-pay-runs/${id}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/:id/accounting-export.csv", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).type("text").send("Invalid id.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      if (!isAccountingReportAllowed(runProbe)) {
        return res.status(409).type("text").send("Accounting export is available for approved or paid pay runs only.");
      }
      const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, id, tid);
      const reconciliation = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, id, tid);
      if (!reconciliation) return res.status(404).type("text").send("Not found.");
      const csv = buildPayRunAccountingReconciliationCsv(runProbe, reconciliation, items);
      const filename = `field-agent-pay-run-${id}-accounting-reconciliation.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(Buffer.from(csv, "utf8"));
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/:id/month-close", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(404).type("text").send("Not found.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      if (!isAccountingReportAllowed(runProbe)) {
        return res.status(409).type("text").send("Month-close report is available for approved or paid pay runs only.");
      }
      const run = await fieldAgentPayRunRepo.getPayRunByIdForTenant(pool, id, tid);
      if (!run) return res.status(404).type("text").send("Not found.");
      let items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, id, tid);
      const reconciliation = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, id, tid);
      const payments = await fieldAgentPayRunRepo.listPaymentsForPayRun(pool, id, tid, 500, { order: "asc" });
      const actorLabels = await loadActorLabels(pool, run, payments);
      const tenantRow = await tenantsRepo.getById(pool, tid);
      const tenantLabel = tenantRow
        ? `${String(tenantRow.name || "").trim() || tenantRow.slug} (${tenantRow.slug})`
        : `Tenant #${tid}`;

      const agentQ = req.query && req.query.agent_q != null ? String(req.query.agent_q).trim() : "";
      if (agentQ) {
        const qlow = agentQ.toLowerCase();
        items = items.filter((it) => String(it.field_agent_label_snapshot || "").toLowerCase().includes(qlow));
      }

      let overpaidAmount = 0;
      let signedOutstanding = 0;
      if (reconciliation) {
        signedOutstanding = fieldAgentPayRunRepo.roundMoney2(Number(reconciliation.outstanding_amount || 0));
        if (signedOutstanding < 0) overpaidAmount = fieldAgentPayRunRepo.roundMoney2(-signedOutstanding);
      }

      return res.render("admin/field_agent_pay_run_month_close", {
        activeNav: "field_agent_pay_runs",
        run,
        items,
        reconciliation,
        payments,
        actorLabels,
        tenantId: tid,
        tenantLabel,
        agentQ,
        overpaidAmount,
        signedOutstanding,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/:id/reconciliation", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(404).type("text").send("Not found.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const reconciliation = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, id, tid);
      const payments = await fieldAgentPayRunRepo.listPaymentsForPayRun(pool, id, tid, 300);
      return res.json({ ok: true, reconciliation, payments });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-pay-runs/:id/payments/:paymentId/reverse", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      const paymentId = Number(req.params.paymentId);
      if (!Number.isFinite(id) || id < 1 || !Number.isFinite(paymentId) || paymentId < 1) {
        return res.status(400).type("text").send("Invalid id.");
      }
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const body = req.body || {};
      const reason = body.reason != null ? String(body.reason) : "";
      const paymentDate = body.payment_date != null ? String(body.payment_date).trim() : "";
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
        payRunId: id,
        tenantId: tid,
        paymentId,
        reason,
        paymentDate,
        createdByAdminUserId: adminId,
      });
      if (!result.ok) {
        const code =
          result.error === "NOT_FOUND"
            ? 404
            : result.error === "ALREADY_REVERSED" || result.error === "ALREADY_CORRECTED" || result.error === "INVALID_STATE"
              ? 409
              : 400;
        return res.status(code).type("text").send(result.message || result.error || "Could not reverse payment.");
      }
      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      q.set("reversal", "1");
      return res.redirect(302, `/admin/field-agent-pay-runs/${id}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-pay-runs/:id/payments/:paymentId/correct", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      const paymentId = Number(req.params.paymentId);
      if (!Number.isFinite(id) || id < 1 || !Number.isFinite(paymentId) || paymentId < 1) {
        return res.status(400).type("text").send("Invalid id.");
      }
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const body = req.body || {};
      const reason = body.reason != null ? String(body.reason) : "";
      const newAmount = Number(body.amount);
      const paymentDate = body.payment_date != null ? String(body.payment_date).trim() : "";
      const paymentMethod = body.payment_method != null ? String(body.payment_method) : "";
      const paymentReference = body.payment_reference != null ? String(body.payment_reference) : "";
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayRunRepo.correctPaymentForPayRun(pool, {
        payRunId: id,
        tenantId: tid,
        paymentId,
        reason,
        newAmount,
        paymentDate,
        paymentMethod,
        paymentReference,
        createdByAdminUserId: adminId,
      });
      if (!result.ok) {
        const code =
          result.error === "NOT_FOUND"
            ? 404
            : result.error === "ALREADY_REVERSED" || result.error === "ALREADY_CORRECTED" || result.error === "INVALID_STATE"
              ? 409
              : 400;
        return res.status(code).type("text").send(result.message || result.error || "Could not correct payment.");
      }
      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      q.set("correction", "1");
      return res.redirect(302, `/admin/field-agent-pay-runs/${id}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-pay-runs/:id/payments", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).type("text").send("Invalid id.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const body = req.body || {};
      const amount = Number(body.amount);
      const paymentDate = String(body.payment_date || "").trim();
      const paymentMethod = body.payment_method != null ? String(body.payment_method) : "";
      const paymentReference = body.payment_reference != null ? String(body.payment_reference) : "";
      const notes = body.notes != null ? String(body.notes) : "";
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
        payRunId: id,
        tenantId: tid,
        paymentDate,
        amount,
        paymentMethod,
        paymentReference,
        notes,
        createdByAdminUserId: adminId,
      });
      if (!result.ok) {
        const msg = result.error || "Could not record payment.";
        const code = /approved or paid/i.test(msg) ? 409 : 400;
        return res.status(code).type("text").send(msg);
      }
      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      q.set("payment_recorded", "1");
      return res.redirect(302, `/admin/field-agent-pay-runs/${id}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/:id/statements/:fieldAgentId", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const payRunId = Number(req.params.id);
      const fieldAgentId = Number(req.params.fieldAgentId);
      if (!Number.isFinite(payRunId) || payRunId < 1 || !Number.isFinite(fieldAgentId) || fieldAgentId < 1) {
        return res.status(404).type("text").send("Not found.");
      }
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, payRunId);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const row = await fieldAgentPayRunRepo.getPayRunStatementSnapshotForFieldAgent(pool, tid, payRunId, fieldAgentId, {
        forAdmin: true,
      });
      if (!row) return res.status(404).type("text").send("Not found.");
      const commerce = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
      const detail = buildStatementDetailFromSnapshotRow(row, commerce);
      const tenantRow = await tenantsRepo.getById(pool, tid);
      const tenantRegionLabel = tenantRow
        ? `${String(tenantRow.name || "").trim() || tenantRow.slug} (${tenantRow.slug})`
        : "";
      return res.render("field_agent/statement_print", {
        detail,
        brandProductName: res.locals.brandProductName || "Pro-online",
        tenantRegionLabel,
        showTenantLine: true,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/:id/finance-detail", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(404).type("text").send("Not found.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const run = await fieldAgentPayRunRepo.getPayRunByIdForTenant(pool, id, tid);
      if (!run) return res.status(404).type("text").send("Not found.");
      const tenantRow = await tenantsRepo.getById(pool, tid);
      const reconciliation = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, id, tid);
      const payments = await fieldAgentPayRunRepo.listPaymentsForPayRun(pool, id, tid, 500, { order: "asc" });
      let runningNet = 0;
      const ledgerRows = payments.map((p) => {
        const amt = fieldAgentPayRunRepo.roundMoney2(Number(p.amount || 0));
        runningNet = fieldAgentPayRunRepo.roundMoney2(runningNet + amt);
        const m = fieldAgentPayRunRepo.parsePaymentMetadata(p);
        let relatedOriginalPaymentId = null;
        if (m.reverses_payment_id != null && Number.isFinite(Number(m.reverses_payment_id))) {
          relatedOriginalPaymentId = Number(m.reverses_payment_id);
        } else if (m.corrects_payment_id != null && Number.isFinite(Number(m.corrects_payment_id))) {
          relatedOriginalPaymentId = Number(m.corrects_payment_id);
        }
        const reasonSummary =
          m.reason != null && String(m.reason).trim() ? String(m.reason).trim().slice(0, 240) : "";
        return {
          ...p,
          _kind: financeCfoDashboardRepo.cfoLedgerRowKind(p),
          _runningNetPaidAfter: runningNet,
          _relatedOriginalPaymentId: relatedOriginalPaymentId,
          _reasonSummary: reasonSummary,
        };
      });
      const statusHistory = await financeCfoDashboardRepo.listPayRunStatusHistoryForPayRun(pool, tid, id);
      const historyActorIds = statusHistory.map((h) => h.actor_admin_user_id).filter((x) => x != null);
      const historyActorLabels = await loadAdminUserLabelsByIds(pool, historyActorIds);
      const ledgerDriverEvents = statusHistory.filter(
        (h) => h.reason === "reversal_or_correction_reopened" || h.reason === "ledger_settled"
      );

      const tenants = isSuperAdmin(req.session.adminUser.role)
        ? await tenantsRepo.listAllOrderedByNameForSettings(pool)
        : [];

      const rec = reconciliation || {
        run_payable_total: 0,
        total_paid_amount: 0,
        outstanding_amount: 0,
      };
      const stripCore = financeCfoDashboardRepo.buildReconciliationStripCore(
        rec.run_payable_total,
        rec.total_paid_amount,
        rec.outstanding_amount
      );
      const reconciliationStrip = {
        ...stripCore,
        adjustmentState: financeCfoDashboardRepo.adjustmentStateFromLedgerRows(payments),
        reopenState: financeCfoDashboardRepo.reopenStateLabelFromStatusHistory(statusHistory),
      };

      return res.render("admin/field_agent_pay_run_finance_detail", {
        activeNav: "field_agent_payout_finance",
        run,
        tenantId: tid,
        tenant: tenantRow ? tenantsRepo.serializeTenantRow(tenantRow) : null,
        tenants,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        reconciliation,
        reconciliationStrip,
        reconciliationStripTitle: "Pay run reconciliation",
        ledgerRows,
        statusHistory,
        ledgerDriverEvents,
        historyActorLabels,
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/:id/finance-detail/export.csv", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(404).type("text").send("Not found.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const run = await fieldAgentPayRunRepo.getPayRunByIdForTenant(pool, id, tid);
      if (!run) return res.status(404).type("text").send("Not found.");
      const payments = await fieldAgentPayRunRepo.listPaymentsForPayRun(pool, id, tid, 2000, { order: "asc" });
      const csv = buildCfoPayRunLedgerCsv(id, payments);
      const filename = `cfo-pay-run-${id}-ledger.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(Buffer.from(csv, "utf8"));
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-pay-runs/:id", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(404).type("text").send("Not found.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const run = await fieldAgentPayRunRepo.getPayRunByIdForTenant(pool, id, tid);
      if (!run) return res.status(404).type("text").send("Not found.");
      const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, id, tid);
      const reconciliation = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, id, tid);
      const payments = await fieldAgentPayRunRepo.listPaymentsForPayRun(pool, id, tid, 300);
      const paymentsUi = buildPaymentLedgerUiRows(payments);
      const actorLabels = await loadActorLabels(pool, run, payments);
      const adjRows = await fieldAgentPayRunAdjustmentsRepo.listAdjustmentsForOriginalPayRun(pool, tid, id);
      const adjustmentsByItemId = {};
      for (const a of adjRows) {
        const iid = Number(a.original_pay_run_item_id);
        if (!adjustmentsByItemId[iid]) adjustmentsByItemId[iid] = [];
        adjustmentsByItemId[iid].push(a);
      }
      const carriedRows = await fieldAgentPayRunAdjustmentsRepo.listAdjustmentsAppliedInPayRun(pool, tid, id);
      const carriedAdjustmentsByFieldAgentId = {};
      for (const a of carriedRows) {
        const fa = Number(a.field_agent_id);
        if (!carriedAdjustmentsByFieldAgentId[fa]) carriedAdjustmentsByFieldAgentId[fa] = [];
        carriedAdjustmentsByFieldAgentId[fa].push(a);
      }
      const canAddAdjustment = run.status === "approved" || run.status === "paid";
      return res.render("admin/field_agent_pay_run_detail", {
        activeNav: "field_agent_pay_runs",
        run,
        items,
        reconciliation,
        payments,
        paymentsUi,
        actorLabels,
        adjustmentsByItemId,
        carriedAdjustmentsByFieldAgentId,
        canAddAdjustment,
        tenantId: tid,
        isSuper: isSuperAdmin(req.session.adminUser.role),
        flashLocked: req.query.locked === "1",
        flashApproved: req.query.approved === "1",
        flashPaid: req.query.paid === "1",
        flashPaymentRecorded: req.query.payment_recorded === "1",
        flashAdjustment: req.query.adjustment === "1",
        flashReversal: req.query.reversal === "1",
        flashCorrection: req.query.correction === "1",
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-pay-runs/:id/lock", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).type("text").send("Invalid id.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayRunRepo.lockPayRunDraft(pool, id, tid, adminId);
      if (result.error === "NO_ITEMS") {
        return res.status(400).type("text").send("Cannot lock: this pay run has no line items.");
      }
      if (result.error === "INVALID_STATE" || !result.run) {
        return res.status(409).type("text").send("Invalid state transition: only draft runs with line items can be locked.");
      }
      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      q.set("locked", "1");
      return res.redirect(302, `/admin/field-agent-pay-runs/${id}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-pay-runs/:id/approve", requirePayRunAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).type("text").send("Invalid id.");
      const runProbe = await fieldAgentPayRunRepo.getPayRunById(pool, id);
      if (!runProbe) return res.status(404).type("text").send("Not found.");
      const tid = Number(runProbe.tenant_id);
      if (!(await assertTenantAccessible(pool, req, tid))) {
        return res.status(403).type("text").send("You do not have access to this pay run.");
      }
      const adminId = req.session.adminUser && req.session.adminUser.id != null ? Number(req.session.adminUser.id) : null;
      const result = await fieldAgentPayRunRepo.approvePayRunLocked(pool, id, tid, adminId);
      if (result.error === "INVALID_STATE" || !result.run) {
        return res.status(409).type("text").send("Invalid state transition: only locked runs can be approved.");
      }
      const q = new URLSearchParams();
      if (res.locals.embed) q.set("embed", "1");
      q.set("approved", "1");
      return res.redirect(302, `/admin/field-agent-pay-runs/${id}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });
};

function settingsBonusForRow(b) {
  if (b == null) return null;
  const n = Number(b);
  return Number.isFinite(n) ? n : null;
}
