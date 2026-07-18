"use strict";

const { ok, quarantine } = require("./helpers");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null || row.branch_id == null) {
    return quarantine("missing_scope", row);
  }

  const year = Number(row.period_year);
  const month = Number(row.period_month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return quarantine("invalid_period", row);
  }

  const cents = Number(row.total_amount_cents);
  if (!Number.isFinite(cents) || cents < 0) return quarantine("invalid_amount", row);

  const currency = String(row.currency_code || "ZMW")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return quarantine("invalid_currency", row);

  const legacyStatus = String(row.status || "draft").toLowerCase();
  let status;
  let submittedAt = null;
  let approvedAt = null;
  if (legacyStatus === "draft") status = "draft";
  else if (legacyStatus === "finalized") {
    status = "approved";
    submittedAt = row.updated_at || row.created_at || new Date().toISOString();
    approvedAt = submittedAt;
  } else return quarantine("invalid_status", row);

  const givingDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const churchId = ctx.idMap.resolve(
    "church_organizations_church",
    row.organization_id,
    "blessboard.churches"
  );
  const branchId = ctx.idMap.resolve("church_branches", row.branch_id, "blessboard.branches");
  const entryId = ctx.idMap.resolve("church_giving_summaries", id, "blessboard.giving_entries");

  return ok(
    {
      category: {
        churchId,
        categoryKey: "general",
        label: "General",
        status: "active",
      },
      entry: {
        id: entryId,
        churchId,
        branchId,
        givingDate,
        amount: (cents / 100).toFixed(2),
        currency,
        status,
        submittedAt,
        approvedAt,
        notes: row.notes ? String(row.notes).slice(0, 1000) : null,
        recordedByUserId: "MIGRATION_ACTOR",
      },
      unsupported: {
        donor_pii: false,
        billing_invoices: true,
      },
    },
    ["requires_migration_actor_user"]
  );
}

module.exports = { transform };
