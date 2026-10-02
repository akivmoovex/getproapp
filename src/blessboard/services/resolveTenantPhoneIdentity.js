"use strict";

/**
 * Authoritative tenant-scoped phone identity lookup (Prompt 11B).
 * Never returns records from another organisation.
 *
 * Outcomes:
 *   NO_MATCH | EXISTING_USER | EXISTING_MEMBER_WITHOUT_USER |
 *   PENDING_INVITATION | TENANT_DUPLICATE
 */

const MATCH = Object.freeze({
  NO_MATCH: "NO_MATCH",
  EXISTING_USER: "EXISTING_USER",
  EXISTING_MEMBER_WITHOUT_USER: "EXISTING_MEMBER_WITHOUT_USER",
  PENDING_INVITATION: "PENDING_INVITATION",
  TENANT_DUPLICATE: "TENANT_DUPLICATE",
});

/**
 * @param {import('pg').PoolClient | { query: Function }} client
 * @param {{
 *   organizationId: string,
 *   churchId?: string | null,
 *   phoneNormalized: string,
 * }} input
 */
async function resolveTenantPhoneIdentity(client, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const phoneNormalized = String((input && input.phoneNormalized) || "").trim();
  const churchId =
    input && input.churchId != null && String(input.churchId).trim()
      ? String(input.churchId).trim()
      : null;

  if (!organizationId || !phoneNormalized) {
    return { ok: false, match: null, reason: "invalid_input" };
  }

  const staff = await client.query(
    `SELECT osp.user_id, osp.organization_id,
            u.display_name, u.email_display, u.email_normalized,
            u.phone_normalized, u.phone_display, u.status,
            u.phone_verified_at
       FROM blessboard.organization_staff_phones osp
       JOIN blessboard.users u ON u.id = osp.user_id
      WHERE osp.organization_id = $1
        AND osp.phone_normalized = $2
      LIMIT 2`,
    [organizationId, phoneNormalized]
  );

  const pending = await client.query(
    `SELECT i.id, i.accepted_user_id, i.email_display, i.phone_display, i.phone_normalized,
            i.role_key, i.branch_id, i.church_id, i.status, i.expires_at, i.display_name
       FROM blessboard.user_invitations i
      WHERE i.organization_id = $1
        AND i.phone_normalized = $2
        AND i.status = 'pending'
      LIMIT 2`,
    [organizationId, phoneNormalized]
  );

  let members = { rows: [] };
  if (churchId) {
    members = await client.query(
      `SELECT m.id, m.user_id, m.first_name, m.last_name, m.preferred_name,
              m.email_display, m.phone_display, m.phone_normalized, m.status
         FROM blessboard.members m
         JOIN blessboard.churches c ON c.id = m.church_id
        WHERE m.church_id = $1
          AND c.organization_id = $2
          AND m.phone_normalized = $3
          AND m.status IN ('active', 'pending')
        LIMIT 5`,
      [churchId, organizationId, phoneNormalized]
    );
  } else {
    members = await client.query(
      `SELECT m.id, m.user_id, m.first_name, m.last_name, m.preferred_name,
              m.email_display, m.phone_display, m.phone_normalized, m.status,
              m.church_id
         FROM blessboard.members m
         JOIN blessboard.churches c ON c.id = m.church_id
        WHERE c.organization_id = $1
          AND m.phone_normalized = $2
          AND m.status IN ('active', 'pending')
        LIMIT 5`,
      [organizationId, phoneNormalized]
    );
  }

  const staffRows = staff.rows;
  const pendingRows = pending.rows;
  const memberRows = members.rows;

  if (staffRows.length > 1 || pendingRows.length > 1) {
    return {
      ok: true,
      match: MATCH.TENANT_DUPLICATE,
      organizationId,
      phoneNormalized,
      staff: staffRows.map(mapStaff),
      invitations: pendingRows.map(mapInvite),
      members: memberRows.map(mapMember),
    };
  }

  if (staffRows.length === 1) {
    const user = mapStaff(staffRows[0]);
    const linkedMembers = memberRows.filter(
      (m) => m.user_id && String(m.user_id) === user.userId
    );
    const otherMembers = memberRows.filter(
      (m) => !m.user_id || String(m.user_id) !== user.userId
    );
    if (otherMembers.length > 0 && otherMembers.some((m) => !m.user_id)) {
      return {
        ok: true,
        match: MATCH.TENANT_DUPLICATE,
        organizationId,
        phoneNormalized,
        user,
        staff: [user],
        invitations: pendingRows.map(mapInvite),
        members: memberRows.map(mapMember),
      };
    }
    return {
      ok: true,
      match: MATCH.EXISTING_USER,
      organizationId,
      phoneNormalized,
      user,
      staff: [user],
      invitations: pendingRows.map(mapInvite),
      members: (linkedMembers.length ? linkedMembers : memberRows).map(mapMember),
      pendingInvitation: pendingRows[0] ? mapInvite(pendingRows[0]) : null,
    };
  }

  if (pendingRows.length === 1) {
    return {
      ok: true,
      match: MATCH.PENDING_INVITATION,
      organizationId,
      phoneNormalized,
      invitation: mapInvite(pendingRows[0]),
      invitations: pendingRows.map(mapInvite),
      members: memberRows.map(mapMember),
      user: null,
    };
  }

  const withoutUser = memberRows.filter((m) => !m.user_id);
  const withUser = memberRows.filter((m) => m.user_id);

  if (withoutUser.length >= 1 && withUser.length === 0) {
    if (withoutUser.length > 1) {
      return {
        ok: true,
        match: MATCH.TENANT_DUPLICATE,
        organizationId,
        phoneNormalized,
        members: memberRows.map(mapMember),
      };
    }
    return {
      ok: true,
      match: MATCH.EXISTING_MEMBER_WITHOUT_USER,
      organizationId,
      phoneNormalized,
      member: mapMember(withoutUser[0]),
      members: withoutUser.map(mapMember),
    };
  }

  if (withUser.length >= 1) {
    const distinctUsers = new Set(withUser.map((m) => String(m.user_id)));
    if (distinctUsers.size > 1 || withoutUser.length > 0) {
      return {
        ok: true,
        match: MATCH.TENANT_DUPLICATE,
        organizationId,
        phoneNormalized,
        members: memberRows.map(mapMember),
      };
    }
    return {
      ok: true,
      match: MATCH.EXISTING_USER,
      organizationId,
      phoneNormalized,
      user: {
        userId: String(withUser[0].user_id),
        displayName:
          withUser[0].preferred_name ||
          `${withUser[0].first_name || ""} ${withUser[0].last_name || ""}`.trim(),
        phoneDisplay: withUser[0].phone_display,
        emailDisplay: withUser[0].email_display,
        status: null,
        phoneNormalized: withUser[0].phone_normalized,
        phoneVerifiedAt: null,
      },
      members: memberRows.map(mapMember),
    };
  }

  return {
    ok: true,
    match: MATCH.NO_MATCH,
    organizationId,
    phoneNormalized,
    staff: [],
    invitations: [],
    members: [],
  };
}

function mapStaff(row) {
  return {
    userId: String(row.user_id),
    displayName: row.display_name || null,
    emailDisplay: row.email_display || null,
    emailNormalized: row.email_normalized || null,
    phoneDisplay: row.phone_display || null,
    phoneNormalized: row.phone_normalized || null,
    status: row.status || null,
    phoneVerifiedAt: row.phone_verified_at || null,
  };
}

function mapInvite(row) {
  return {
    id: String(row.id),
    displayName: row.display_name || null,
    emailDisplay: row.email_display || null,
    phoneDisplay: row.phone_display || null,
    phoneNormalized: row.phone_normalized || null,
    roleKey: row.role_key || null,
    branchId: row.branch_id ? String(row.branch_id) : null,
    churchId: row.church_id ? String(row.church_id) : null,
    status: row.status || null,
    expiresAt: row.expires_at || null,
  };
}

function mapMember(row) {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    churchId: row.church_id ? String(row.church_id) : null,
    displayName:
      row.preferred_name ||
      `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
      null,
    emailDisplay: row.email_display || null,
    phoneDisplay: row.phone_display || null,
    phoneNormalized: row.phone_normalized || null,
    status: row.status || null,
  };
}

module.exports = {
  MATCH,
  resolveTenantPhoneIdentity,
};
