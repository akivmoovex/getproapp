"use strict";

const crypto = require("crypto");
const { hashSessionToken } = require("../../platform/session/sessionToken");
const { authorize } = require("./blessBoardRbacAuthorizationService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const PURPOSE = "MEMBER_PORTAL_ACTIVATION";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATUS = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  REVOKED: "revoked",
  EXPIRED: "expired",
});

function result(code, extra) {
  return { ok: false, code, ...(extra || {}) };
}

function generateSecret() {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashSessionToken(rawToken) };
}

async function withTransaction(db, fn) {
  if (db && typeof db.query === "function" && typeof db.release === "function") {
    return fn(db);
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function checkAuthority(client, input, branchId) {
  const auth = await authorize(client, {
    permission: "members.create",
    actor: { userId: input.actorUserId },
    tenantContext: {
      organizationId: input.organizationId,
      churchId: input.churchId,
      primaryBranchId: input.branchId || null,
    },
    resourceContext: {
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: branchId || null,
    },
  });
  return Boolean(auth && auth.allowed);
}

async function loadEligibleMember(client, input) {
  const member = await client.query(`
    SELECT m.id, m.church_id, m.user_id, m.email_normalized, m.email_display,
           m.portal_access_status, c.organization_id
      FROM blessboard.members m
      JOIN blessboard.churches c ON c.id = m.church_id
     WHERE m.id = $1
     FOR UPDATE
  `, [input.memberId]);
  if (!member.rows[0]) return result("not_found");
  const row = member.rows[0];
  if (String(row.church_id) !== String(input.churchId)) return result("foreign_church");
  if (String(row.organization_id) !== String(input.organizationId)) return result("foreign_organization");
  if (row.portal_access_status === "active") return result("already_active");
  if (!row.email_normalized) return result("contact_required");
  if (!row.user_id) return result("identity_required");
  if (row.user_id) {
    const conflict = await client.query(
      `SELECT id FROM blessboard.users
        WHERE email_normalized = $1 AND id <> $2 LIMIT 1`,
      [row.email_normalized, row.user_id]
    );
    if (conflict.rows[0]) return result("identity_conflict");
  }
  const branch = await client.query(`
    SELECT b.id FROM blessboard.member_branch_memberships mb
    JOIN blessboard.branches b ON b.id = mb.branch_id
   WHERE mb.member_id = $1 AND mb.is_primary = true
   LIMIT 1
  `, [input.memberId]);
  const branchId = branch.rows[0] ? branch.rows[0].id : null;
  if (input.branchId && String(input.branchId) !== String(branchId)) {
    return result("branch_scope");
  }
  return { ok: true, member: row, branchId };
}

async function issueMemberPortalInvitation(db, input) {
  const source = input || {};
  if (source.purpose !== PURPOSE) return result("invalid_purpose");
  try {
    return await withTransaction(db, async (client) => {
      const eligible = await loadEligibleMember(client, source);
      if (!eligible.ok) return eligible;
      if (!(await checkAuthority(client, source, eligible.branchId))) return result("unauthorized");
      const existing = await client.query(`
        SELECT id FROM blessboard.member_portal_invitations
         WHERE member_id = $1 AND purpose = $2 AND status = 'pending'
         LIMIT 1
      `, [source.memberId, PURPOSE]);
      if (existing.rows[0]) return { ok: true, code: "already_pending", invitationId: existing.rows[0].id };
      const token = generateSecret();
      const inserted = await client.query(`
        INSERT INTO blessboard.member_portal_invitations
          (organization_id, church_id, branch_id, member_id, recipient_user_id,
           purpose, token_hash, expires_at, invited_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id, expires_at
      `, [source.organizationId, source.churchId, eligible.branchId, source.memberId,
        eligible.member.user_id || null, PURPOSE, token.tokenHash,
        new Date(Date.now() + TTL_MS), source.actorUserId]);
      await recordBlessBoardAudit(client, {
        organizationId: source.organizationId, churchId: source.churchId,
        branchId: eligible.branchId, actorUserId: source.actorUserId,
        actionKey: "member_portal_invitation.created",
        entityType: "member_portal_invitation", entityId: inserted.rows[0].id,
        metadata: { purpose: PURPOSE },
      });
      return {
        ok: true, code: "invitation_ready", invitationId: inserted.rows[0].id,
        expiresAt: inserted.rows[0].expires_at, rawToken: token.rawToken,
      };
    });
  } catch (error) {
    if (error && error.code === "23505") return result("already_pending");
    return result("failed");
  }
}

async function revokeMemberPortalInvitation(db, input) {
  return mutateInvitation(db, input, "revoke");
}

async function resendMemberPortalInvitation(db, input) {
  return withTransaction(db, async (client) => {
    const eligible = await loadEligibleMember(client, input);
    if (!eligible.ok) return eligible;
    const revoked = await mutateInvitation(client, input, "revoke", true);
    if (!revoked.ok && revoked.code !== "not_found") return revoked;
    return issueMemberPortalInvitation(client, input);
  });
}

async function mutateInvitation(db, input, operation, nested) {
  const execute = async (client) => {
    const row = await client.query(`
      SELECT * FROM blessboard.member_portal_invitations
       WHERE id = $1 FOR UPDATE
    `, [input.invitationId]);
    if (!row.rows[0]) return result("not_found");
    const invite = row.rows[0];
    if (String(invite.church_id) !== String(input.churchId) ||
        String(invite.organization_id) !== String(input.organizationId)) return result("forbidden");
    if (!(await checkAuthority(client, input, invite.branch_id))) return result("unauthorized");
    if (operation === "revoke" && invite.status !== STATUS.PENDING) {
      return result(invite.status === STATUS.ACCEPTED ? "already_accepted" : "already_revoked");
    }
    await client.query(`
      UPDATE blessboard.member_portal_invitations
         SET status = 'revoked', revoked_at = now(), revoked_by_user_id = $2, updated_at = now()
       WHERE id = $1
    `, [input.invitationId, input.actorUserId]);
    await recordBlessBoardAudit(client, {
      organizationId: input.organizationId, churchId: input.churchId,
      branchId: invite.branch_id, actorUserId: input.actorUserId,
      actionKey: "member_portal_invitation.revoked",
      entityType: "member_portal_invitation", entityId: invite.id,
      metadata: { purpose: PURPOSE, operation },
    });
    return { ok: true, code: "revoked", invitationId: invite.id };
  };
  if (nested) return execute(db);
  try { return await withTransaction(db, execute); } catch { return result("failed"); }
}

module.exports = {
  PURPOSE,
  STATUS,
  INVITE_TTL_MS: TTL_MS,
  issueMemberPortalInvitation,
  revokeMemberPortalInvitation,
  resendMemberPortalInvitation,
};
