"use strict";

const {
  normalizeEmail,
  normalizePhone,
  mapMemberStatus,
  splitFullName,
  ok,
  quarantine,
} = require("./helpers");
const { requireMappedParent } = require("./parents");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null || row.branch_id == null) {
    return quarantine("missing_scope", row);
  }

  const church = requireMappedParent(
    ctx.idMap,
    "church_organizations_church",
    row.organization_id,
    "orphan_organization",
    row
  );
  if (!church.ok) return church.result;

  const branch = requireMappedParent(
    ctx.idMap,
    "church_branches",
    row.branch_id,
    "orphan_branch",
    row
  );
  if (!branch.ok) return branch.result;

  const status = mapMemberStatus(row.status);
  if (!status) return quarantine("invalid_status", row);

  const names = splitFullName(row.full_name);
  if (!names) return quarantine("missing_name", row);

  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.phone || row.phone_normalized);
  if (!email && !phone) return quarantine("missing_contact", row);

  const warnings = [];
  if (row.password_hash) warnings.push("member_password_not_migrated_to_users");

  const memberId = ctx.idMap.resolve("church_members", id, "blessboard.members");

  return ok(
    {
      member: {
        id: memberId,
        churchId: church.id,
        userId: null,
        firstName: names.firstName.slice(0, 100),
        lastName: names.lastName.slice(0, 100),
        emailNormalized: email,
        emailDisplay: email,
        phoneNormalized: phone,
        phoneDisplay: phone,
        status,
      },
      membership: {
        memberId,
        branchId: branch.id,
        isPrimary: true,
        membershipStatus: status === "pending" ? "pending" : "active",
      },
      unsupported: {
        password_hash: Boolean(row.password_hash),
        emergency_contact: row.emergency_contact,
        platform_tenant_id: row.platform_tenant_id,
      },
    },
    warnings
  );
}

module.exports = { transform };
