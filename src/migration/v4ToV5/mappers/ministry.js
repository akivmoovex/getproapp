"use strict";

const { ok, quarantine } = require("./helpers");
const { requireMappedParent } = require("./parents");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null) return quarantine("missing_organization_id", row);

  const church = requireMappedParent(
    ctx.idMap,
    "church_organizations_church",
    row.organization_id,
    "orphan_organization",
    row
  );
  if (!church.ok) return church.result;

  const name = String(row.name || row.title || "").trim();
  if (!name) return quarantine("missing_name", row);

  const statusRaw = String(row.status || "draft").toLowerCase();
  const status = ["draft", "published", "archived"].includes(statusRaw) ? statusRaw : null;
  if (!status) return quarantine("invalid_status", row);

  let branchId = null;
  if (row.branch_id != null) {
    const branch = requireMappedParent(
      ctx.idMap,
      "church_branches",
      row.branch_id,
      "orphan_branch",
      row
    );
    if (!branch.ok) return branch.result;
    branchId = branch.id;
  }

  const ministryId = ctx.idMap.resolve("church_ministries", id, "blessboard.ministries");

  return ok(
    {
      ministry: {
        id: ministryId,
        churchId: church.id,
        branchId,
        name: name.slice(0, 200),
        description: row.description ? String(row.description).slice(0, 5000) : null,
        status,
        joinPolicy: "request",
      },
      unsupported: {
        slug: row.slug,
        departments: true,
      },
    },
    row.slug ? ["slug_not_natural_key_in_v5"] : []
  );
}

module.exports = { transform };
