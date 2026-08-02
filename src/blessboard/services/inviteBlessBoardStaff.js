"use strict";

/**
 * BlessBoard V5 staff invitation + activation (copy-once token; no email delivery yet).
 * Supported invite roles (verified): church_hq_admin, branch_admin.
 * platform_admin cannot be invited via this path.
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const authRepo = require("../repositories/blessBoardAuthRepository");
const inviteRepo = require("../repositories/userInvitationRepository");
const { normalizeEmail } = require("./createBlessBoardUser");
const {
  evaluateStaffAccountLimit,
  STATUS: ENT_STATUS,
} = require("../../platform/services/entitlementService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
const { hashSessionToken } = require("../../platform/session/sessionToken");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  LIMIT_EXCEEDED: "limit_exceeded",
  EXPIRED: "expired",
  REVOKED: "revoked",
  ORG_INACTIVE: "org_inactive",
  LOOKUP_ERROR: "lookup_error",
});

/** Verified invite-capable roles from blessboard.user_roles CHECK / HQ assignable set. */
const INVITE_ROLES = Object.freeze(["church_hq_admin", "branch_admin"]);
const ACTOR_ROLES = Object.freeze(["church_hq_admin", "branch_admin", "platform_admin"]);
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const GENERIC_ACCEPT_FAILURE =
  "This invitation is not valid. Ask your administrator for a new invite link.";

function generateInviteToken() {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashSessionToken(rawToken) };
}

function validatePassword(password) {
  const value = password != null ? String(password) : "";
  if (!value || value.length < 10 || value.length > 200) {
    return { ok: false, reason: "password" };
  }
  return { ok: true, value };
}

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

async function loadActorRoles(client, actorUserId, organizationId) {
  const roles = await authRepo.listActiveRolesForUser(client, actorUserId);
  return (roles || []).filter(
    (r) =>
      ACTOR_ROLES.includes(String(r.role_key)) &&
      (String(r.role_key) === "platform_admin" ||
        String(r.organization_id) === String(organizationId))
  );
}

function actorMayInvite(actorRoles, input) {
  const isPlatform = actorRoles.some((r) => r.role_key === "platform_admin");
  const isHq = actorRoles.some(
    (r) =>
      r.role_key === "church_hq_admin" &&
      String(r.church_id) === String(input.churchId) &&
      String(r.organization_id) === String(input.organizationId)
  );
  if (isPlatform || isHq) {
    if (input.roleKey === "church_hq_admin") return { ok: true, source: isPlatform ? "platform" : "hq" };
    if (input.roleKey === "branch_admin") return { ok: true, source: isPlatform ? "platform" : "hq" };
    return { ok: false, reason: "role_key" };
  }
  const branchRoles = actorRoles.filter(
    (r) =>
      r.role_key === "branch_admin" &&
      String(r.organization_id) === String(input.organizationId) &&
      String(r.church_id) === String(input.churchId)
  );
  if (!branchRoles.length) return { ok: false, reason: "actor" };
  if (input.roleKey !== "branch_admin") return { ok: false, reason: "role_escalation" };
  if (!input.branchId) return { ok: false, reason: "branch_required" };
  const ownsBranch = branchRoles.some((r) => String(r.branch_id) === String(input.branchId));
  if (!ownsBranch) return { ok: false, reason: "branch_scope" };
  return { ok: true, source: "branch_admin" };
}

/**
 * Create or resend a staff invitation. Raw token returned once for copy-once delivery.
 * When allowPhoneOnly is true, email may be omitted if phoneNormalized (E.164) is provided.
 * When skipTransaction is true, caller must already hold an open transaction on `db`.
 */
async function inviteBlessBoardStaff(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const emailDisplay = String((input && input.email) || "").trim();
  const email = emailDisplay ? normalizeEmail(emailDisplay) : "";
  const allowPhoneOnly = Boolean(input && input.allowPhoneOnly);
  const skipTransaction = Boolean(input && input.skipTransaction);
  const phoneNormalized =
    input && input.phoneNormalized != null
      ? String(input.phoneNormalized).trim()
      : "";
  const phoneDisplay =
    input && input.phoneDisplay != null
      ? String(input.phoneDisplay).trim().slice(0, 40)
      : phoneNormalized;
  const roleKey = String((input && input.roleKey) || "")
    .trim()
    .toLowerCase();
  const displayName =
    String((input && input.displayName) || "").trim() ||
    emailDisplay ||
    phoneDisplay;
  let branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const branchKey =
    input && input.branchKey != null ? String(input.branchKey).trim().toLowerCase() : "";

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(churchId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "email", message: "Enter a valid email address." };
  }
  if (!email && !(allowPhoneOnly && phoneNormalized)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "email", message: "Enter a valid email address." };
  }
  if (allowPhoneOnly && phoneNormalized && !/^\+[1-9][0-9]{6,14}$/.test(phoneNormalized)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "phone", message: "Enter a valid phone number." };
  }
  if (!INVITE_ROLES.includes(roleKey)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "role_escalation" };
  }
  if (roleKey === "platform_admin") {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "role_escalation" };
  }
  if (roleKey === "church_hq_admin" && (branchId || branchKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "hq_scope" };
  }
  if (roleKey === "branch_admin" && !branchId && !branchKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_required" };
  }
  if (!displayName || displayName.length > 200) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "display_name" };
  }

  try {
    return await withClient(db, async (client) => {
      if (!skipTransaction) await client.query("BEGIN");
      try {
        const org = await client.query(
          `SELECT id, status FROM platform.organizations WHERE id = $1 FOR UPDATE`,
          [organizationId]
        );
        const fail = async (payload) => {
          if (!skipTransaction) await client.query("ROLLBACK");
          return payload;
        };

        if (!org.rows[0] || String(org.rows[0].status) !== "active") {
          return fail({ ok: false, status: STATUS.ORG_INACTIVE, reason: "organization_inactive" });
        }
        const church = await client.query(
          `SELECT id, organization_id, status FROM blessboard.churches WHERE id = $1 FOR UPDATE`,
          [churchId]
        );
        if (
          !church.rows[0] ||
          String(church.rows[0].organization_id) !== organizationId ||
          String(church.rows[0].status) === "suspended" ||
          String(church.rows[0].status) === "archived"
        ) {
          return fail({ ok: false, status: STATUS.ORG_INACTIVE, reason: "church_inactive" });
        }

        if (roleKey === "branch_admin") {
          if (!branchId && branchKey) {
            const branch = await authRepo.findBranchByChurchAndKey(client, churchId, branchKey);
            if (!branch || String(branch.status) !== "active") {
              return fail({ ok: false, status: STATUS.NOT_FOUND, reason: "branch" });
            }
            branchId = branch.id;
          } else if (branchId) {
            const br = await client.query(
              `SELECT id, church_id, status FROM blessboard.branches WHERE id = $1`,
              [branchId]
            );
            if (
              !br.rows[0] ||
              String(br.rows[0].church_id) !== churchId ||
              String(br.rows[0].status) !== "active"
            ) {
              return fail({ ok: false, status: STATUS.NOT_FOUND, reason: "branch" });
            }
          }
        } else {
          branchId = null;
        }

        const actorRoles = await loadActorRoles(client, actorUserId, organizationId);
        const gate = actorMayInvite(actorRoles, {
          organizationId,
          churchId,
          branchId,
          roleKey,
        });
        if (!gate.ok) {
          return fail({
            ok: false,
            status: STATUS.FORBIDDEN,
            reason: gate.reason || "actor",
          });
        }

        let existingUser = email
          ? await authRepo.findUserByEmail(client, email)
          : null;
        if (!existingUser && phoneNormalized) {
          existingUser = await authRepo.findUserByPhone(client, phoneNormalized);
        }
        if (existingUser && String(existingUser.id) === actorUserId) {
          return fail({ ok: false, status: STATUS.FORBIDDEN, reason: "self_invite" });
        }

        let hasActiveStaffInOrg = false;
        if (existingUser) {
          const staff = await client.query(
            `SELECT 1 FROM blessboard.user_roles
              WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
                AND role_key IN ('platform_admin', 'church_hq_admin', 'branch_admin')
              LIMIT 1`,
            [existingUser.id, organizationId]
          );
          hasActiveStaffInOrg = staff.rows.length > 0;

          const sameRole = await authRepo.findRole(client, {
            userId: existingUser.id,
            organizationId,
            churchId,
            branchId,
            roleKey,
          });
          if (sameRole && String(sameRole.status) === "active") {
            return fail({
              ok: false,
              status: STATUS.CONFLICT,
              reason: "already_assigned",
              message: "That user already has this role.",
            });
          }
        }

        const countsAsNewStaff = !hasActiveStaffInOrg;
        const countsAsNewUser = !hasActiveStaffInOrg;
        // Pending invite for this identity already counted in seat totals; resend does not add a seat.
        const pending = await inviteRepo.findPendingByScope(client, {
          organizationId,
          churchId,
          emailNormalized: email || null,
          phoneNormalized: phoneNormalized || null,
          roleKey,
          branchId,
        });
        const seatGate = await evaluateStaffAccountLimit(client, {
          organizationId,
          countsAsNewStaff: pending ? false : countsAsNewStaff,
          countsAsNewUser: pending ? false : countsAsNewUser,
        });
        if (!seatGate.ok) {
          const mapped =
            seatGate.status === ENT_STATUS.LIMIT_EXCEEDED
              ? STATUS.LIMIT_EXCEEDED
              : STATUS.FORBIDDEN;
          return fail({
            ok: false,
            status: mapped,
            reason: seatGate.reason,
            current: seatGate.current,
            limit: seatGate.limit,
            message: seatGate.message,
          });
        }

        if (pending) {
          await inviteRepo.markRevoked(client, pending.id, actorUserId);
        }

        let userId = existingUser ? String(existingUser.id) : null;
        if (!existingUser) {
          const created = await authRepo.insertUser(client, {
            emailNormalized: email || null,
            emailDisplay: email ? emailDisplay.slice(0, 254) : null,
            passwordHash: null,
            status: "invited",
            displayName: displayName.slice(0, 200),
            phoneNormalized: phoneNormalized || null,
            phoneDisplay: phoneNormalized ? phoneDisplay || phoneNormalized : null,
          });
          userId = String(created.id);
        } else if (phoneNormalized && !existingUser.phone_normalized) {
          await client.query(
            `UPDATE blessboard.users
                SET phone_normalized = COALESCE(phone_normalized, $2),
                    phone_display = COALESCE(phone_display, $3),
                    updated_at = now()
              WHERE id = $1`,
            [existingUser.id, phoneNormalized, phoneDisplay || phoneNormalized]
          );
        }

        const { rawToken, tokenHash } = generateInviteToken();
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
        const invitation = await inviteRepo.insertInvitation(client, {
          organizationId,
          churchId,
          branchId,
          emailNormalized: email || null,
          emailDisplay: email ? emailDisplay.slice(0, 254) : null,
          phoneNormalized: phoneNormalized || null,
          phoneDisplay: phoneNormalized ? phoneDisplay || phoneNormalized : null,
          displayName: displayName.slice(0, 200),
          roleKey,
          tokenHash,
          expiresAt,
          invitedByUserId: actorUserId,
        });

        const depCode =
          (input && input.deploymentCode) ||
          (await (async () => {
            const fromEnv = (() => {
              try {
                const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
                const id = getPlatformDeploymentCode((input && input.env) || process.env);
                return id && id.ok ? id.code : null;
              } catch {
                return null;
              }
            })();
            if (fromEnv) {
              const exists = await client.query(
                `SELECT 1 FROM platform.deployments WHERE deployment_code = $1 LIMIT 1`,
                [fromEnv]
              );
              if (exists.rows[0]) return fromEnv;
            }
            const row = await client.query(
              `SELECT deployment_id AS deployment_code
                 FROM platform.domains
                WHERE organization_id = $1
                ORDER BY is_primary DESC NULLS LAST, created_at ASC
                LIMIT 1`,
              [organizationId]
            );
            if (row.rows[0] && row.rows[0].deployment_code) {
              return String(row.rows[0].deployment_code);
            }
            return fromEnv || "blessboard-org-staging";
          })());

        await recordBlessBoardAudit(client, {
          churchId,
          organizationId,
          branchId,
          actorUserId,
          actionKey: "invitation.created",
          entityType: "user_invitation",
          entityId: invitation.id,
          outcome: "success",
          env: input && input.env,
          deploymentCode: depCode,
          metadata: {
            status: pending ? "resent" : "created",
            reason_code: gate.source === "platform" ? "platform_override" : "tenant_invite",
            entity_key: roleKey,
            branch_key: branchKey || undefined,
            source: gate.source,
            has_email: Boolean(email),
            has_phone: Boolean(phoneNormalized),
          },
        });

        if (!skipTransaction) await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          userId,
          existingUser: Boolean(existingUser),
          invitation: {
            id: invitation.id,
            emailDisplay: invitation.emailDisplay,
            phoneDisplay: invitation.phoneDisplay,
            roleKey: invitation.roleKey,
            expiresAt: invitation.expiresAt,
            resent: Boolean(pending),
          },
          // Copy-once: never persist or log. Caller must show once then discard.
          rawToken,
          delivery: "copy_once",
        };
      } catch (err) {
        if (!skipTransaction) {
          try {
            await client.query("ROLLBACK");
          } catch {
            /* ignore */
          }
        }
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listPendingInvitations(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, invitations: [], reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const invitations = await inviteRepo.listPendingForChurch(client, {
        organizationId,
        churchId,
        limit: input && input.limit,
      });
      return {
        ok: true,
        status: STATUS.OK,
        invitations: invitations.map((i) => ({
          id: i.id,
          emailDisplay: i.emailDisplay,
          displayName: i.displayName,
          roleKey: i.roleKey,
          branchKey: i.branchKey,
          branchDisplayName: i.branchDisplayName,
          expiresAt: i.expiresAt,
          createdAt: i.createdAt,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      invitations: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function revokeInvitation(db, input) {
  const invitationId = String((input && input.invitationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(invitationId) || !UUID_RE.test(actorUserId) || !UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const invite = await inviteRepo.findById(client, invitationId, { forUpdate: true });
        if (
          !invite ||
          String(invite.organizationId) !== organizationId ||
          (churchId && String(invite.churchId) !== churchId)
        ) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "invitation" };
        }
        if (invite.status !== "pending") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.CONFLICT, reason: "not_pending" };
        }
        const actorRoles = await loadActorRoles(client, actorUserId, organizationId);
        const gate = actorMayInvite(actorRoles, {
          organizationId: invite.organizationId,
          churchId: invite.churchId,
          branchId: invite.branchId,
          roleKey: invite.roleKey,
        });
        if (!gate.ok) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, reason: gate.reason };
        }
        const revoked = await inviteRepo.markRevoked(client, invitationId, actorUserId);
        await recordBlessBoardAudit(client, {
          churchId: invite.churchId,
          organizationId: invite.organizationId,
          branchId: invite.branchId,
          actorUserId,
          actionKey: "invitation.revoked",
          entityType: "user_invitation",
          entityId: invitationId,
          outcome: "success",
          metadata: {
            status: "revoked",
            entity_key: invite.roleKey,
            reason_code: "admin_revoke",
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, invitation: revoked };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * Peek invitation for accept form (no enumeration of email).
 */
async function getInvitationForAccept(db, rawToken) {
  const tokenHash = hashSessionToken(rawToken);
  if (!tokenHash || tokenHash.length !== 64) {
    return { ok: false, status: STATUS.NOT_FOUND, message: GENERIC_ACCEPT_FAILURE };
  }
  try {
    return await withClient(db, async (client) => {
      const invite = await inviteRepo.findByTokenHash(client, tokenHash);
      if (!invite || invite.status !== "pending") {
        return { ok: false, status: STATUS.NOT_FOUND, message: GENERIC_ACCEPT_FAILURE };
      }
      if (new Date(invite.expiresAt).getTime() <= Date.now()) {
        await inviteRepo.markExpired(client, invite.id);
        return { ok: false, status: STATUS.EXPIRED, message: GENERIC_ACCEPT_FAILURE };
      }
      let user = invite.emailNormalized
        ? await authRepo.findUserByEmail(client, invite.emailNormalized)
        : null;
      if (!user && invite.phoneNormalized) {
        user = await authRepo.findUserByPhone(client, invite.phoneNormalized);
      }
      const requiresPassword = !user || String(user.status) !== "active";
      return {
        ok: true,
        status: STATUS.OK,
        invitation: {
          id: invite.id,
          roleKey: invite.roleKey,
          displayName: invite.displayName,
          requiresPassword,
          hasEmail: Boolean(invite.emailNormalized),
          hasPhone: Boolean(invite.phoneNormalized),
        },
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: GENERIC_ACCEPT_FAILURE };
  }
}

/**
 * Accept invitation: set password (new/invited users) or confirm (existing active), assign role.
 */
async function acceptInvitation(db, input) {
  const rawToken = String((input && input.token) || "");
  const tokenHash = hashSessionToken(rawToken);
  if (!tokenHash || tokenHash.length !== 64) {
    return { ok: false, status: STATUS.NOT_FOUND, message: GENERIC_ACCEPT_FAILURE };
  }

  const passwordProvided =
    input && input.password != null && String(input.password).length > 0;
  let passwordHash = null;
  if (passwordProvided) {
    const passwordCheck = validatePassword(input.password);
    if (!passwordCheck.ok) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        reason: "password",
        message: "Choose a password between 10 and 200 characters.",
      };
    }
    passwordHash = await bcrypt.hash(passwordCheck.value, BCRYPT_ROUNDS);
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const invite = await inviteRepo.findByTokenHash(client, tokenHash, { forUpdate: true });
        if (!invite || invite.status !== "pending") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: GENERIC_ACCEPT_FAILURE };
        }
        if (new Date(invite.expiresAt).getTime() <= Date.now()) {
          await inviteRepo.markExpired(client, invite.id);
          await client.query("COMMIT");
          return { ok: false, status: STATUS.EXPIRED, message: GENERIC_ACCEPT_FAILURE };
        }

        const org = await client.query(
          `SELECT id, status FROM platform.organizations WHERE id = $1`,
          [invite.organizationId]
        );
        const church = await client.query(
          `SELECT id, status, organization_id FROM blessboard.churches WHERE id = $1`,
          [invite.churchId]
        );
        if (
          !org.rows[0] ||
          String(org.rows[0].status) !== "active" ||
          !church.rows[0] ||
          String(church.rows[0].status) === "suspended" ||
          String(church.rows[0].status) === "archived" ||
          String(church.rows[0].status) === "inactive"
        ) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.ORG_INACTIVE,
            message: "This church is not accepting invitations right now.",
          };
        }

        if (invite.branchId) {
          const branch = await client.query(
            `SELECT id, status FROM blessboard.branches WHERE id = $1`,
            [invite.branchId]
          );
          if (!branch.rows[0] || String(branch.rows[0].status) !== "active") {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.FORBIDDEN,
              message: "This branch is not available.",
            };
          }
        }

        let user = invite.emailNormalized
          ? await authRepo.findUserByEmail(client, invite.emailNormalized)
          : null;
        if (!user && invite.phoneNormalized) {
          user = await authRepo.findUserByPhone(client, invite.phoneNormalized);
        }
        if (!user) {
          if (!passwordHash) {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.INVALID_INPUT,
              reason: "password",
              message: "Choose a password between 10 and 200 characters.",
            };
          }
          user = await authRepo.insertUser(client, {
            emailNormalized: invite.emailNormalized || null,
            emailDisplay: invite.emailDisplay || null,
            passwordHash,
            status: "active",
            displayName: invite.displayName,
            phoneNormalized: invite.phoneNormalized || null,
            phoneDisplay: invite.phoneDisplay || null,
          });
        } else if (String(user.status) === "invited") {
          if (!passwordHash) {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.INVALID_INPUT,
              reason: "password",
              message: "Choose a password between 10 and 200 characters.",
            };
          }
          user = await authRepo.activateUserWithPassword(client, user.id, {
            passwordHash,
            displayName: invite.displayName,
            status: "active",
          });
        } else if (String(user.status) !== "active") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, message: GENERIC_ACCEPT_FAILURE };
        }
        // else: existing active identity — assign role only (explicit multi-org membership)

        const existingRole = await authRepo.findRole(client, {
          userId: user.id,
          organizationId: invite.organizationId,
          churchId: invite.churchId,
          branchId: invite.branchId,
          roleKey: invite.roleKey,
        });
        let roleRow = existingRole;
        if (existingRole && String(existingRole.status) !== "active") {
          roleRow = await authRepo.updateRoleStatus(client, existingRole.id, "active");
        } else if (!existingRole) {
          roleRow = await authRepo.insertRole(client, {
            userId: user.id,
            organizationId: invite.organizationId,
            churchId: invite.churchId,
            branchId: invite.branchId,
            roleKey: invite.roleKey,
          });
        }

        const accepted = await inviteRepo.markAccepted(client, invite.id, user.id);
        if (!accepted) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.CONFLICT, message: GENERIC_ACCEPT_FAILURE };
        }

        const acceptDepCode = await (async () => {
          try {
            const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
            const id = getPlatformDeploymentCode((input && input.env) || process.env);
            const fromEnv = id && id.ok ? id.code : null;
            if (fromEnv) {
              const exists = await client.query(
                `SELECT 1 FROM platform.deployments WHERE deployment_code = $1 LIMIT 1`,
                [fromEnv]
              );
              if (exists.rows[0]) return fromEnv;
            }
            const row = await client.query(
              `SELECT deployment_id AS deployment_code
                 FROM platform.domains
                WHERE organization_id = $1
                ORDER BY is_primary DESC NULLS LAST, created_at ASC
                LIMIT 1`,
              [invite.organizationId]
            );
            if (row.rows[0] && row.rows[0].deployment_code) {
              return String(row.rows[0].deployment_code);
            }
            return fromEnv || "blessboard-org-staging";
          } catch {
            return "blessboard-org-staging";
          }
        })();

        await recordBlessBoardAudit(client, {
          churchId: invite.churchId,
          organizationId: invite.organizationId,
          branchId: invite.branchId,
          actorUserId: user.id,
          actionKey: "invitation.accepted",
          entityType: "user_invitation",
          entityId: invite.id,
          outcome: "success",
          deploymentCode: acceptDepCode,
          env: input && input.env,
          metadata: {
            status: "accepted",
            entity_key: invite.roleKey,
            reason_code: "token_accept",
          },
        });
        await recordBlessBoardAudit(client, {
          churchId: invite.churchId,
          organizationId: invite.organizationId,
          branchId: invite.branchId,
          actorUserId: user.id,
          actionKey: "role.assigned",
          entityType: "user_role",
          entityId: roleRow && roleRow.id,
          outcome: "success",
          deploymentCode: acceptDepCode,
          env: input && input.env,
          metadata: {
            status: "assigned",
            entity_key: invite.roleKey,
            source: "invitation",
          },
        });

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          user: {
            id: user.id,
            email: user.email_normalized || invite.emailNormalized,
            displayName: user.display_name || invite.displayName,
          },
          role: roleRow,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: GENERIC_ACCEPT_FAILURE,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  INVITE_ROLES,
  INVITE_TTL_MS,
  GENERIC_ACCEPT_FAILURE,
  inviteBlessBoardStaff,
  listPendingInvitations,
  revokeInvitation,
  getInvitationForAccept,
  acceptInvitation,
  generateInviteToken,
  validatePassword,
};
