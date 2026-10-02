"use strict";

/**
 * Referential integrity checks after migration (counts only, no PII).
 */

async function countOrphans(pool, sql, label) {
  const r = await pool.query(sql);
  return { label, count: Number(r.rows[0].n) };
}

async function verifyReferentialIntegrity(targetPool) {
  const checks = [];

  checks.push(
    await countOrphans(
      targetPool,
      `SELECT COUNT(*)::int AS n
         FROM blessboard.branches b
         LEFT JOIN blessboard.churches c ON c.id = b.church_id
        WHERE c.id IS NULL`,
      "bb_branch_missing_church"
    )
  );

  checks.push(
    await countOrphans(
      targetPool,
      `SELECT COUNT(*)::int AS n
         FROM blessboard.users u
         JOIN blessboard.user_role_assignments ura ON ura.user_id = u.id AND ura.status = 'active'
         LEFT JOIN platform.identities i ON i.id = u.platform_identity_id
        WHERE u.status = 'active' AND i.id IS NULL`,
      "bb_user_missing_identity"
    )
  );

  checks.push(
    await countOrphans(
      targetPool,
      `SELECT COUNT(*)::int AS n
         FROM blessboard.user_role_assignments ura
         LEFT JOIN blessboard.roles r ON r.id = ura.role_id
        WHERE ura.status = 'active' AND r.id IS NULL`,
      "bb_role_assignment_missing_role"
    )
  );

  checks.push(
    await countOrphans(
      targetPool,
      `SELECT COUNT(*)::int AS n
         FROM activeclinic.facilities f
         LEFT JOIN activeclinic.healthcare_organizations h ON h.id = f.healthcare_organization_id
        WHERE h.id IS NULL`,
      "ac_facility_missing_hco"
    )
  );

  checks.push(
    await countOrphans(
      targetPool,
      `SELECT COUNT(*)::int AS n
         FROM activeclinic.staff_members sm
         LEFT JOIN activeclinic.healthcare_organizations h ON h.id = sm.healthcare_organization_id
        WHERE sm.status IN ('active','invited') AND h.id IS NULL`,
      "ac_staff_missing_hco"
    )
  );

  checks.push(
    await countOrphans(
      targetPool,
      `SELECT COUNT(*)::int AS n
         FROM activeclinic.staff_members sm
         LEFT JOIN platform.identities i ON i.id = sm.platform_identity_id
        WHERE sm.status = 'active' AND sm.platform_identity_id IS NOT NULL AND i.id IS NULL`,
      "ac_staff_missing_identity"
    )
  );

  checks.push(
    await countOrphans(
      targetPool,
      `SELECT COUNT(*)::int AS n
         FROM platform.website_instances wi
         LEFT JOIN platform.organizations o ON o.id = wi.organization_id
        WHERE o.id IS NULL`,
      "website_instance_missing_org"
    )
  );

  checks.push(
    await countOrphans(
      targetPool,
      `SELECT COUNT(*)::int AS n
         FROM blessboard.media_assets ma
         LEFT JOIN blessboard.churches c ON c.id = ma.church_id
        WHERE ma.status = 'active' AND c.id IS NULL`,
      "bb_media_missing_church"
    )
  );

  const orphanTotal = checks.reduce((sum, c) => sum + c.count, 0);
  return { checks, orphanTotal, ok: orphanTotal === 0 };
}

module.exports = {
  verifyReferentialIntegrity,
};
