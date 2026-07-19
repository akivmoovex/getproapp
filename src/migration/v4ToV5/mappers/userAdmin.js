"use strict";

/**
 * Maps church_hq_admins and church_branch_admins.
 */

const { normalizeEmail, ok, quarantine } = require("./helpers");
const { requireMappedParent } = require("./parents");

function transform(row, ctx, entity) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null) return quarantine("missing_organization_id", row);

  const org = requireMappedParent(
    ctx.idMap,
    "church_organizations",
    row.organization_id,
    "orphan_organization",
    row
  );
  if (!org.ok) return org.result;

  const warnings = [];
  let email = normalizeEmail(row.email);
  if (!email) {
    const username = String(row.username || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._+-]/g, "");
    const orgKey = String(row.organization_slug || row.organization_id)
      .trim()
      .toLowerCase();
    if (!username) return quarantine("missing_email_and_username", row);
    email = `${username}@${orgKey}.migrated.invalid`;
    warnings.push("synthesized_email_from_username");
  }

  const hash = String(row.password_hash || "");
  if (hash.length < 20 || hash.length > 200) {
    return quarantine("invalid_password_hash", row, warnings);
  }

  const legacyTable =
    entity === "user_branch_admin" ? "church_branch_admins" : "church_hq_admins";
  const userId = ctx.idMap.resolve(legacyTable, id, "blessboard.users");

  const roleKey = entity === "user_branch_admin" ? "branch_admin" : "church_hq_admin";
  let churchId = null;
  let branchId = null;
  if (roleKey === "church_hq_admin") {
    const church = requireMappedParent(
      ctx.idMap,
      "church_organizations_church",
      row.organization_id,
      "orphan_organization",
      row
    );
    if (!church.ok) return church.result;
    churchId = church.id;
  } else {
    if (row.branch_id == null) return quarantine("missing_branch_id", row, warnings);
    const church = requireMappedParent(
      ctx.idMap,
      "church_organizations_church",
      row.organization_id,
      "orphan_organization",
      row
    );
    if (!church.ok) return church.result;
    churchId = church.id;
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

  const status = String(row.status || "active").toLowerCase() === "active" ? "active" : "inactive";

  return ok(
    {
      user: {
        id: userId,
        emailNormalized: email,
        emailDisplay: email,
        passwordHash: hash,
        displayName: String(row.display_name || row.username || email).trim().slice(0, 200),
        status,
      },
      role: {
        userId,
        organizationId: org.id,
        churchId,
        branchId,
        roleKey,
        status: "active",
      },
      unsupported: {
        username: row.username,
        can_view_finance: row.can_view_finance,
        permission_flags: true,
      },
    },
    warnings
  );
}

module.exports = { transform };
