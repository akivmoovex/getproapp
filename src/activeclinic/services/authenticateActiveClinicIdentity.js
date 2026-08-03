"use strict";

/**
 * ActiveClinic authentication (AC-V6-08).
 * Platform identity credentials + eligibility + platform-identity sessions.
 */

const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  normalizeEmail,
} = require("../../platform/services/platformIdentityService");
const {
  normalizeRegistrationPhone,
} = require("../../blessboard/services/normalizeRegistrationPhone");
const {
  verifyPlatformIdentityPassword,
  burnCompare,
  RESULT: CRED_RESULT,
} = require("../../platform/services/platformIdentityCredentialService");
const {
  listEligibleActiveClinicOrganizations,
  resolveEligibleOrganization,
  RESULT: ELIG_RESULT,
} = require("./activeClinicLoginEligibility");
const {
  createPlatformIdentitySession,
} = require("../../platform/session/createDeploymentSession");
const {
  recordIdentitySignInSuccess,
} = require("../../platform/repositories/platformIdentityRepository");
const {
  createActiveClinicLoginTransferRequest,
  issueActiveClinicLoginRedeemCode,
  redeemActiveClinicLoginTransfer,
} = require("../../platform/services/platformIdentityAuthTransferService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const STATUS = Object.freeze({
  AUTHENTICATED: "authenticated",
  SELECT_ORGANIZATION: "select_organization",
  MUST_CHANGE_PASSWORD: "must_change_password",
  INVALID_CREDENTIALS: "invalid_credentials",
  ACCESS_UNAVAILABLE: "access_unavailable",
  INVALID_INPUT: "invalid_input",
  TRANSACTION_ERROR: "transaction_error",
});

const GENERIC_FAILURE = "invalid_credentials";
const GENERIC_ACCESS = "access_unavailable";

/**
 * Resolve platform identity by phone (preferred) or email. Ambiguous → deny.
 * @param {{ query: Function }} db
 * @param {{ identifier: string, country?: string|null }} input
 */
async function resolveIdentityForLogin(db, input) {
  const raw = String((input && input.identifier) || "").trim();
  if (!raw) {
    return { ok: false, code: "invalid_input", rows: [] };
  }

  const email = normalizeEmail(raw);
  if (email && EMAIL_RE.test(email)) {
    const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
      emailNormalized: email,
    });
    if (rows.length > 1) {
      return { ok: false, code: "ambiguous_contact", rows, kind: "email" };
    }
    if (rows.length === 1) {
      return { ok: true, code: "ok", identityRow: rows[0], kind: "email" };
    }
  }

  const phone = normalizeRegistrationPhone(raw, input && input.country);
  if (phone.ok) {
    const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
      phoneNormalized: phone.normalized,
    });
    if (rows.length > 1) {
      return { ok: false, code: "ambiguous_contact", rows, kind: "phone" };
    }
    if (rows.length === 1) {
      return { ok: true, code: "ok", identityRow: rows[0], kind: "phone" };
    }
  }

  return { ok: false, code: "not_found", rows: [] };
}

async function auditLogin(db, fields) {
  if (!fields.organizationId) return;
  await recordAuditEventSafe(db, {
    deploymentCode: fields.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: fields.organizationId,
    actorUserId: null,
    actionKey: fields.actionKey,
    entityType: "platform_identity",
    entityId: fields.identityId || null,
    outcome: fields.outcome || "success",
    metadata: {
      category: "auth",
      product_key: "activeclinic",
      status: fields.status || null,
      reason_code: fields.reasonCode || null,
      actor_type: "platform_identity",
      source: "activeclinic_login",
    },
  });
}

/**
 * Complete login for a single eligible organization.
 */
async function completeLoginSession(db, input) {
  const session = await createPlatformIdentitySession(db, {
    deploymentCode: input.deploymentCode,
    platformIdentityId: input.platformIdentityId,
    organizationId: input.organizationId,
    ip: input.ip || null,
    userAgent: input.userAgent || null,
  });
  if (!session.ok) {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, session: null };
  }
  await recordIdentitySignInSuccess(db, input.platformIdentityId);
  await auditLogin(db, {
    deploymentCode: input.deploymentCode,
    organizationId: input.organizationId,
    identityId: input.platformIdentityId,
    actionKey: "activeclinic.login.succeeded",
    outcome: "success",
    status: "authenticated",
  });
  return {
    ok: true,
    status: STATUS.AUTHENTICATED,
    rawToken: session.rawToken,
    session: session.session,
    eligibility: input.eligibility,
    mustChangePassword: Boolean(input.mustChangePassword),
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   identifier: string,
 *   password: string,
 *   deploymentCode: string,
 *   hostname: string,
 *   country?: string|null,
 *   ip?: string|null,
 *   userAgent?: string|null,
 * }} input
 */
async function authenticateActiveClinicIdentity(db, input) {
  const identifier = String((input && input.identifier) || "").trim();
  const password = input && input.password != null ? String(input.password) : "";
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const hostname = String((input && input.hostname) || "")
    .trim()
    .toLowerCase();

  if (!identifier || !password || !deploymentCode || !hostname) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "invalid_input",
    };
  }

  const resolved = await resolveIdentityForLogin(db, {
    identifier,
    country: input.country || "ZM",
  });

  if (!resolved.ok && resolved.code === "ambiguous_contact") {
    await burnCompare(password);
    return {
      ok: false,
      status: STATUS.INVALID_CREDENTIALS,
      message: GENERIC_FAILURE,
      failureCategory: "ambiguous_contact",
    };
  }

  if (!resolved.ok || !resolved.identityRow) {
    await burnCompare(password);
    return {
      ok: false,
      status: STATUS.INVALID_CREDENTIALS,
      message: GENERIC_FAILURE,
      failureCategory: "account_not_found",
    };
  }

  const verified = await verifyPlatformIdentityPassword(db, {
    identityId: resolved.identityRow.id,
    password,
    recordFailure: true,
  });

  if (!verified.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_CREDENTIALS,
      message: GENERIC_FAILURE,
      failureCategory: verified.failureCategory || verified.code,
    };
  }

  const eligible = await listEligibleActiveClinicOrganizations(db, {
    platformIdentityId: resolved.identityRow.id,
  });

  if (!eligible.ok || eligible.organizations.length === 0) {
    return {
      ok: false,
      status: STATUS.ACCESS_UNAVAILABLE,
      message: GENERIC_ACCESS,
      failureCategory: "no_eligible_organization",
    };
  }

  if (verified.mustChangePassword) {
    // Restricted session: still bind to first org for password-change gate.
    // Multi-org + must-change: create session for first eligible after password
    // change; for now force password change with a session on the single-org path
    // or selection after password change. Prefer: create session with first org
    // only when one org; when multiple, require org select first then password change.
  }

  if (eligible.organizations.length === 1) {
    const only = eligible.organizations[0];
    if (verified.mustChangePassword) {
      const completed = await completeLoginSession(db, {
        deploymentCode,
        platformIdentityId: resolved.identityRow.id,
        organizationId: only.organization.id,
        eligibility: only,
        mustChangePassword: true,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      if (!completed.ok) return completed;
      return {
        ...completed,
        status: STATUS.MUST_CHANGE_PASSWORD,
        mustChangePassword: true,
      };
    }
    return completeLoginSession(db, {
      deploymentCode,
      platformIdentityId: resolved.identityRow.id,
      organizationId: only.organization.id,
      eligibility: only,
      mustChangePassword: false,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  }

  // Multi-organization: pending auth transfer for selection (no full session yet).
  const pending = await createActiveClinicLoginTransferRequest(db, {
    deploymentCode,
    hostname,
    organizationId: eligible.organizations[0].organization.id,
  });
  if (!pending.ok) {
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: "transaction_error",
    };
  }
  const issued = await issueActiveClinicLoginRedeemCode(db, {
    rawRequestToken: pending.rawToken,
    deploymentCode,
    platformIdentityId: resolved.identityRow.id,
  });
  if (!issued.ok) {
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: "transaction_error",
    };
  }

  await recordIdentitySignInSuccess(db, resolved.identityRow.id);

  return {
    ok: true,
    status: STATUS.SELECT_ORGANIZATION,
    selectionToken: issued.rawToken,
    organizations: eligible.organizations.map((o) => ({
      organizationId: o.organization.id,
      organizationKey: o.organization.key,
      displayName: o.organization.displayName,
      healthcareOrganizationName:
        (o.healthcareOrganization && o.healthcareOrganization.publicName) ||
        (o.healthcareOrganization && o.healthcareOrganization.legalName) ||
        o.organization.displayName,
      staffDisplayName: o.staffMember.displayName,
    })),
    mustChangePassword: Boolean(verified.mustChangePassword),
    platformIdentityId: resolved.identityRow.id,
  };
}

/**
 * Redeem org selection transfer into a deployment session.
 */
async function completeActiveClinicOrganizationSelection(db, input) {
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const hostname = String((input && input.hostname) || "")
    .trim()
    .toLowerCase();
  const organizationId = String((input && input.organizationId) || "").trim();
  const rawToken = String((input && input.selectionToken) || "");

  if (!deploymentCode || !hostname || !organizationId || !rawToken) {
    return { ok: false, status: STATUS.INVALID_INPUT };
  }

  // Peek transfer principal before redeem to revalidate eligibility.
  const {
    hashSessionToken,
  } = require("../../platform/session/sessionToken");
  const transferRepo = require("../../platform/repositories/authTransferRepository");
  const tokenHash = hashSessionToken(rawToken);
  const existing = await transferRepo.findAuthTransferByHash(db, tokenHash);
  if (!existing || !existing.platform_identity_id) {
    return {
      ok: false,
      status: STATUS.INVALID_CREDENTIALS,
      message: GENERIC_FAILURE,
      failureCategory: "invalid_transfer",
    };
  }

  const resolved = await resolveEligibleOrganization(db, {
    platformIdentityId: existing.platform_identity_id,
    organizationId,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      status: STATUS.ACCESS_UNAVAILABLE,
      message: GENERIC_ACCESS,
      failureCategory: "organization_not_eligible",
    };
  }

  const redeemed = await redeemActiveClinicLoginTransfer(db, {
    rawToken,
    deploymentCode,
    hostname,
    organizationId,
    ip: input.ip || null,
    userAgent: input.userAgent || null,
  });
  if (!redeemed.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_CREDENTIALS,
      message: GENERIC_FAILURE,
      failureCategory: redeemed.status || "transfer_denied",
    };
  }

  await auditLogin(db, {
    deploymentCode,
    organizationId,
    identityId: existing.platform_identity_id,
    actionKey: "activeclinic.login.organization_selected",
    outcome: "success",
    status: "organization_selected",
  });

  return {
    ok: true,
    status: STATUS.AUTHENTICATED,
    rawSessionToken: redeemed.rawSessionToken,
    eligibility: resolved.eligibility,
    mustChangePassword: Boolean(input.mustChangePassword),
  };
}

module.exports = {
  STATUS,
  resolveIdentityForLogin,
  authenticateActiveClinicIdentity,
  completeActiveClinicOrganizationSelection,
  completeLoginSession,
};
