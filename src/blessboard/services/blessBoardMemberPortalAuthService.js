"use strict";

/**
 * BlessBoard V2.04 member portal activation + Church ID login (M13–M19).
 * Exact membership verification only — never fuzzy identity matching.
 * Enumeration-safe failures; portal BLOCKED cannot sign in.
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const memberRepo = require("../repositories/memberIdentityRepository");
const authRepo = require("../repositories/blessBoardAuthRepository");
const { createBlessBoardUser, BCRYPT_ROUNDS } = require("./createBlessBoardUser");
const { normalizePersonPhone } = require("../../platform/person/personNormalization");
const {
  establishBlessBoardSession,
} = require("./establishBlessBoardSession");
const {
  revokeSessionsByBlessBoardUser,
} = require("../../platform/session/revokeV5Session");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const {
  recordSharedPlatformAudit,
  SHARED_AUDIT_OUTCOME,
} = require("../../platform/audit");
const {
  PORTAL_ACCESS_STATUS,
} = require("./memberDomainConstants");
const {
  startVerification,
  checkVerification,
  STATUS: OTP_STATUS,
} = require("./otp/blessBoardOtpService");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  VERIFICATION_FAILED: "verification_failed",
  ALREADY_ACTIVATED: "already_activated",
  PORTAL_BLOCKED: "portal_blocked",
  INVALID_CREDENTIALS: "invalid_credentials",
  WEAK_PASSWORD: "weak_password",
  RATE_LIMITED: "rate_limited",
  INVALID_DRAFT: "invalid_draft",
  OTP_FAILED: "otp_failed",
  CONTACT_CHURCH: "contact_church",
  FAILED: "failed",
});

const NEUTRAL_VERIFY =
  "We could not verify your membership. Please contact your church administration.";
const NEUTRAL_LOGIN = "Church ID or password is incorrect.";
const NEUTRAL_RECOVERY =
  "If that membership can be reached, we sent a verification code to the contact on file.";
const LOST_CHURCH_ID =
  "BlessBoard cannot recover a lost Church ID automatically. Please contact your church administration.";

const DRAFT_PREFIX = "bbma1";
const DRAFT_TTL_MS = 20 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 8;

/** @type {Map<string, number[]>} */
const rateBuckets = new Map();

function pruneRate(key) {
  const now = Date.now();
  const list = (rateBuckets.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (!list.length) rateBuckets.delete(key);
  else rateBuckets.set(key, list);
  return list;
}

function consumeRate(bucket, key) {
  const id = `${bucket}:${String(key || "").slice(0, 128)}`;
  const list = pruneRate(id);
  if (list.length >= RATE_MAX) return false;
  list.push(Date.now());
  rateBuckets.set(id, list);
  return true;
}

function normalizeNameKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function memberFullNameKey(member) {
  return normalizeNameKey(
    [member && member.firstName, member && member.lastName].filter(Boolean).join(" ")
  );
}

function validateMemberPortalPassword(password, confirm) {
  const value = password != null ? String(password) : "";
  const conf = confirm != null ? String(confirm) : "";
  if (value.length < 8 || value.length > 200) {
    return { ok: false, code: RESULT.WEAK_PASSWORD, reason: "length" };
  }
  if (!/[A-Z]/.test(value)) {
    return { ok: false, code: RESULT.WEAK_PASSWORD, reason: "uppercase" };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(value)) {
    return { ok: false, code: RESULT.WEAK_PASSWORD, reason: "special" };
  }
  if (conf !== value) {
    return { ok: false, code: RESULT.WEAK_PASSWORD, reason: "confirm" };
  }
  return { ok: true, value };
}

function getPasswordRuleLabels() {
  return Object.freeze([
    { id: "min_length", label: "At least 8 characters" },
    { id: "uppercase", label: "At least 1 uppercase letter" },
    { id: "special", label: "At least 1 special character" },
  ]);
}

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function parseB64urlJson(raw) {
  try {
    return JSON.parse(Buffer.from(String(raw || ""), "base64url").toString("utf8"));
  } catch (_e) {
    return null;
  }
}

function signDraft(payload, secret) {
  const body = b64urlJson(payload);
  const mac = crypto
    .createHmac("sha256", String(secret || "bb-member-auth"))
    .update(`${DRAFT_PREFIX}.${body}`)
    .digest("base64url");
  return `${DRAFT_PREFIX}.${body}.${mac}`;
}

function verifyDraft(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== DRAFT_PREFIX) {
    return { ok: false, code: RESULT.INVALID_DRAFT };
  }
  const expected = crypto
    .createHmac("sha256", String(secret || "bb-member-auth"))
    .update(`${DRAFT_PREFIX}.${parts[1]}`)
    .digest("base64url");
  const left = Buffer.from(parts[2], "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false, code: RESULT.INVALID_DRAFT };
  }
  const payload = parseB64urlJson(parts[1]);
  if (!payload || !payload.exp || Number(payload.exp) < Date.now()) {
    return { ok: false, code: RESULT.INVALID_DRAFT };
  }
  return { ok: true, draft: payload };
}

function draftSecret(env) {
  return (
    (env && (env.CSRF_SECRET || env.SESSION_SECRET || env.PLATFORM_CSRF_SECRET)) ||
    process.env.CSRF_SECRET ||
    process.env.SESSION_SECRET ||
    "bb-member-auth-dev"
  );
}

async function auditAuth(db, payload) {
  try {
    await recordSharedPlatformAudit(db, {
      actionKey: payload.actionKey,
      outcome: payload.outcome || SHARED_AUDIT_OUTCOME.SUCCESS,
      productCode: "blessboard",
      organizationId: payload.organizationId,
      churchId: payload.churchId,
      branchId: payload.branchId || null,
      actorUserId: payload.actorUserId || null,
      entityType: "member",
      entityId: payload.memberId || null,
      metadata: payload.metadata || {},
    });
  } catch (_e) {
    /* never fail auth on audit */
  }
}

function syntheticMemberEmail(member) {
  const num = String(member.memberNumber || member.id || "x")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const church = String(member.churchId || "church")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
  return `m.${num}.${church}@members.blessboard.app`;
}

/**
 * M14 — exact Church ID + full name + phone verification (email optional).
 */
async function verifyFirstTimeMembership(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const memberNumber = String((input && input.memberNumber) || "").trim();
  const fullName = normalizeNameKey(input && input.fullName);
  const requestIp = String((input && input.requestIp) || "").trim();

  if (!churchId || !organizationId || !memberNumber || !fullName) {
    return { ok: false, code: RESULT.INVALID_INPUT, message: NEUTRAL_VERIFY };
  }
  if (!consumeRate("activate", `${churchId}:${requestIp || memberNumber}`)) {
    return { ok: false, code: RESULT.RATE_LIMITED, message: "Too many attempts. Try again later." };
  }

  const phone = normalizePersonPhone({
    phone: input.phone,
    phoneNormalized: input.phoneNormalized,
    phoneDisplay: input.phoneDisplay,
    defaultCountry: input.phoneCountry || "ZM",
  });
  if (!phone.ok || !phone.normalized) {
    return { ok: false, code: RESULT.VERIFICATION_FAILED, message: NEUTRAL_VERIFY };
  }

  const member = await memberRepo.findMemberByChurchAndNumber(db, {
    churchId,
    memberNumber,
  });

  // Constant-ish path: always do name/phone compares when row exists; never fuzzy.
  let matched = false;
  if (member && String(member.churchId) === churchId) {
    const nameOk = memberFullNameKey(member) === fullName;
    const phoneOk =
      member.phoneNormalized &&
      String(member.phoneNormalized) === String(phone.normalized);
    let emailOk = true;
    if (input.email != null && String(input.email).trim()) {
      const email = String(input.email).trim().toLowerCase();
      emailOk =
        Boolean(member.emailDisplay) &&
        String(member.emailDisplay).trim().toLowerCase() === email;
    }
    matched = Boolean(nameOk && phoneOk && emailOk);
  }

  if (!matched) {
    await auditAuth(db, {
      actionKey: "members.portal_activation_failed",
      outcome: SHARED_AUDIT_OUTCOME.FAILURE,
      organizationId,
      churchId,
      metadata: { reason: "verification_failed" },
    });
    return { ok: false, code: RESULT.VERIFICATION_FAILED, message: NEUTRAL_VERIFY };
  }

  if (String(member.portalAccessStatus || "") === PORTAL_ACCESS_STATUS.BLOCKED) {
    return {
      ok: false,
      code: RESULT.PORTAL_BLOCKED,
      message:
        "Portal access for this membership is blocked. Please contact your church administration.",
    };
  }

  if (member.userId && member.portalAccessStatus === PORTAL_ACCESS_STATUS.ACTIVE) {
    return {
      ok: false,
      code: RESULT.ALREADY_ACTIVATED,
      message: "This membership already has an activated portal login. Sign in with your Church ID and password.",
    };
  }

  const draft = {
    v: 1,
    exp: Date.now() + DRAFT_TTL_MS,
    purpose: "activation",
    organizationId,
    churchId,
    memberId: member.id,
    memberNumber: member.memberNumber,
    displayName: [member.firstName, member.lastName].filter(Boolean).join(" "),
    phoneNormalized: phone.normalized,
    email: input.email && String(input.email).trim() ? String(input.email).trim() : null,
  };

  await auditAuth(db, {
    actionKey: "members.portal_activation_verified",
    organizationId,
    churchId,
    memberId: member.id,
    metadata: { member_number: member.memberNumber },
  });

  return {
    ok: true,
    code: RESULT.OK,
    draftToken: signDraft(draft, draftSecret(input.env)),
    draft,
    memberHint: {
      firstName: member.firstName,
      memberNumber: member.memberNumber,
    },
  };
}

/**
 * M15 — create password and activate portal.
 */
async function completeFirstTimeActivation(db, input, deps) {
  const verified = verifyDraft(input && input.draftToken, draftSecret(input && input.env));
  if (!verified.ok || verified.draft.purpose !== "activation") {
    return { ok: false, code: RESULT.INVALID_DRAFT, message: "Session expired. Start activation again." };
  }
  const draft = verified.draft;
  if (String(draft.churchId) !== String(input.churchId)) {
    return { ok: false, code: RESULT.INVALID_DRAFT, message: "Session expired. Start activation again." };
  }
  if (!consumeRate("activate_complete", `${draft.churchId}:${draft.memberId}`)) {
    return { ok: false, code: RESULT.RATE_LIMITED, message: "Too many attempts. Try again later." };
  }

  const password = validateMemberPortalPassword(input.password, input.passwordConfirm);
  if (!password.ok) {
    return {
      ok: false,
      code: RESULT.WEAK_PASSWORD,
      message:
        password.reason === "confirm"
          ? "Password and confirmation do not match."
          : "Password must be at least 8 characters with 1 uppercase letter and 1 special character.",
      reason: password.reason,
    };
  }

  const member = await memberRepo.findMemberById(db, draft.memberId);
  if (!member || member.churchId !== draft.churchId) {
    return { ok: false, code: RESULT.VERIFICATION_FAILED, message: NEUTRAL_VERIFY };
  }
  if (String(member.portalAccessStatus || "") === PORTAL_ACCESS_STATUS.BLOCKED) {
    return { ok: false, code: RESULT.PORTAL_BLOCKED, message: "Portal access is blocked." };
  }

  const email =
    draft.email ||
    (member.emailDisplay && String(member.emailDisplay).trim()) ||
    syntheticMemberEmail(member);

  let userId = member.userId || null;
  if (!userId) {
    const createUser =
      (deps && typeof deps.createBlessBoardUser === "function"
        ? deps.createBlessBoardUser
        : null) || createBlessBoardUser;
    const created = await createUser(
      db,
      {
        email,
        displayName: draft.displayName || email,
        phoneNormalized: draft.phoneNormalized || member.phoneNormalized,
        phoneDisplay: member.phoneDisplay || draft.phoneNormalized,
        passwordHash: await bcrypt.hash(password.value, BCRYPT_ROUNDS),
        passwordForVerify: password.value,
      },
      deps
    );
    if (!created.ok && created.status !== "already_exists") {
      return { ok: false, code: RESULT.FAILED, detail: created };
    }
    userId = created.user && created.user.id;
    if (!userId && created.status === "already_exists") {
      const existing = await authRepo.findUserByEmail(
        db,
        String(email).trim().toLowerCase()
      );
      userId = existing && existing.id;
    }
    if (!userId) {
      return { ok: false, code: RESULT.FAILED, detail: "user_missing" };
    }
    await memberRepo.updateMemberUserId(db, { memberId: member.id, userId });
  } else {
    const hash = await bcrypt.hash(password.value, BCRYPT_ROUNDS);
    await authRepo.updateUserPasswordHash(db, userId, hash);
  }

  await memberRepo.updatePortalAccessStatus(db, {
    memberId: member.id,
    portalAccessStatus: PORTAL_ACCESS_STATUS.ACTIVE,
  });

  await auditAuth(db, {
    actionKey: "members.portal_activated",
    organizationId: draft.organizationId,
    churchId: draft.churchId,
    memberId: member.id,
    actorUserId: userId,
    metadata: { member_number: member.memberNumber },
  });

  return {
    ok: true,
    code: RESULT.OK,
    memberId: member.id,
    userId,
    memberNumber: member.memberNumber,
    portalAccessStatus: PORTAL_ACCESS_STATUS.ACTIVE,
  };
}

/**
 * M13 — returning login: Church ID + password.
 */
async function authenticateMemberByChurchId(db, input, deps) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const memberNumber = String((input && input.memberNumber) || "").trim();
  const password = input && input.password != null ? String(input.password) : "";
  const deploymentCode = String((input && input.deploymentCode) || "").trim().toLowerCase();
  const requestIp = String((input && input.requestIp) || "").trim();

  if (!churchId || !memberNumber || !password || !deploymentCode) {
    return { ok: false, code: RESULT.INVALID_INPUT, message: NEUTRAL_LOGIN };
  }
  if (!consumeRate("login", `${churchId}:${requestIp || memberNumber}`)) {
    return { ok: false, code: RESULT.RATE_LIMITED, message: "Too many attempts. Try again later." };
  }

  const member = await memberRepo.findMemberByChurchAndNumber(db, {
    churchId,
    memberNumber,
  });

  const burn = async () => {
    try {
      await bcrypt.compare(
        password,
        "$2a$12$C6UzMDM.H6dfI/f/IKxGhuR.Vo5.1qHqGhuR.Vo5.1qHqGhuR.Vo5."
      );
    } catch (_e) {
      /* ignore */
    }
  };

  if (!member || !member.userId) {
    await burn();
    await auditAuth(db, {
      actionKey: "members.portal_login_failed",
      outcome: SHARED_AUDIT_OUTCOME.FAILURE,
      organizationId,
      churchId,
      metadata: { reason: "not_found_or_inactive" },
    });
    return { ok: false, code: RESULT.INVALID_CREDENTIALS, message: NEUTRAL_LOGIN };
  }

  const user = await authRepo.findUserById(db, member.userId);
  if (!user || String(user.status) !== "active" || !user.password_hash) {
    await burn();
    return { ok: false, code: RESULT.INVALID_CREDENTIALS, message: NEUTRAL_LOGIN };
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    await auditAuth(db, {
      actionKey: "members.portal_login_failed",
      outcome: SHARED_AUDIT_OUTCOME.FAILURE,
      organizationId,
      churchId,
      memberId: member.id,
      metadata: { reason: "password_rejected" },
    });
    return { ok: false, code: RESULT.INVALID_CREDENTIALS, message: NEUTRAL_LOGIN };
  }

  if (String(member.portalAccessStatus || "") === PORTAL_ACCESS_STATUS.BLOCKED) {
    await auditAuth(db, {
      actionKey: "members.portal_login_blocked",
      outcome: SHARED_AUDIT_OUTCOME.FAILURE,
      organizationId,
      churchId,
      memberId: member.id,
      actorUserId: user.id,
      metadata: { portal_access_status: "blocked" },
    });
    return {
      ok: false,
      code: RESULT.PORTAL_BLOCKED,
      message:
        "Your portal access is blocked. Please contact your church administration.",
    };
  }

  if (String(member.portalAccessStatus || "") === PORTAL_ACCESS_STATUS.NOT_ACTIVATED) {
    return {
      ok: false,
      code: RESULT.INVALID_CREDENTIALS,
      message: NEUTRAL_LOGIN,
      hint: "activate",
    };
  }

  const establish =
    (deps && typeof deps.establishBlessBoardSession === "function"
      ? deps.establishBlessBoardSession
      : null) || establishBlessBoardSession;
  const established = await establish(db, {
    userId: user.id,
    deploymentCode,
    requireOrganizationId: organizationId || null,
    ip: input.ip || null,
    userAgent: input.userAgent || null,
    createSession: deps && deps.createSession,
  });
  if (!established || !established.ok) {
    return { ok: false, code: RESULT.FAILED, detail: established };
  }

  await auditAuth(db, {
    actionKey: "members.portal_login",
    organizationId,
    churchId,
    memberId: member.id,
    actorUserId: user.id,
    metadata: { member_number: member.memberNumber },
  });

  return {
    ok: true,
    code: RESULT.OK,
    ...established,
    memberId: member.id,
    memberNumber: member.memberNumber,
  };
}

/**
 * M17 — recovery start by Church ID (verified contact on file).
 */
async function beginMemberPasswordRecovery(db, input, env) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const memberNumber = String((input && input.memberNumber) || "").trim();
  const requestIp = String((input && input.requestIp) || "").trim();

  if (!churchId || !memberNumber) {
    return { ok: true, code: RESULT.OK, message: NEUTRAL_RECOVERY, sent: false };
  }
  if (!consumeRate("recovery", `${churchId}:${requestIp || memberNumber}`)) {
    return { ok: false, code: RESULT.RATE_LIMITED, message: "Too many attempts. Try again later." };
  }

  const member = await memberRepo.findMemberByChurchAndNumber(db, {
    churchId,
    memberNumber,
  });

  if (
    !member ||
    !member.userId ||
    !member.phoneNormalized ||
    String(member.portalAccessStatus || "") === PORTAL_ACCESS_STATUS.BLOCKED
  ) {
    await auditAuth(db, {
      actionKey: "members.portal_recovery_requested",
      outcome: SHARED_AUDIT_OUTCOME.FAILURE,
      organizationId,
      churchId,
      metadata: { sent: false },
    });
    return { ok: true, code: RESULT.OK, message: NEUTRAL_RECOVERY, sent: false };
  }

  const started = await startVerification(
    db,
    {
      phone: member.phoneNormalized,
      purpose: "password_recovery",
      userId: String(member.userId),
      requestIp,
      sessionFingerprint: input.sessionFingerprint,
      country: input.phoneCountry,
    },
    env
  );

  if (!started.ok) {
    if (started.status === OTP_STATUS.RATE_LIMITED) {
      return { ok: false, code: RESULT.RATE_LIMITED, message: "Too many attempts. Try again later." };
    }
    return { ok: true, code: RESULT.OK, message: NEUTRAL_RECOVERY, sent: false };
  }

  const draft = {
    v: 1,
    exp: Date.now() + DRAFT_TTL_MS,
    purpose: "recovery",
    organizationId,
    churchId,
    memberId: member.id,
    memberNumber: member.memberNumber,
    userId: member.userId,
    verificationId: started.challenge && started.challenge.id,
  };

  await auditAuth(db, {
    actionKey: "members.portal_recovery_requested",
    organizationId,
    churchId,
    memberId: member.id,
    metadata: { sent: true },
  });

  return {
    ok: true,
    code: RESULT.OK,
    message: NEUTRAL_RECOVERY,
    sent: true,
    draftToken: signDraft(draft, draftSecret(env)),
    challenge: started.challenge,
    testCode: started.testCode,
  };
}

/**
 * M18 — recovery OTP + new password.
 */
async function completeMemberPasswordRecovery(db, input, env, deps) {
  const verified = verifyDraft(input && input.draftToken, draftSecret(env));
  if (!verified.ok || verified.draft.purpose !== "recovery") {
    return { ok: false, code: RESULT.INVALID_DRAFT, message: "Recovery session expired." };
  }
  const draft = verified.draft;
  if (String(draft.churchId) !== String(input.churchId)) {
    return { ok: false, code: RESULT.INVALID_DRAFT, message: "Recovery session expired." };
  }

  const password = validateMemberPortalPassword(input.password, input.passwordConfirm);
  if (!password.ok) {
    return {
      ok: false,
      code: RESULT.WEAK_PASSWORD,
      message:
        password.reason === "confirm"
          ? "Password and confirmation do not match."
          : "Password must be at least 8 characters with 1 uppercase letter and 1 special character.",
    };
  }

  const checkOtp =
    (deps && typeof deps.checkVerification === "function"
      ? deps.checkVerification
      : null) || checkVerification;
  const checked = await checkOtp(
    db,
    {
      verificationId: input.verificationId || draft.verificationId,
      purpose: "password_recovery",
      code: input.code,
    },
    env
  );
  if (!checked.ok) {
    return {
      ok: false,
      code: RESULT.OTP_FAILED,
      message: "Verification failed. Check the code and try again.",
      detail: checked,
    };
  }

  const updateHash =
    (deps && typeof deps.updateUserPasswordHash === "function"
      ? deps.updateUserPasswordHash
      : null) || authRepo.updateUserPasswordHash.bind(authRepo);
  const hash = await bcrypt.hash(password.value, BCRYPT_ROUNDS);
  await updateHash(db, draft.userId, hash);

  const deployment = getPlatformDeploymentCode(env || process.env);
  let sessionsRevoked = 0;
  if (deployment.ok) {
    const revoke =
      (deps && typeof deps.revokeSessionsByBlessBoardUser === "function"
        ? deps.revokeSessionsByBlessBoardUser
        : null) || revokeSessionsByBlessBoardUser;
    const revoked = await revoke(db, {
      userId: draft.userId,
      deploymentCode: deployment.code,
    });
    sessionsRevoked = (revoked && revoked.revokedCount) || 0;
  }

  await auditAuth(db, {
    actionKey: "members.portal_password_reset",
    organizationId: draft.organizationId,
    churchId: draft.churchId,
    memberId: draft.memberId,
    actorUserId: draft.userId,
    metadata: { sessions_revoked: sessionsRevoked },
  });

  return {
    ok: true,
    code: RESULT.OK,
    sessionsRevoked,
    memberNumber: draft.memberNumber,
  };
}

function lostChurchIdGuidance() {
  return {
    ok: true,
    code: RESULT.CONTACT_CHURCH,
    message: LOST_CHURCH_ID,
    automatedRecovery: false,
  };
}

module.exports = {
  RESULT,
  NEUTRAL_VERIFY,
  NEUTRAL_LOGIN,
  NEUTRAL_RECOVERY,
  LOST_CHURCH_ID,
  validateMemberPortalPassword,
  getPasswordRuleLabels,
  verifyFirstTimeMembership,
  completeFirstTimeActivation,
  authenticateMemberByChurchId,
  beginMemberPasswordRecovery,
  completeMemberPasswordRecovery,
  lostChurchIdGuidance,
  signDraft,
  verifyDraft,
  _rateBuckets: rateBuckets,
};
