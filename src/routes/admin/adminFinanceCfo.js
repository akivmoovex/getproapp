"use strict";

const { requireSuperAdmin } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const financeCfoDashboardRepo = require("../../db/pg/financeCfoDashboardRepo");
const fieldAgentPayRunRepo = require("../../db/pg/fieldAgentPayRunRepo");
const {
  buildCrossTenantConsolidatedSummaryCsv,
  buildCrossTenantPayRunSummaryCsv,
} = require("../../admin/financeCfoExportCsv");

function parseOptionalISODate(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return s;
}

/** Query params for cross-tenant finance summary + exception run list (GET; read-only). */
function parseCrossTenantFinanceQuery(req) {
  const periodStartFrom = parseOptionalISODate(req.query.period_from);
  const periodStartTo = parseOptionalISODate(req.query.period_to);
  const tenantIdRaw = req.query.tenant_id != null && String(req.query.tenant_id).trim() !== "" ? Number(req.query.tenant_id) : null;
  const tenantId = tenantIdRaw != null && Number.isFinite(tenantIdRaw) && tenantIdRaw > 0 ? tenantIdRaw : null;
  const tenantExceptionPreset = financeCfoDashboardRepo.normalizeCrossTenantTenantPreset(req.query.exception);
  const frequentAdjustmentsMinRuns = Math.min(100, Math.max(1, Number(req.query.frequent_min) || 3));

  const runStatusRaw = String(req.query.run_status || "").trim().toLowerCase();
  const runStatus = ["draft", "locked", "approved", "paid", "void"].includes(runStatusRaw) ? runStatusRaw : null;
  const runAdjustedOnly = String(req.query.run_adj || "") === "1";
  const runReopenedOnly = String(req.query.run_reopened || "") === "1";
  const runOutstandingOnly = String(req.query.run_out || "") === "1";
  const runChangedAfterCloseOnly = String(req.query.run_changed || "") === "1";

  const summaryOpts = {
    periodStartFrom,
    periodStartTo,
    tenantId,
    tenantExceptionPreset,
    frequentAdjustmentsMinRuns,
  };

  const exceptionRunOpts = {
    periodStartFrom,
    periodStartTo,
    tenantId,
    runStatus,
    adjustedOnly: runAdjustedOnly,
    reopenedOnly: runReopenedOnly,
    outstandingOnly: runOutstandingOnly,
    changedAfterCloseOrSnapshotOnly: runChangedAfterCloseOnly,
    limit: 80,
  };

  return {
    summaryOpts,
    exceptionRunOpts,
    form: {
      periodStartFrom: periodStartFrom || "",
      periodStartTo: periodStartTo || "",
      tenantId: tenantId != null ? String(tenantId) : "",
      exception: tenantExceptionPreset || "",
      frequentMin: String(frequentAdjustmentsMinRuns),
      runStatus: runStatus || "",
      runAdjustedOnly,
      runReopenedOnly,
      runOutstandingOnly,
      runChangedAfterCloseOnly,
    },
  };
}

function buildTenantTableRows(tenantRows, statusByTenant, recByTenant, unappliedByTenant) {
  return tenantRows.map((t) => {
    const id = Number(t.id);
    const st = statusByTenant.get(id) || { draft: 0, locked: 0, approved: 0, paid: 0 };
    const rec = recByTenant.get(id) || {
      approved_paid_run_count: 0,
      frozen_payable_total: 0,
      ledger_paid_total: 0,
      outstanding_total: 0,
      overpaid_total: 0,
      rec_unpaid: 0,
      rec_partial: 0,
      rec_paid: 0,
      rec_overpaid: 0,
    };
    const adj = unappliedByTenant.get(id) || { count: 0, sum: 0 };
    return {
      id,
      slug: t.slug,
      name: t.name,
      pay_run_counts: { ...st },
      ...rec,
      unapplied_adjustment_count: adj.count,
      unapplied_adjustment_sum: adj.sum,
    };
  });
}

module.exports = function registerAdminFinanceCfoRoutes(router) {
  /** Cross-tenant KPIs + filters + exception run list; super admin only (requireSuperAdmin → super_admin). */
  router.get("/finance/summary", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const q = parseCrossTenantFinanceQuery(req);
      const [{ platform, tenants, filterMeta }, tenantOptions, exceptionRuns] = await Promise.all([
        financeCfoDashboardRepo.getCrossTenantFinanceSummaryDashboard(pool, q.summaryOpts),
        tenantsRepo.listOrderedById(pool),
        financeCfoDashboardRepo.listCrossTenantFinanceExceptionRuns(pool, q.exceptionRunOpts),
      ]);
      return res.render("admin/finance_cross_tenant_summary", {
        activeNav: "finance_summary",
        platform,
        tenants,
        filterMeta,
        form: q.form,
        tenantOptions,
        exceptionRuns,
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });

  /** CSV: one row per tenant; respects same filter query params as HTML summary. */
  router.get("/finance/summary/export.csv", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const q = parseCrossTenantFinanceQuery(req);
      const { tenants } = await financeCfoDashboardRepo.getCrossTenantFinanceSummaryDashboard(pool, q.summaryOpts);
      const csv = buildCrossTenantConsolidatedSummaryCsv(tenants);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="cross-tenant-finance-summary.csv"');
      return res.status(200).send(Buffer.from(csv, "utf8"));
    } catch (e) {
      return next(e);
    }
  });

  /** CSV: one row per pay run (cross-tenant); capped in repo. */
  router.get("/finance/summary/pay-runs-export.csv", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const rows = await financeCfoDashboardRepo.listPayRunsForCrossTenantCfoSummaryExport(pool, {});
      const csv = buildCrossTenantPayRunSummaryCsv(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="cross-tenant-pay-runs-summary.csv"');
      return res.status(200).send(Buffer.from(csv, "utf8"));
    } catch (e) {
      return next(e);
    }
  });

  /**
   * Tenant drill-down from consolidated finance summary (read-only).
   * Access: requireSuperAdmin only (same global console gate as /finance/summary). Tenant-scoped roles are not granted this route.
   */
  router.get("/finance/summary/tenant/:tenantId", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tenantId = Number(req.params.tenantId);
      if (!Number.isFinite(tenantId) || tenantId < 1) {
        return res.status(400).type("text").send("Invalid tenant.");
      }
      const tenantRow = await tenantsRepo.getById(pool, tenantId);
      if (!tenantRow) return res.status(404).type("text").send("Tenant not found.");

      const preset = financeCfoDashboardRepo.FINANCE_EXCEPTION_PRESET;
      const sliceLimit = 25;
      const [payoutSummary, recentPayRuns, reopenedRuns, adjustedRuns, outstandingRuns] = await Promise.all([
        financeCfoDashboardRepo.getFieldAgentPayoutDashboardSummary(pool, tenantId),
        financeCfoDashboardRepo.listPayRunsForPayoutDashboard(pool, tenantId, { limit: sliceLimit }),
        financeCfoDashboardRepo.listPayRunsForPayoutDashboard(pool, tenantId, {
          limit: sliceLimit,
          exceptionPreset: preset.REOPENED,
        }),
        financeCfoDashboardRepo.listPayRunsForPayoutDashboard(pool, tenantId, {
          limit: sliceLimit,
          exceptionPreset: preset.ADJUSTED,
        }),
        financeCfoDashboardRepo.listPayRunsForPayoutDashboard(pool, tenantId, {
          limit: sliceLimit,
          exceptionPreset: preset.OUTSTANDING,
        }),
      ]);

      const tenant = tenantsRepo.serializeTenantRow(tenantRow);
      const payRunSlices = [
        {
          key: "recent",
          title: "Recent pay runs",
          description: "Latest pay runs by period (up to " + sliceLimit + ").",
          rows: recentPayRuns,
        },
        {
          key: "reopened",
          title: "Reopened runs",
          description: "Runs with paid → approved in status history (when history is available).",
          rows: reopenedRuns,
        },
        {
          key: "adjusted",
          title: "Adjusted runs",
          description: "Runs with at least one reversal or correction ledger line.",
          rows: adjustedRuns,
        },
        {
          key: "outstanding",
          title: "Outstanding runs",
          description: "Frozen payable exceeds net ledger on the run.",
          rows: outstandingRuns,
        },
      ];

      return res.render("admin/finance_summary_tenant", {
        activeNav: "finance_summary",
        tenant,
        tenantId,
        payoutSummary: payoutSummary || null,
        payRunSlices,
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/finance/cfo", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const periodStartFrom = parseOptionalISODate(req.query.period_from);
      const periodStartTo = parseOptionalISODate(req.query.period_to);
      const dateOpts = { periodStartFrom, periodStartTo };

      const tenantRows = await tenantsRepo.listOrderedById(pool);
      const tenantsSerialized = tenantRows.map((r) => tenantsRepo.serializeTenantRow(r));

      const [statusByTenant, runRows, unappliedByTenant, recentPayments] = await Promise.all([
        financeCfoDashboardRepo.getPayRunStatusCountsByTenant(pool, dateOpts),
        financeCfoDashboardRepo.getApprovedPaidRunReconciliationRows(pool, dateOpts),
        financeCfoDashboardRepo.getUnappliedAdjustmentsByTenant(pool),
        financeCfoDashboardRepo.getRecentPaymentActivity(pool, { limit: 18, tenantId: null }),
      ]);

      const recByTenant = financeCfoDashboardRepo.rollupReconciliationByTenant(runRows);
      const platformRec = financeCfoDashboardRepo.rollupPlatform(recByTenant);

      let unappliedCountTotal = 0;
      let unappliedSumTotal = 0;
      for (const v of unappliedByTenant.values()) {
        unappliedCountTotal += v.count;
        unappliedSumTotal = fieldAgentPayRunRepo.roundMoney2(unappliedSumTotal + v.sum);
      }

      const tenantsTable = buildTenantTableRows(tenantsSerialized, statusByTenant, recByTenant, unappliedByTenant);

      const tenantsWithSignals = tenantsTable.filter(
        (row) =>
          row.approved_paid_run_count > 0 ||
          row.pay_run_counts.draft + row.pay_run_counts.locked + row.pay_run_counts.approved + row.pay_run_counts.paid > 0 ||
          row.unapplied_adjustment_count > 0
      ).length;

      const tenantsById = Object.fromEntries(tenantsSerialized.map((t) => [String(t.id), t]));

      return res.render("admin/finance_cfo_dashboard", {
        activeNav: "finance_cfo",
        periodStartFrom: periodStartFrom || "",
        periodStartTo: periodStartTo || "",
        platform: {
          ...platformRec,
          unapplied_adjustment_count: unappliedCountTotal,
          unapplied_adjustment_sum: unappliedSumTotal,
          tenants_with_signals: tenantsWithSignals,
          tenant_count: tenantsSerialized.length,
        },
        tenantsTable,
        recentPayments,
        tenantsById,
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/finance/cfo/tenant/:tenantId", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tenantId = Number(req.params.tenantId);
      if (!Number.isFinite(tenantId) || tenantId < 1) {
        return res.status(400).type("text").send("Invalid tenant.");
      }
      const tenantRow = await tenantsRepo.getById(pool, tenantId);
      if (!tenantRow) return res.status(404).type("text").send("Tenant not found.");

      const periodStartFrom = parseOptionalISODate(req.query.period_from);
      const periodStartTo = parseOptionalISODate(req.query.period_to);
      const dateOpts = { periodStartFrom, periodStartTo };

      const [statusByTenant, runRows, unappliedByTenant, payRunRows, recentPayments] = await Promise.all([
        financeCfoDashboardRepo.getPayRunStatusCountsByTenant(pool, dateOpts),
        financeCfoDashboardRepo.getApprovedPaidRunReconciliationRows(pool, { ...dateOpts, tenantId }),
        financeCfoDashboardRepo.getUnappliedAdjustmentsByTenant(pool),
        financeCfoDashboardRepo.getTenantPayRunFinanceRows(pool, tenantId, dateOpts),
        financeCfoDashboardRepo.getRecentPaymentActivity(pool, { limit: 12, tenantId }),
      ]);

      const recByTenant = financeCfoDashboardRepo.rollupReconciliationByTenant(runRows);
      const tenantRec = recByTenant.get(tenantId) || {
        approved_paid_run_count: 0,
        frozen_payable_total: 0,
        ledger_paid_total: 0,
        outstanding_total: 0,
        overpaid_total: 0,
        rec_unpaid: 0,
        rec_partial: 0,
        rec_paid: 0,
        rec_overpaid: 0,
      };
      const st = statusByTenant.get(tenantId) || { draft: 0, locked: 0, approved: 0, paid: 0 };
      const adj = unappliedByTenant.get(tenantId) || { count: 0, sum: 0 };
      const tenant = tenantsRepo.serializeTenantRow(tenantRow);

      return res.render("admin/finance_cfo_tenant", {
        activeNav: "finance_cfo",
        tenant,
        tenantId,
        periodStartFrom: periodStartFrom || "",
        periodStartTo: periodStartTo || "",
        payRunCounts: st,
        reconciliationRollup: tenantRec,
        unappliedAdjustments: adj,
        payRunRows,
        recentPayments,
        embed: !!res.locals.embed,
      });
    } catch (e) {
      return next(e);
    }
  });
};
