"use strict";

const PURPOSE = "MEMBER_PORTAL_ACTIVATION";

const DECISION = Object.freeze({
  LINK_ALLOWED: "LINK_ALLOWED",
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  OWNERSHIP_PROOF_REQUIRED: "OWNERSHIP_PROOF_REQUIRED",
  IDENTITY_CONFLICT: "IDENTITY_CONFLICT",
  INVITATION_INVALID: "INVITATION_INVALID",
  TENANT_MISMATCH: "TENANT_MISMATCH",
  MEMBER_ALREADY_ACTIVE: "MEMBER_ALREADY_ACTIVE",
});

function deny(decision, reason) {
  return { ok: false, decision, reason };
}

/**
 * Non-mutating ownership decision for member-purpose invitation acceptance.
 * The caller supplies the authenticated V5 session user and authoritative
 * tenant context; email and phone are deliberately not used as proof.
 */
async function verifyMemberActivationIdentityOwnership(db, input) {
  const source = input || {};
  const userId = String(source.authenticatedUserId || "").trim();
  if (!userId) return deny(DECISION.AUTHENTICATION_REQUIRED, "session_required");
  if (source.purpose !== PURPOSE) return deny(DECISION.INVITATION_INVALID, "purpose");

  try {
    const invitation = await db.query(`
      SELECT id, organization_id, church_id, branch_id, member_id,
             recipient_user_id, purpose, status, expires_at
        FROM blessboard.member_portal_invitations
       WHERE id = $1
    `, [source.invitationId]);
    const invite = invitation.rows[0];
    if (!invite || invite.purpose !== PURPOSE || invite.status !== "pending" ||
        !invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) {
      return deny(DECISION.INVITATION_INVALID, "not_pending");
    }
    if (String(invite.organization_id) !== String(source.organizationId) ||
        String(invite.church_id) !== String(source.churchId)) {
      return deny(DECISION.TENANT_MISMATCH, "invitation_scope");
    }

    const memberResult = await db.query(`
      SELECT m.id, m.church_id, m.user_id, m.portal_access_status,
             c.organization_id
        FROM blessboard.members m
        JOIN blessboard.churches c ON c.id = m.church_id
       WHERE m.id = $1
    `, [invite.member_id]);
    const member = memberResult.rows[0];
    if (!member || String(member.church_id) !== String(invite.church_id) ||
        String(member.church_id) !== String(source.churchId) ||
        String(member.organization_id) !== String(source.organizationId)) {
      return deny(DECISION.TENANT_MISMATCH, "member_scope");
    }
    if (member.portal_access_status === "active") {
      return deny(DECISION.MEMBER_ALREADY_ACTIVE, "already_active");
    }
    if (invite.recipient_user_id && String(invite.recipient_user_id) !== userId) {
      return deny(DECISION.IDENTITY_CONFLICT, "recipient_user_mismatch");
    }
    if (member.user_id && String(member.user_id) !== userId) {
      return deny(DECISION.IDENTITY_CONFLICT, "member_user_mismatch");
    }
    if (!invite.recipient_user_id && !member.user_id) {
      return deny(DECISION.OWNERSHIP_PROOF_REQUIRED, "unbound_member");
    }
    return {
      ok: true,
      decision: DECISION.LINK_ALLOWED,
      invitationId: invite.id,
      memberId: member.id,
      userId,
      churchId: member.church_id,
      organizationId: member.organization_id,
    };
  } catch {
    return deny(DECISION.INVITATION_INVALID, "lookup_failed");
  }
}

function authorizeLinkedMemberAccess(input) {
  const source = input || {};
  const userId = String(source.authenticatedUserId || "").trim();
  const memberUserId = String(source.memberUserId || "").trim();
  if (!userId || !memberUserId) return deny(DECISION.AUTHENTICATION_REQUIRED, "session_required");
  if (userId !== memberUserId) return deny(DECISION.IDENTITY_CONFLICT, "member_user_mismatch");
  if (source.portalAccessStatus !== "active") {
    return deny(DECISION.OWNERSHIP_PROOF_REQUIRED, "portal_not_active");
  }
  return { ok: true, decision: DECISION.LINK_ALLOWED };
}

module.exports = {
  PURPOSE,
  DECISION,
  verifyMemberActivationIdentityOwnership,
  authorizeLinkedMemberAccess,
};
