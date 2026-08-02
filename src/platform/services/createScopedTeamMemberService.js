"use strict";

/**
 * Prompt 10H: create / invite HQ or branch team members (phone-first).
 * Reuses inviteBlessBoardStaff + RBAC assignment services.
 */

const authRepo = require("../../blessboard/repositories/blessBoardAuthRepository");
const {
  normalizeBlessBoardPhone,
} = require("../../blessboard/services/normalizeBlessBoardPhone");
const { normalizeEmail } = require("../../blessboard/services/createBlessBoardUser");
const {
  MATCH,
  resolveTenantPhoneIdentity,
} = require("../../blessboard/services/resolveTenantPhoneIdentity");
const {
  inviteBlessBoardStaff,
  STATUS: INVITE_STATUS,
} = require("../../blessboard/services/inviteBlessBoardStaff");
const {
  createRoleAssignment,
} = require("../../blessboard/services/blessBoardRoleAssignmentService");
const {
  recordBlessBoardAudit,
} = require("../../blessboard/services/recordBlessBoardAudit");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const HIGHLY_SENSITIVE = Object.freeze([
  "finance_director",
  "finance_officer",
  "pastoral_care_lead",
  "safeguarding_officer",
]);

function deploymentCode(env) {
  const id = getPlatformDeploymentCode(env || process.env);
  return id && id.ok ? id.code : "blessboard-org-v5";
}

async function resolveDeploymentCodeForOrg(client, organizationId, env, explicit) {
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  const fromEnv = deploymentCode(env);
  const exists = await client.query(
    `SELECT 1 FROM platform.deployments WHERE deployment_code = $1 LIMIT 1`,
    [fromEnv]
  );
  if (exists.rows[0]) return fromEnv;
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
  return fromEnv;
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

function buildWhatsAppShareUrl({ phoneE164, message }) {
  const digits = String(phoneE164 || "").replace(/\D/g, "");
  if (!digits || !message) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function buildInviteShareMessage({
  firstName,
  churchName,
  roleLabel,
  invitationUrl,
  expiresAt,
}) {
  const exp =
    expiresAt != null
      ? new Date(expiresAt).toISOString().slice(0, 10)
      : "the expiry date shown in BlessBoard";
  return (
    `Hello ${firstName},\n\n` +
    `You have been invited to join ${churchName} on BlessBoard as ${roleLabel}.\n\n` +
    `Use this secure link to create your account:\n\n` +
    `${invitationUrl}\n\n` +
    `This invitation expires on ${exp}.`
  );
}

/**
 * Look up existing staff phone within an organisation tenant.
 */
async function findOrgStaffByPhone(client, organizationId, phoneNormalized) {
  const r = await client.query(
    `SELECT osp.user_id, u.email_normalized, u.email_display, u.display_name, u.status,
            u.phone_normalized, u.phone_display
       FROM blessboard.organization_staff_phones osp
       JOIN blessboard.users u ON u.id = osp.user_id
      WHERE osp.organization_id = $1 AND osp.phone_normalized = $2
      LIMIT 1`,
    [organizationId, phoneNormalized]
  );
  return r.rows[0] || null;
}

async function findMemberByPhone(client, churchId, phoneNormalized) {
  const r = await client.query(
    `SELECT id, user_id, first_name, last_name, preferred_name, email_display, status
       FROM blessboard.members
      WHERE church_id = $1
        AND phone_normalized = $2
        AND status IN ('active', 'pending')
      LIMIT 1`,
    [churchId, phoneNormalized]
  );
  return r.rows[0] || null;
}

async function upsertOrgStaffPhone(client, organizationId, phoneNormalized, userId) {
  await client.query(
    `INSERT INTO blessboard.organization_staff_phones
       (organization_id, phone_normalized, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id, phone_normalized)
     DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now()`,
    [organizationId, phoneNormalized, userId]
  );
}

/**
 * Create or invite an HQ / branch team member (phone required, email optional).
 */
async function createScopedTeamMember(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const firstName = String((input && input.firstName) || "").trim();
  const lastName = String((input && input.lastName) || "").trim();
  const placement = String((input && input.placement) || "")
    .trim()
    .toLowerCase();
  const roleKey = String((input && input.roleKey) || "")
    .trim()
    .toLowerCase();
  const assignmentReason = String((input && input.assignmentReason) || "").trim();
  const leadershipTitle = String((input && input.leadershipTitle) || "")
    .trim()
    .slice(0, 120);
  const country = (input && input.country) || null;
  const emailDisplay = String((input && input.email) || "").trim();
  const email = emailDisplay ? normalizeEmail(emailDisplay) : "";
  let branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const expiresAtRaw =
    input && input.expiresAt != null && String(input.expiresAt).trim()
      ? String(input.expiresAt).trim()
      : null;

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(churchId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  if (!firstName || !lastName) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "name" };
  }
  if (placement !== "hq" && placement !== "branch") {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "placement" };
  }
  if (placement === "branch" && (!branchId || !UUID_RE.test(branchId))) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_required" };
  }
  if (placement === "hq") branchId = null;
  if (!roleKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "role" };
  }
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "email" };
  }
  if (actorUserId === String(input.targetUserId || "")) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "self_assignment" };
  }

  const phoneResult = normalizeBlessBoardPhone(input && input.phone, {
    country,
    defaultCountry: "ZM",
  });
  if (!phoneResult.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: "phone",
      message: phoneResult.error || "Enter a valid phone number.",
    };
  }
  const phoneNormalized = phoneResult.normalized;
  const phoneDisplay = phoneResult.display || phoneNormalized;
  const phoneCountryCode = phoneResult.countryCode || null;
  const displayName = `${firstName} ${lastName}`.trim().slice(0, 200);

  let expiresAt = null;
  if (expiresAtRaw) {
    const d = new Date(expiresAtRaw);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "expires_at" };
    }
    expiresAt = d.toISOString();
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const org = await client.query(
          `SELECT o.id, o.status, o.display_name, o.organization_key,
                  c.id AS church_id, c.display_name AS church_name, c.country_code
             FROM platform.organizations o
             JOIN blessboard.churches c ON c.organization_id = o.id
            WHERE o.id = $1 AND c.id = $2
            LIMIT 1
            FOR UPDATE OF o`,
          [organizationId, churchId]
        );
        if (!org.rows[0] || String(org.rows[0].status) !== "active") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
        }
        const orgRow = org.rows[0];
        const countryHint = country || orgRow.country_code || "ZM";

        // Re-normalize with church country if first pass used weak context.
        const phone2 = normalizeBlessBoardPhone(input.phone, {
          country: countryHint,
          defaultCountry: "ZM",
        });
        const phoneNorm = phone2.ok ? phone2.normalized : phoneNormalized;
        const phoneDisp = phone2.ok ? phone2.display : phoneDisplay;
        const phoneCc = phone2.ok ? phone2.countryCode || phoneCountryCode : phoneCountryCode;

        let branchRow = null;
        if (placement === "branch") {
          const br = await client.query(
            `SELECT b.id, b.branch_key, b.display_name, b.church_id, b.status
               FROM blessboard.branches b
              WHERE b.id = $1
              LIMIT 1`,
            [branchId]
          );
          branchRow = br.rows[0] || null;
          if (
            !branchRow ||
            String(branchRow.church_id) !== churchId ||
            String(branchRow.status) !== "active"
          ) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.FORBIDDEN, reason: "forged_branch" };
          }
        }

        const LEGACY_BOOTSTRAP = new Set(["church_hq_admin", "branch_admin"]);
        let roleMetaRow = null;
        if (LEGACY_BOOTSTRAP.has(roleKey)) {
          roleMetaRow = {
            role_key: roleKey,
            display_name:
              roleKey === "branch_admin" ? "Branch Administrator" : "Organisation Administrator",
            description: "Legacy bootstrap staff role",
            role_category: "Administration",
            is_sensitive: false,
            is_active: true,
          };
        } else {
          const roleMeta = await client.query(
            `SELECT role_key, display_name, description, role_category, is_sensitive, is_active
               FROM blessboard.roles
              WHERE role_key = $1
              LIMIT 1`,
            [roleKey]
          );
          if (!roleMeta.rows[0] || roleMeta.rows[0].is_active === false) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.INVALID_INPUT, reason: "role" };
          }
          roleMetaRow = roleMeta.rows[0];
        }
        if (roleKey === "platform_administrator" || roleKey === "platform_admin") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, reason: "platform_scope_forbidden" };
        }

        const sensitive =
          Boolean(roleMetaRow.is_sensitive) || HIGHLY_SENSITIVE.includes(roleKey);
        if (sensitive && !assignmentReason) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.INVALID_INPUT, reason: "reason_required" };
        }

        const identity = await resolveTenantPhoneIdentity(client, {
          organizationId,
          churchId,
          phoneNormalized: phoneNorm,
        });
        if (identity.ok && identity.match === MATCH.EXISTING_USER) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "phone_exists",
            match: MATCH.EXISTING_USER,
            message: "A user with this phone number already exists in this church.",
            existingUser: identity.user
              ? {
                  id: identity.user.userId,
                  displayName: identity.user.displayName,
                  emailDisplay: identity.user.emailDisplay,
                  status: identity.user.status,
                  phoneDisplay: identity.user.phoneDisplay,
                }
              : null,
            existingMember: identity.members && identity.members[0]
              ? {
                  id: identity.members[0].id,
                  displayName: identity.members[0].displayName,
                  userId: identity.members[0].userId,
                }
              : null,
          };
        }
        if (identity.ok && identity.match === MATCH.PENDING_INVITATION) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "pending_invitation",
            match: MATCH.PENDING_INVITATION,
            message: "A pending invitation already exists for this phone number.",
            invitation: identity.invitation,
          };
        }
        if (identity.ok && identity.match === MATCH.TENANT_DUPLICATE) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "tenant_duplicate",
            match: MATCH.TENANT_DUPLICATE,
            message: "This phone number matches more than one record in this church.",
          };
        }
        const memberOnly =
          identity.ok && identity.match === MATCH.EXISTING_MEMBER_WITHOUT_USER
            ? identity.member
            : null;
        // Member without staff phone binding — caller may choose link flow; still allow invite.

        const bootstrapRole = placement === "branch" ? "branch_admin" : "church_hq_admin";
        const depCode = await resolveDeploymentCodeForOrg(
          client,
          organizationId,
          input.env,
          input.deploymentCode
        );

        const invited = await inviteBlessBoardStaff(client, {
          organizationId,
          churchId,
          actorUserId,
          email: email || undefined,
          phoneNormalized: phoneNorm,
          phoneDisplay: phoneDisp,
          roleKey: bootstrapRole,
          displayName,
          branchId: placement === "branch" ? branchId : null,
          env: input.env,
          deploymentCode: depCode,
          allowPhoneOnly: true,
          skipTransaction: true,
        });

        if (!invited.ok) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status:
              invited.status === INVITE_STATUS.FORBIDDEN
                ? STATUS.FORBIDDEN
                : invited.status === INVITE_STATUS.CONFLICT
                  ? STATUS.CONFLICT
                  : invited.status === INVITE_STATUS.INVALID_INPUT
                    ? STATUS.INVALID_INPUT
                    : STATUS.LOOKUP_ERROR,
            reason: invited.reason || "invite_failed",
            message: invited.message,
          };
        }

        const userId = String(invited.userId);
        if (userId === actorUserId) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, reason: "self_assignment" };
        }

        await client.query(
          `UPDATE blessboard.users
              SET phone_normalized = COALESCE(phone_normalized, $2),
                  phone_display = COALESCE(phone_display, $3),
                  phone_country_code = COALESCE(phone_country_code, $4),
                  preferred_login_identifier = COALESCE(preferred_login_identifier, 'phone'),
                  preferred_contact_channel = COALESCE(preferred_contact_channel, 'whatsapp'),
                  updated_at = now()
            WHERE id = $1`,
          [userId, phoneNorm, phoneDisp, phoneCc]
        );

        try {
          await upsertOrgStaffPhone(client, organizationId, phoneNorm, userId);
        } catch (err) {
          if (authRepo.isUniqueViolation(err)) {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.CONFLICT,
              reason: "phone_exists",
              message: "A user with this phone number already exists in this church.",
            };
          }
          throw err;
        }

        // RBAC catalogue role (in addition to legacy bootstrap invite role).
        const scopeType = placement === "branch" ? "branch" : "church";
        const scopeId = placement === "branch" ? branchId : churchId;
        const tenantContext = {
          resolved: true,
          organization: { id: organizationId },
          church: { id: churchId },
          primaryBranch: branchRow
            ? { id: branchRow.id }
            : null,
        };

        let rbacAssignment = null;
        if (roleKey !== "church_hq_admin" && roleKey !== "branch_admin") {
          // Map legacy-looking keys to RBAC keys when needed
          const rbacKey =
            roleKey === "branch_administrator" || roleKey === "church_system_administrator"
              ? roleKey
              : roleKey;
          const assigned = await createRoleAssignment(client, {
            actorUserId,
            userId,
            roleKey: rbacKey,
            organizationId,
            churchId: placement === "hq" ? churchId : churchId,
            scopeType,
            scopeId,
            assignmentOrigin: "manual",
            assignmentReason: assignmentReason || `Assigned via team invite (${placement})`,
            expiresAt,
            tenantContext,
            actorChurchId: churchId,
            forbidPlatformScope: true,
          });
          if (!assigned.ok && assigned.reason !== "duplicate") {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status:
                assigned.status === "forbidden"
                  ? STATUS.FORBIDDEN
                  : assigned.status === "invalid_input"
                    ? STATUS.INVALID_INPUT
                    : STATUS.LOOKUP_ERROR,
              reason: assigned.reason || "role_assignment_failed",
            };
          }
          rbacAssignment = assigned.assignment || null;
        }

        const auditKey =
          placement === "branch" ? "branch.user.invited" : "church.user.invited";
        await recordBlessBoardAudit(client, {
          churchId,
          organizationId,
          branchId: placement === "branch" ? branchId : null,
          actorUserId,
          actionKey: auditKey,
          entityType: "user",
          entityId: userId,
          outcome: "success",
          env: input.env,
          deploymentCode: depCode,
          metadata: {
            source: input.actorSource || "platform_admin",
            actor_type: input.actorSource || "platform_admin",
            entity_key: roleKey,
            reason_code: placement,
            branch_key: branchRow ? branchRow.branch_key : undefined,
            status: invited.invitation && invited.invitation.resent ? "resent" : "created",
          },
        });

        if (input.actorSource === "platform_admin") {
          await recordBlessBoardAudit(client, {
            churchId,
            organizationId,
            branchId: placement === "branch" ? branchId : null,
            actorUserId,
            actionKey: "platform.user.invited",
            entityType: "user",
            entityId: userId,
            outcome: "success",
            env: input.env,
            deploymentCode: depCode,
            metadata: {
              source: "platform_admin",
              actor_type: "platform_admin",
              entity_key: roleKey,
              reason_code: placement,
            },
          });
        }

        await client.query("COMMIT");

        const invitationUrl = String(input.invitationAcceptBase || "").replace(/\/$/, "");
        const fullUrl =
          invitationUrl && invited.rawToken
            ? `${invitationUrl}?token=${encodeURIComponent(invited.rawToken)}`
            : null;
        const roleLabel = roleMetaRow.display_name || roleKey;
        const shareMessage =
          fullUrl &&
          buildInviteShareMessage({
            firstName,
            churchName: orgRow.church_name || orgRow.display_name,
            roleLabel,
            invitationUrl: fullUrl,
            expiresAt: invited.invitation && invited.invitation.expiresAt,
          });

        return {
          ok: true,
          status: STATUS.OK,
          userId,
          existingUser: Boolean(invited.existingUser),
          existingMemberOffer: memberOnly
            ? {
                id: String(memberOnly.id),
                displayName: memberOnly.displayName || null,
                userId: memberOnly.userId || null,
              }
            : null,
          invitation: invited.invitation,
          rawToken: invited.rawToken || null,
          invitationUrl: fullUrl,
          whatsappUrl: shareMessage
            ? buildWhatsAppShareUrl({ phoneE164: phoneNorm, message: shareMessage })
            : null,
          shareMessage,
          placement,
          branch: branchRow
            ? {
                id: String(branchRow.id),
                key: branchRow.branch_key,
                displayName: branchRow.display_name,
              }
            : null,
          organization: {
            id: organizationId,
            key: orgRow.organization_key,
            displayName: orgRow.display_name,
          },
          church: {
            id: churchId,
            displayName: orgRow.church_name,
          },
          role: {
            key: roleKey,
            displayName: roleLabel,
            sensitive,
          },
          scopeType,
          scopeId,
          phoneNormalized: phoneNorm,
          phoneDisplay: phoneDisp,
          emailDisplay: emailDisplay || null,
          displayName,
          leadershipTitle: leadershipTitle || null,
          rbacAssignment,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        if (authRepo.isUniqueViolation(err)) {
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "phone_exists",
            message: "A user with this phone number already exists in this church.",
          };
        }
        return {
          ok: false,
          status: STATUS.LOOKUP_ERROR,
          reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
        };
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
    };
  }
}

module.exports = {
  STATUS,
  createScopedTeamMember,
  findOrgStaffByPhone,
  findMemberByPhone,
  buildWhatsAppShareUrl,
  buildInviteShareMessage,
  resolveDeploymentCodeForOrg,
};
