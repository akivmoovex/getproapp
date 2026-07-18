"use strict";

const { ok, quarantine } = require("./helpers");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null) return quarantine("missing_organization_id", row);

  const name = String(row.name || row.title || "").trim();
  if (!name) return quarantine("missing_name", row);

  const statusRaw = String(row.status || "draft").toLowerCase();
  const status = ["draft", "published", "archived"].includes(statusRaw) ? statusRaw : null;
  if (!status) return quarantine("invalid_status", row);

  const churchId = ctx.idMap.resolve(
    "church_organizations_church",
    row.organization_id,
    "blessboard.churches"
  );
  const branchId =
    row.branch_id != null
      ? ctx.idMap.resolve("church_branches", row.branch_id, "blessboard.branches")
      : null;
  const ministryId = ctx.idMap.resolve("church_ministries", id, "blessboard.ministries");

  return ok(
    {
      ministry: {
        id: ministryId,
        churchId,
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
