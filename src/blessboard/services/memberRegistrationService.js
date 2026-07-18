"use strict";

/**
 * BlessBoard V5 member identity + registration foundation services.
 * No public portal routes. No automatic account creation. No plaintext passwords.
 */

const { normalizeEmail } = require("./createBlessBoardUser");
const { normalizePhone } = require("./settingsValidation");
const authRepo = require("../repositories/blessBoardAuthRepository");
const repo = require("../repositories/memberIdentityRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  DUPLICATE_REGISTRATION: "duplicate_registration",
  DUPLICATE_MEMBER: "duplicate_member",
  USER_NOT_FOUND: "user_not_found",
  IDENTITY_CONFLICT: "identity_conflict",
  LOOKUP_ERROR: "lookup_error",
  TRANSACTION_ERROR: "transaction_error",
});

const HTML_RE = /[<>]/;
const NAME_MAX = 100;

const PRIVACY_ALLOWED_PROFILE_KEYS = Object.freeze([
  "firstName",
  "lastName",
  "preferredName",
  "email",
  "phone",
]);

const PRIVACY_FORBIDDEN_KEYS = Object.freeze([
  "nationalId",
  "national_id",
  "ssn",
  "passport",
  "dateOfBirth",
  "date_of_birth",
  "dob",
  "health",
  "medical",
  "disability",
  "income",
  "bankAccount",
  "bank_account",
  "family",
  "spouse",
  "children",
  "password",
  "passwordHash",
  "temporaryPassword",
]);

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {(client: object) => Promise<T>} fn
 * @template T
 */
async function withClient(db, fn) {
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {{ required?: boolean, max?: number }} [opts]
 */
function plainName(value, field, opts = {}) {
  const required = Boolean(opts.required);
  const max = opts.max != null ? opts.max : NAME_MAX;
  if (value == null || value === "") {
    return required ? { ok: false, reason: field } : { ok: true, value: null };
  }
  const s = String(value).trim();
  if (!s) return required ? { ok: false, reason: field } : { ok: true, value: null };
  if (HTML_RE.test(s)) return { ok: false, reason: `${field}_html` };
  if (s.length > max) return { ok: false, reason: `${field}_len` };
  return { ok: true, value: s };
}

/**
 * Reject sensitive / undeclared profile fields (privacy boundary).
 * @param {object} input
 */
function assertPrivacyProfile(input) {
  const raw = input && typeof input === "object" ? input : {};
  for (const key of Object.keys(raw)) {
    if (PRIVACY_FORBIDDEN_KEYS.includes(key)) {
      return { ok: false, reason: `privacy_forbidden:${key}` };
    }
  }
  return { ok: true };
}

/**
 * @param {object} input
 */
function parseProfileContact(input) {
  const privacy = assertPrivacyProfile(input);
  if (!privacy.ok) return privacy;

  const firstName = plainName(input.firstName, "first_name", { required: true });
  if (!firstName.ok) return firstName;
  const lastName = plainName(input.lastName, "last_name", { required: true });
  if (!lastName.ok) return lastName;
  const preferredName = plainName(input.preferredName, "preferred_name", { required: false });
  if (!preferredName.ok) return preferredName;

  const emailRaw = input.email != null ? String(input.email).trim() : "";
  let emailNormalized = null;
  let emailDisplay = null;
  if (emailRaw) {
    emailNormalized = normalizeEmail(emailRaw);
    if (
      !emailNormalized ||
      emailNormalized.length > 254 ||
      !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(emailNormalized)
    ) {
      return { ok: false, reason: "email" };
    }
    emailDisplay = emailRaw;
  }

  const phoneRaw = input.phone != null ? String(input.phone).trim() : "";
  let phoneNormalized = null;
  let phoneDisplay = null;
  if (phoneRaw) {
    const phone = normalizePhone(phoneRaw);
    if (!phone.ok || !phone.value) return { ok: false, reason: "phone" };
    phoneNormalized = phone.value;
    phoneDisplay = phoneRaw;
  }

  if (!emailNormalized && !phoneNormalized) {
    return { ok: false, reason: "contact_required" };
  }

  return {
    ok: true,
    value: {
      firstName: firstName.value,
      lastName: lastName.value,
      preferredName: preferredName.value,
      emailNormalized,
      emailDisplay,
      phoneNormalized,
      phoneDisplay,
    },
  };
}

/**
 * @param {Array<{ role_key?: string, roleKey?: string, church_id?: string, churchId?: string, branch_id?: string, branchId?: string, status?: string }>} roles
 * @param {{ churchId: string, branchId?: string|null }} scope
 */
function actorCanManageMembers(roles, scope) {
  const churchId = String(scope.churchId || "");
  const branchId = scope.branchId != null ? String(scope.branchId) : null;
  for (const role of roles || []) {
    if (role.status && String(role.status) !== "active") continue;
    const key = String(role.role_key || role.roleKey || "");
    const roleChurch = role.church_id || role.churchId || null;
    const roleBranch = role.branch_id || role.branchId || null;
    if (key === "platform_admin") return true;
    if (key === "church_hq_admin" && roleChurch && String(roleChurch) === churchId) return true;
    if (
      key === "branch_admin" &&
      roleChurch &&
      String(roleChurch) === churchId &&
      branchId &&
      roleBranch &&
      String(roleBranch) === branchId
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {{ query: Function }} client
 * @param {{ actorUserId: string, churchId: string, branchId?: string|null }} input
 */
async function requireMemberManager(client, input) {
  const actorUserId = String(input.actorUserId || "").trim();
  if (!actorUserId) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "actor_required" };
  }
  const user = await repo.findUserById(client, actorUserId);
  if (!user || user.status !== "active") {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "actor_inactive" };
  }
  const roles = await authRepo.listActiveRolesForUser(client, actorUserId);
  if (!actorCanManageMembers(roles, { churchId: input.churchId, branchId: input.branchId || null })) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "role" };
  }
  return { ok: true, user };
}

/**
 * Submit a registration application (no login account created).
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} input
 */
async function submitMemberRegistration(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const churchId = String(raw.churchId || "").trim();
  const branchId = String(raw.branchId || "").trim();
  if (!churchId || !branchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope", registration: null };
  }

  const profile = parseProfileContact(raw);
  if (!profile.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: profile.reason, registration: null };
  }

  try {
    return await withClient(db, async (client) => {
      const church = await repo.findChurchById(client, churchId);
      if (!church || church.status !== "active") {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "church", registration: null };
      }
      const branch = await repo.findBranchById(client, branchId);
      if (!branch || String(branch.church_id) !== churchId) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_ownership", registration: null };
      }
      if (branch.status !== "active") {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_inactive", registration: null };
      }

      const openEmail = await repo.findOpenRegistrationByEmail(
        client,
        churchId,
        profile.value.emailNormalized
      );
      if (openEmail) {
        return {
          ok: false,
          status: STATUS.DUPLICATE_REGISTRATION,
          reason: "duplicate_email_registration",
          registration: null,
        };
      }
      const openPhone = await repo.findOpenRegistrationByPhone(
        client,
        churchId,
        profile.value.phoneNormalized
      );
      if (openPhone) {
        return {
          ok: false,
          status: STATUS.DUPLICATE_REGISTRATION,
          reason: "duplicate_phone_registration",
          registration: null,
        };
      }

      const existingEmail = await repo.findLiveMemberByEmail(
        client,
        churchId,
        profile.value.emailNormalized
      );
      const existingPhone = await repo.findLiveMemberByPhone(
        client,
        churchId,
        profile.value.phoneNormalized
      );
      if (
        existingEmail &&
        existingPhone &&
        existingEmail.id !== existingPhone.id
      ) {
        return {
          ok: false,
          status: STATUS.IDENTITY_CONFLICT,
          reason: "email_phone_member_mismatch",
          registration: null,
        };
      }

      const registration = await repo.insertRegistration(client, {
        churchId,
        branchId,
        ...profile.value,
      });
      return {
        ok: true,
        status: STATUS.OK,
        registration,
        existingMemberId: (existingEmail || existingPhone || null)
          ? (existingEmail || existingPhone).id
          : null,
      };
    });
  } catch (err) {
    const msg = String((err && err.message) || err || "");
    if (/unique|duplicate/i.test(msg)) {
      return {
        ok: false,
        status: STATUS.DUPLICATE_REGISTRATION,
        reason: "duplicate_constraint",
        registration: null,
      };
    }
    if (/belong|ownership/i.test(msg)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_ownership", registration: null };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup", registration: null };
  }
}

/**
 * Mark registration under review (manager role required).
 */
async function reviewMemberRegistration(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const registrationId = String(raw.registrationId || "").trim();
  const actorUserId = String(raw.actorUserId || "").trim();
  if (!registrationId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids", registration: null };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const registration = await repo.findRegistrationById(client, registrationId);
        if (!registration) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", registration: null };
        }
        const gate = await requireMemberManager(client, {
          actorUserId,
          churchId: registration.churchId,
          branchId: registration.branchId,
        });
        if (!gate.ok) {
          await client.query("ROLLBACK");
          return { ok: false, status: gate.status, reason: gate.reason, registration: null };
        }
        if (registration.status !== "submitted" && registration.status !== "under_review") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: `status_${registration.status}`,
            registration,
          };
        }
        const updated = await repo.updateRegistrationStatus(client, {
          id: registrationId,
          status: "under_review",
          reviewedByUserId: actorUserId,
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, registration: updated };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, reason: "transaction", registration: null };
  }
}

/**
 * Approve registration: create or link member + primary/active membership transactionally.
 * Never creates a login user or password.
 */
async function approveMemberRegistration(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const registrationId = String(raw.registrationId || "").trim();
  const actorUserId = String(raw.actorUserId || "").trim();
  const reviewNotes =
    raw.reviewNotes != null && String(raw.reviewNotes).trim()
      ? String(raw.reviewNotes).trim().slice(0, 2000)
      : null;
  if (!registrationId || !actorUserId) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: "ids",
      registration: null,
      member: null,
      membership: null,
    };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const registration = await repo.findRegistrationById(client, registrationId);
        if (!registration) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_FOUND,
            reason: "not_found",
            registration: null,
            member: null,
            membership: null,
          };
        }
        const gate = await requireMemberManager(client, {
          actorUserId,
          churchId: registration.churchId,
          branchId: registration.branchId,
        });
        if (!gate.ok) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: gate.status,
            reason: gate.reason,
            registration: null,
            member: null,
            membership: null,
          };
        }
        if (registration.status !== "submitted" && registration.status !== "under_review") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: `status_${registration.status}`,
            registration,
            member: null,
            membership: null,
          };
        }

        let member =
          (await repo.findLiveMemberByEmail(
            client,
            registration.churchId,
            registration.emailNormalized
          )) ||
          (await repo.findLiveMemberByPhone(
            client,
            registration.churchId,
            registration.phoneNormalized
          ));

        let linkedExisting = false;
        if (member) {
          linkedExisting = true;
          // Contact collision across two different members is a hard conflict.
          const byEmail = registration.emailNormalized
            ? await repo.findLiveMemberByEmail(
                client,
                registration.churchId,
                registration.emailNormalized
              )
            : null;
          const byPhone = registration.phoneNormalized
            ? await repo.findLiveMemberByPhone(
                client,
                registration.churchId,
                registration.phoneNormalized
              )
            : null;
          if (byEmail && byPhone && byEmail.id !== byPhone.id) {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.IDENTITY_CONFLICT,
              reason: "email_phone_member_mismatch",
              registration,
              member: null,
              membership: null,
            };
          }
          if (member.status === "pending") {
            member = await repo.updateMemberStatus(client, {
              memberId: member.id,
              status: "active",
            });
          }
        } else {
          member = await repo.insertMember(client, {
            churchId: registration.churchId,
            firstName: registration.firstName,
            lastName: registration.lastName,
            preferredName: registration.preferredName,
            emailNormalized: registration.emailNormalized,
            emailDisplay: registration.emailDisplay,
            phoneNormalized: registration.phoneNormalized,
            phoneDisplay: registration.phoneDisplay,
            status: "active",
          });
        }

        let membership = await repo.findMembership(client, member.id, registration.branchId);
        if (!membership) {
          const primaryCount = await repo.countPrimaryMemberships(client, member.id);
          membership = await repo.insertMembership(client, {
            memberId: member.id,
            branchId: registration.branchId,
            membershipStatus: "active",
            isPrimary: primaryCount === 0,
            joinedAt: new Date().toISOString(),
          });
        } else if (membership.membershipStatus !== "active") {
          const { rows } = await client.query(
            `UPDATE blessboard.member_branch_memberships
                SET membership_status = 'active',
                    joined_at = COALESCE(joined_at, now()),
                    updated_at = now()
              WHERE id = $1
              RETURNING id, member_id, branch_id, membership_status, is_primary,
                        joined_at, created_at, updated_at`,
            [membership.id]
          );
          membership = repo.mapMembership(rows[0]);
        }

        const updated = await repo.updateRegistrationStatus(client, {
          id: registrationId,
          status: "approved",
          memberId: member.id,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date().toISOString(),
          reviewNotes,
        });

        await client.query("COMMIT");
        try {
          const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
          await recordBlessBoardAudit(db, {
            churchId: registration.churchId,
            branchId: registration.branchId,
            actorUserId: input.actorUserId,
            actionKey: "registration.approve",
            entityType: "member_registration",
            entityId: registration.id,
            outcome: "success",
            metadata: { status: "approved" },
          });
        } catch {
          /* ignore audit failures */
        }
        return {
          ok: true,
          status: STATUS.OK,
          registration: updated,
          member,
          membership,
          linkedExistingMember: linkedExisting,
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    const msg = String((err && err.message) || err || "");
    if (/unique|duplicate/i.test(msg)) {
      return {
        ok: false,
        status: STATUS.CONFLICT,
        reason: "duplicate_constraint",
        registration: null,
        member: null,
        membership: null,
      };
    }
    if (/belong|ownership/i.test(msg)) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        reason: "branch_ownership",
        registration: null,
        member: null,
        membership: null,
      };
    }
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      reason: "transaction",
      registration: null,
      member: null,
      membership: null,
    };
  }
}

/**
 * Reject registration (manager role required). Does not create a member.
 */
async function rejectMemberRegistration(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const registrationId = String(raw.registrationId || "").trim();
  const actorUserId = String(raw.actorUserId || "").trim();
  const reviewNotes =
    raw.reviewNotes != null && String(raw.reviewNotes).trim()
      ? String(raw.reviewNotes).trim().slice(0, 2000)
      : null;
  if (!registrationId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids", registration: null };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const registration = await repo.findRegistrationById(client, registrationId);
        if (!registration) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", registration: null };
        }
        const gate = await requireMemberManager(client, {
          actorUserId,
          churchId: registration.churchId,
          branchId: registration.branchId,
        });
        if (!gate.ok) {
          await client.query("ROLLBACK");
          return { ok: false, status: gate.status, reason: gate.reason, registration: null };
        }
        if (registration.status !== "submitted" && registration.status !== "under_review") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: `status_${registration.status}`,
            registration,
          };
        }
        const updated = await repo.updateRegistrationStatus(client, {
          id: registrationId,
          status: "rejected",
          reviewedByUserId: actorUserId,
          reviewedAt: new Date().toISOString(),
          reviewNotes,
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, registration: updated };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, reason: "transaction", registration: null };
  }
}

/**
 * Link an existing login user to a member by matching email.
 * Never creates users or passwords.
 */
async function linkMemberToUser(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const memberId = String(raw.memberId || "").trim();
  const actorUserId = String(raw.actorUserId || "").trim();
  const userId = raw.userId != null ? String(raw.userId).trim() : "";
  const email = raw.email != null ? normalizeEmail(raw.email) : "";

  if (!memberId || !actorUserId || (!userId && !email)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids", member: null };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const member = await repo.findMemberById(client, memberId);
        if (!member) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "member", member: null };
        }
        const gate = await requireMemberManager(client, {
          actorUserId,
          churchId: member.churchId,
          branchId: null,
        });
        // HQ / platform only when branchId null — branch_admin needs a branch.
        // Allow branch_admin if they have any active branch role in this church:
        if (!gate.ok) {
          const roles = await authRepo.listActiveRolesForUser(client, actorUserId);
          const churchScoped = roles.some((r) => {
            const key = String(r.role_key || "");
            return (
              (key === "branch_admin" || key === "church_hq_admin" || key === "platform_admin") &&
              (key === "platform_admin" || String(r.church_id) === String(member.churchId))
            );
          });
          if (!churchScoped) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.FORBIDDEN, reason: "role", member: null };
          }
        }

        if (!member.emailNormalized) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.INVALID_INPUT, reason: "member_email_required", member };
        }

        let user = null;
        if (userId) {
          user = await repo.findUserById(client, userId);
        } else {
          user = await authRepo.findUserByEmail(client, email);
        }
        if (!user || user.status !== "active") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.USER_NOT_FOUND, reason: "user_not_found", member };
        }

        if (String(user.email_normalized) !== String(member.emailNormalized)) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.IDENTITY_CONFLICT,
            reason: "email_mismatch",
            member,
          };
        }

        if (member.userId && String(member.userId) !== String(user.id)) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.IDENTITY_CONFLICT,
            reason: "already_linked",
            member,
          };
        }

        if (member.userId && String(member.userId) === String(user.id)) {
          await client.query("COMMIT");
          return { ok: true, status: STATUS.OK, member, alreadyLinked: true };
        }

        const updated = await repo.updateMemberUserId(client, {
          memberId: member.id,
          userId: user.id,
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, member: updated, alreadyLinked: false };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, reason: "transaction", member: null };
  }
}

/**
 * List registrations for managers (paginated, bounded search).
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} input
 */
async function listMemberRegistrations(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const churchId = String(raw.churchId || "").trim();
  const actorUserId = String(raw.actorUserId || "").trim();
  const branchId =
    raw.branchId != null && String(raw.branchId).trim() ? String(raw.branchId).trim() : null;
  if (!churchId || !actorUserId) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: "scope",
      items: [],
      total: 0,
      limit: 0,
      offset: 0,
    };
  }

  try {
    return await withClient(db, async (client) => {
      const gate = await requireMemberManager(client, {
        actorUserId,
        churchId,
        branchId,
      });
      if (!gate.ok) {
        return {
          ok: false,
          status: gate.status,
          reason: gate.reason,
          items: [],
          total: 0,
          limit: 0,
          offset: 0,
        };
      }
      const listed = await repo.listRegistrations(client, {
        churchId,
        branchId,
        status: raw.status,
        q: raw.q,
        limit: raw.limit,
        offset: raw.offset,
      });
      return { ok: true, status: STATUS.OK, ...listed };
    });
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: "lookup",
      items: [],
      total: 0,
      limit: 0,
      offset: 0,
    };
  }
}

/**
 * Load one registration for review. Branch admins cannot cross branches; HQ/platform may within church.
 */
async function getMemberRegistrationForManager(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const registrationId = String(raw.registrationId || raw.registrationKey || "").trim();
  const actorUserId = String(raw.actorUserId || "").trim();
  const churchId = String(raw.churchId || "").trim();
  if (!registrationId || !actorUserId || !churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids", registration: null };
  }

  try {
    return await withClient(db, async (client) => {
      const registration = await repo.findRegistrationByIdReadonly(client, registrationId);
      if (!registration || String(registration.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", registration: null };
      }
      const gate = await requireMemberManager(client, {
        actorUserId,
        churchId: registration.churchId,
        branchId: registration.branchId,
      });
      if (!gate.ok) {
        return { ok: false, status: gate.status, reason: gate.reason, registration: null };
      }
      return { ok: true, status: STATUS.OK, registration };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup", registration: null };
  }
}

/**
 * List branch members for managers (paginated, bounded search). Privacy-limited fields only.
 */
async function listBranchMembersForManager(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const churchId = String(raw.churchId || "").trim();
  const branchId = String(raw.branchId || "").trim();
  const actorUserId = String(raw.actorUserId || "").trim();
  if (!churchId || !branchId || !actorUserId) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: "scope",
      items: [],
      total: 0,
      limit: 0,
      offset: 0,
    };
  }

  try {
    return await withClient(db, async (client) => {
      const gate = await requireMemberManager(client, {
        actorUserId,
        churchId,
        branchId,
      });
      if (!gate.ok) {
        return {
          ok: false,
          status: gate.status,
          reason: gate.reason,
          items: [],
          total: 0,
          limit: 0,
          offset: 0,
        };
      }
      const listed = await repo.listMembersForBranch(client, {
        churchId,
        branchId,
        status: raw.status,
        membershipStatus: raw.membershipStatus,
        q: raw.q,
        limit: raw.limit,
        offset: raw.offset,
      });
      const items = listed.items.map((item) => ({
        id: item.id,
        firstName: item.firstName,
        lastName: item.lastName,
        preferredName: item.preferredName,
        emailDisplay: item.emailDisplay,
        phoneDisplay: item.phoneDisplay,
        status: item.status,
        membershipStatus: item.membershipStatus,
        isPrimary: item.isPrimary,
        joinedAt: item.joinedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
      return {
        ok: true,
        status: STATUS.OK,
        items,
        total: listed.total,
        limit: listed.limit,
        offset: listed.offset,
      };
    });
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: "lookup",
      items: [],
      total: 0,
      limit: 0,
      offset: 0,
    };
  }
}

/**
 * Load one member on the host branch for managers.
 */
async function getBranchMemberForManager(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const memberId = String(raw.memberId || "").trim();
  const churchId = String(raw.churchId || "").trim();
  const branchId = String(raw.branchId || "").trim();
  const actorUserId = String(raw.actorUserId || "").trim();
  if (!memberId || !churchId || !branchId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope", member: null };
  }

  try {
    return await withClient(db, async (client) => {
      const gate = await requireMemberManager(client, {
        actorUserId,
        churchId,
        branchId,
      });
      if (!gate.ok) {
        return { ok: false, status: gate.status, reason: gate.reason, member: null };
      }
      const member = await repo.findMemberOnBranch(client, { memberId, churchId, branchId });
      if (!member) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", member: null };
      }
      return {
        ok: true,
        status: STATUS.OK,
        member: {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          preferredName: member.preferredName,
          emailDisplay: member.emailDisplay,
          phoneDisplay: member.phoneDisplay,
          status: member.status,
          membershipStatus: member.membershipStatus,
          isPrimary: member.isPrimary,
          joinedAt: member.joinedAt,
          createdAt: member.createdAt,
          updatedAt: member.updatedAt,
          hasLoginLinked: Boolean(member.userId),
        },
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup", member: null };
  }
}

module.exports = {
  STATUS,
  PRIVACY_ALLOWED_PROFILE_KEYS,
  PRIVACY_FORBIDDEN_KEYS,
  actorCanManageMembers,
  submitMemberRegistration,
  reviewMemberRegistration,
  approveMemberRegistration,
  rejectMemberRegistration,
  linkMemberToUser,
  listMemberRegistrations,
  getMemberRegistrationForManager,
  listBranchMembersForManager,
  getBranchMemberForManager,
};
