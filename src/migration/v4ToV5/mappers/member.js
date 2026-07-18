"use strict";

const {
  normalizeEmail,
  normalizePhone,
  mapMemberStatus,
  splitFullName,
  ok,
  quarantine,
} = require("./helpers");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null || row.branch_id == null) {
    return quarantine("missing_scope", row);
  }

  const status = mapMemberStatus(row.status);
  if (!status) return quarantine("invalid_status", row);

  const names = splitFullName(row.full_name);
  if (!names) return quarantine("missing_name", row);

  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.phone || row.phone_normalized);
  if (!email && !phone) return quarantine("missing_contact", row);

  const warnings = [];
  if (row.password_hash) warnings.push("member_password_not_migrated_to_users");

  const churchId = ctx.idMap.resolve(
    "church_organizations_church",
    row.organization_id,
    "blessboard.churches"
  );
  const branchId = ctx.idMap.resolve("church_branches", row.branch_id, "blessboard.branches");
  const memberId = ctx.idMap.resolve("church_members", id, "blessboard.members");

  return ok(
    {
      member: {
        id: memberId,
        churchId,
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
        branchId,
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
