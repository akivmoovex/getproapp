"use strict";

const { hashSessionToken } = require("../../platform/session/sessionToken");
const {
  PURPOSE,
  DECISION,
  verifyMemberActivationIdentityOwnership,
} = require("./memberActivationIdentityOwnershipService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

function failure(code, reason) {
  return { ok: false, code, ...(reason ? { reason } : {}) };
}

async function acceptMemberPortalInvitation(db, input) {
  const source = input || {};
  const rawToken = String(source.token || "");
  const authenticatedUserId = String(source.authenticatedUserId || "").trim();
  if (!rawToken) return failure("INVITATION_INVALID");
  if (!authenticatedUserId) return failure("AUTHENTICATION_REQUIRED");

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const tokenHash = hashSessionToken(rawToken);
    const found = await client.query(`
      SELECT id, organization_id, church_id, branch_id, member_id,
             purpose, status, expires_at
        FROM blessboard.member_portal_invitations
       WHERE token_hash = $1
       FOR UPDATE
    `, [tokenHash]);
    const invite = found.rows[0];
    if (!invite || invite.purpose !== PURPOSE || invite.status !== "pending" ||
        !invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return failure("INVITATION_INVALID");
    }
    if (String(invite.organization_id) !== String(source.organizationId) ||
        String(invite.church_id) !== String(source.churchId)) {
      await client.query("ROLLBACK");
      return failure("TENANT_MISMATCH");
    }

    const ownership = await verifyMemberActivationIdentityOwnership(client, {
      invitationId: invite.id,
      authenticatedUserId,
      organizationId: source.organizationId,
      churchId: source.churchId,
      purpose: PURPOSE,
    });
    if (!ownership.ok || ownership.decision !== DECISION.LINK_ALLOWED) {
      await client.query("ROLLBACK");
      return failure(ownership.decision || "OWNERSHIP_PROOF_REQUIRED", ownership.reason);
    }

    const member = await client.query(`
      SELECT id, church_id, user_id, portal_access_status
        FROM blessboard.members
       WHERE id = $1
       FOR UPDATE
    `, [invite.member_id]);
    if (!member.rows[0] || member.rows[0].portal_access_status === "active") {
      await client.query("ROLLBACK");
      return failure("MEMBER_ALREADY_ACTIVE");
    }
    const row = member.rows[0];
    if (row.user_id && String(row.user_id) !== authenticatedUserId) {
      await client.query("ROLLBACK");
      return failure("IDENTITY_CONFLICT");
    }

    await client.query(`
      UPDATE blessboard.members
         SET user_id = $2, portal_access_status = 'active', updated_at = now()
       WHERE id = $1
    `, [row.id, authenticatedUserId]);
    await client.query(`
      UPDATE blessboard.member_portal_invitations
         SET status = 'accepted', accepted_user_id = $2,
             accepted_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'pending'
    `, [invite.id, authenticatedUserId]);
    await recordBlessBoardAudit(client, {
      organizationId: invite.organization_id,
      churchId: invite.church_id,
      branchId: invite.branch_id,
      actorUserId: authenticatedUserId,
      actionKey: "member_portal_invitation.accepted",
      entityType: "member_portal_invitation",
      entityId: invite.id,
      metadata: { purpose: PURPOSE, member_id: row.id },
    });
    await client.query("COMMIT");
    return {
      ok: true,
      code: "ACCEPTED",
      invitationId: invite.id,
      memberId: row.id,
      userId: authenticatedUserId,
      portalAccessStatus: "active",
    };
  } catch {
    try { await client.query("ROLLBACK"); } catch {}
    return failure("ACTIVATION_FAILED");
  } finally {
    client.release();
  }
}

module.exports = {
  acceptMemberPortalInvitation,
};
