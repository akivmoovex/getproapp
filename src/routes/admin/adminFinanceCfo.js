"use strict";

const { requireSuperAdmin } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const financeCfoDashboardRepo = require("../../db/pg/financeCfoDashboardRepo");
const fieldAgentPayRunRepo = require("../../db/pg/fieldAgentPayRunRepo");

function parseOptionalISODate(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return s;
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
