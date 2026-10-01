"use strict";

/**
 * V2.04 BB staff Add Member multi-step flow (M02→M03→M04→M05).
 * Business rules stay out of EJS. Never auto-merges. Church-scoped only.
 */

const crypto = require("crypto");
const {
  parseAddMemberFormBody,
  buildAddMemberFormModel,
  submitStaffAddMember,
  FORM_CODE,
} = require("./blessBoardStaffAddMemberFormService");
const {
  createBlessBoardStaffMemberAdapter,
} = require("./blessBoardStaffMemberWorkflowAdapter");
const {
  evaluatePersonDuplicates,
  PERSON_MATCH_ACTION,
  PERSON_MATCH_CODE,
} = require("../../platform/person/duplicate");
const {
  normalizePersonDemographics,
} = require("../../platform/person/personNormalization");
const memberRepo = require("../repositories/memberIdentityRepository");
const { getCsrfSecret } = require("../../platform/http/v5Csrf");

const FLOW_CODE = Object.freeze({
  OK: "ok",
  VALIDATION: "validation_failed",
  UNAUTHORIZED: "unauthorized",
  MATCH_REQUIRED: "match_required",
  MATCH_BLOCKED: "match_blocked",
  REVIEW_READY: "review_ready",
  CREATED: "created",
  IDEMPOTENT_REPLAY: "idempotent_replay",
  INVALID_DRAFT: "invalid_draft",
  FAILED: "failed",
});

const DRAFT_PREFIX = "bbam1";
const DRAFT_TTL_MS = 30 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;

/** @type {Map<string, { memberId: string, productIdentifier: string|null, expiresAt: number }>} */
const consumedCreateTokens = new Map();

function pruneConsumed() {
  const now = Date.now();
  for (const [key, value] of consumedCreateTokens.entries()) {
    if (!value || value.expiresAt <= now) consumedCreateTokens.delete(key);
  }
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

function signDraft(payload, env) {
  const secret = getCsrfSecret(env || process.env);
  const body = b64urlJson(payload);
  const mac = crypto
    .createHmac("sha256", secret)
    .update(`${DRAFT_PREFIX}.${body}`)
    .digest("base64url");
  return `${DRAFT_PREFIX}.${body}.${mac}`;
}

function verifyDraft(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== DRAFT_PREFIX) {
    return { ok: false, code: FLOW_CODE.INVALID_DRAFT };
  }
  const secret = getCsrfSecret(env || process.env);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${DRAFT_PREFIX}.${parts[1]}`)
    .digest("base64url");
  const left = Buffer.from(parts[2], "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false, code: FLOW_CODE.INVALID_DRAFT };
  }
  const payload = parseB64urlJson(parts[1]);
  if (!payload || typeof payload !== "object") {
    return { ok: false, code: FLOW_CODE.INVALID_DRAFT };
  }
  if (!payload.exp || Number(payload.exp) < Date.now()) {
    return { ok: false, code: FLOW_CODE.INVALID_DRAFT, reason: "expired" };
  }
  return { ok: true, draft: payload };
}

function buildDraftPayload(input) {
  const createToken = crypto.randomBytes(16).toString("hex");
  return {
    v: 1,
    exp: Date.now() + DRAFT_TTL_MS,
    createToken,
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: input.branchId,
    values: input.values,
    demographics: input.demographics,
    profile: input.profile,
    membershipStatus: input.membershipStatus,
    presentationOnly: input.presentationOnly || {},
    churchIdPreview: input.churchIdPreview || null,
    duplicateOverride: input.duplicateOverride === true,
    duplicateOverrideReason: input.duplicateOverrideReason || null,
    matchAction: input.matchAction || null,
    overallMatchCode: input.overallMatchCode || PERSON_MATCH_CODE.NO_MATCH,
    matchDecisionAction: input.matchDecisionAction || PERSON_MATCH_ACTION.ALLOW,
  };
}

/**
 * Enrich matches with church-scoped member cards. Drops foreign-church refs.
 */
async function presentMatchCards(db, { churchId, matches }) {
  const list = Array.isArray(matches) ? matches : [];
  const cards = [];
  for (const match of list) {
    const subjectRef = String(
      (match && (match.subjectRef || match.id || match.memberId)) || ""
    ).trim();
    if (!subjectRef) continue;
    const member = await memberRepo.findMemberById(db, subjectRef);
    if (!member || String(member.churchId) !== String(churchId)) {
      // Cross-tenant / cross-church isolation: never leak.
      continue;
    }
    cards.push({
      subjectRef: member.id,
      memberId: member.id,
      matchCode: match.matchCode || null,
      action: match.action || null,
      reasons: Array.isArray(match.reasons) ? match.reasons.slice() : [],
      memberNumber: member.memberNumber || null,
      firstName: member.firstName || null,
      lastName: member.lastName || null,
      preferredName: member.preferredName || null,
      phoneDisplay: member.phoneDisplay || null,
      emailDisplay: member.emailDisplay || null,
      membershipStatus: member.status || null,
      portalAccessStatus: member.portalAccessStatus || "not_activated",
      nameHint:
        [member.firstName, member.lastName].filter(Boolean).join(" ").trim() ||
        match.nameHint ||
        null,
    });
  }
  return cards;
}

/**
 * Dry-run duplicate evaluation (no create, no merge).
 */
async function evaluateAddMemberDuplicates(db, input, deps) {
  const adapter =
    (deps && deps.adapter) ||
    createBlessBoardStaffMemberAdapter({
      authorize: async () => ({ allowed: true }),
    });

  const productNorm = adapter.normalizeProductFields({
    trusted: {
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
    },
    product: {
      churchId: input.churchId,
      branchId: input.branchId,
      memberNumber: input.memberNumber || null,
      membershipStatus: input.membershipStatus || "active",
      portalAccessStatus: "not_activated",
      ...flattenProfile(input.profile),
    },
  });
  if (!productNorm.ok) {
    return { ok: false, code: FLOW_CODE.VALIDATION, detail: productNorm };
  }

  const demo = normalizePersonDemographics(input.demographics || {});
  if (!demo.ok) {
    return { ok: false, code: FLOW_CODE.VALIDATION, detail: demo };
  }
  const probe = {
    firstName: demo.firstName,
    lastName: demo.lastName,
    preferredName: demo.preferredName,
    nameNormalized: demo.nameNormalized,
    dateOfBirth: demo.dateOfBirth,
    emailNormalized: demo.emailNormalized,
    emailDisplay: demo.emailDisplay,
    phoneNormalized: demo.phoneNormalized,
    phoneDisplay: demo.phoneDisplay,
  };

  const loaded = await adapter.loadDuplicateCandidates(db, {
    trusted: {
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
    },
    probe,
    product: productNorm.product,
  });
  if (!loaded || !loaded.ok) {
    return { ok: false, code: FLOW_CODE.FAILED, detail: loaded };
  }

  const evaluate =
    (deps && typeof deps.evaluatePersonDuplicates === "function"
      ? deps.evaluatePersonDuplicates
      : null) || evaluatePersonDuplicates;

  const match = evaluate({
    trusted: { organizationId: input.organizationId },
    productCode: "blessboard",
    probe,
    candidates: loaded.candidates || [],
    policy: adapter.duplicatePolicy,
    presentMatch: adapter.presentMatch,
  });
  if (!match || !match.ok) {
    return { ok: false, code: FLOW_CODE.FAILED, detail: match };
  }

  const cards = await presentMatchCards(db, {
    churchId: input.churchId,
    matches: match.matches || [],
  });

  const hardBlock =
    match.action === PERSON_MATCH_ACTION.BLOCK ||
    match.overallMatchCode === PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH;

  return {
    ok: true,
    overallMatchCode: match.overallMatchCode,
    action: match.action,
    blocking: Boolean(match.blocking) || hardBlock,
    hardBlock,
    overrideAllowed: match.overrideAllowed !== false && !hardBlock,
    matches: cards,
    rawMatches: match.matches || [],
  };
}

function flattenProfile(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  return {
    dateOfBirth: p.dateOfBirth || null,
    occupation: p.occupation || null,
    maritalStatus: p.maritalStatus || null,
    numberOfChildren: p.numberOfChildren,
    addressLine1: p.address && p.address.line1,
    addressLine2: p.address && p.address.line2,
    addressCity: p.address && p.address.city,
    addressDistrict: p.address && p.address.district,
    addressProvince: p.address && p.address.province,
    addressCountryCode: p.address && p.address.countryCode,
    addressPostalCode: p.address && p.address.postalCode,
    nextOfKinName: p.nextOfKin && p.nextOfKin.name,
    nextOfKinRelationship: p.nextOfKin && p.nextOfKin.relationship,
    nextOfKinPhoneDisplay: p.nextOfKin && p.nextOfKin.phoneDisplay,
    nextOfKinPhoneNormalized: p.nextOfKin && p.nextOfKin.phoneNormalized,
  };
}

/**
 * M02 continue → normalize + duplicate check → M03 or M04.
 */
async function beginStaffAddMemberFlow(db, input, deps) {
  const parsed =
    input && input.parsed
      ? input.parsed
      : parseAddMemberFormBody(input && input.body);
  if (!parsed.ok) {
    return {
      ok: false,
      code: FLOW_CODE.VALIDATION,
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
      step: "form",
    };
  }

  const preview = await memberRepo.allocateNextChurchId(db, {
    churchId: input.churchId,
  });
  const churchIdPreview =
    preview && preview.ok ? preview.memberNumber : "Assigned on save";

  const dup = await evaluateAddMemberDuplicates(
    db,
    {
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: parsed.branchId,
      membershipStatus: parsed.membershipStatus,
      demographics: parsed.demographics,
      profile: parsed.profile,
      memberNumber: null,
    },
    deps
  );
  if (!dup.ok) {
    return {
      ok: false,
      code: FLOW_CODE.FAILED,
      values: parsed.values,
      step: "form",
      detail: dup,
    };
  }

  const baseDraft = buildDraftPayload({
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: parsed.branchId,
    values: parsed.values,
    demographics: parsed.demographics,
    profile: parsed.profile,
    membershipStatus: parsed.membershipStatus,
    presentationOnly: parsed.presentationOnly,
    churchIdPreview,
    overallMatchCode: dup.overallMatchCode,
    matchDecisionAction: dup.action,
  });

  if (dup.hardBlock) {
    return {
      ok: false,
      code: FLOW_CODE.MATCH_BLOCKED,
      step: "match",
      draftToken: signDraft(baseDraft, input.env),
      draft: baseDraft,
      matches: dup.matches,
      overallMatchCode: dup.overallMatchCode,
      action: dup.action,
      values: parsed.values,
      churchIdPreview,
    };
  }

  if (dup.matches && dup.matches.length > 0) {
    return {
      ok: true,
      code: FLOW_CODE.MATCH_REQUIRED,
      step: "match",
      draftToken: signDraft(baseDraft, input.env),
      draft: baseDraft,
      matches: dup.matches,
      overallMatchCode: dup.overallMatchCode,
      action: dup.action,
      values: parsed.values,
      churchIdPreview,
    };
  }

  return {
    ok: true,
    code: FLOW_CODE.REVIEW_READY,
    step: "review",
    draftToken: signDraft(baseDraft, input.env),
    draft: baseDraft,
    matches: [],
    overallMatchCode: PERSON_MATCH_CODE.NO_MATCH,
    action: PERSON_MATCH_ACTION.ALLOW,
    values: parsed.values,
    churchIdPreview,
  };
}

/**
 * M03 actions: back | open_existing | different_person
 */
async function handleMatchStep(db, input, deps) {
  const verified = verifyDraft(input.draftToken, input.env);
  if (!verified.ok) return verified;
  const draft = verified.draft;

  if (
    String(draft.actorUserId) !== String(input.actorUserId) ||
    String(draft.churchId) !== String(input.churchId) ||
    String(draft.organizationId) !== String(input.organizationId)
  ) {
    return { ok: false, code: FLOW_CODE.UNAUTHORIZED };
  }

  const action = String(input.action || "").trim().toLowerCase();
  if (action === "back" || action === "back_to_form") {
    return {
      ok: true,
      code: FLOW_CODE.OK,
      step: "form",
      values: draft.values,
      draft,
    };
  }

  if (action === "open_existing") {
    const memberId = String(input.memberId || input.subjectRef || "").trim();
    if (!memberId) {
      return { ok: false, code: FLOW_CODE.VALIDATION, reason: "member_required" };
    }
    const member = await memberRepo.findMemberById(db, memberId);
    if (!member || String(member.churchId) !== String(draft.churchId)) {
      return { ok: false, code: FLOW_CODE.UNAUTHORIZED, reason: "tenant_isolation" };
    }
    return {
      ok: true,
      code: FLOW_CODE.OK,
      step: "open_existing",
      memberId: member.id,
      // Never auto-merge — open only.
      merged: false,
    };
  }

  if (action === "different_person" || action === "confirm_different") {
    if (
      draft.matchDecisionAction === PERSON_MATCH_ACTION.BLOCK ||
      draft.overallMatchCode === PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH
    ) {
      const dup = await evaluateAddMemberDuplicates(
        db,
        {
          organizationId: draft.organizationId,
          churchId: draft.churchId,
          branchId: draft.branchId,
          membershipStatus: draft.membershipStatus,
          demographics: draft.demographics,
          profile: draft.profile,
          memberNumber: null,
        },
        deps
      );
      return {
        ok: false,
        code: FLOW_CODE.MATCH_BLOCKED,
        step: "match",
        draftToken: input.draftToken,
        draft,
        matches: (dup && dup.matches) || [],
        reason: "church_id_collision_not_overridable",
      };
    }
    // Re-load matches for re-render safety if blocked path mistyped.
    const nextDraft = {
      ...draft,
      duplicateOverride: true,
      duplicateOverrideReason: "staff_confirmed_different_person",
      matchAction: "different_person",
      exp: Date.now() + DRAFT_TTL_MS,
    };
    return {
      ok: true,
      code: FLOW_CODE.REVIEW_READY,
      step: "review",
      draftToken: signDraft(nextDraft, input.env),
      draft: nextDraft,
      values: draft.values,
      churchIdPreview: draft.churchIdPreview,
    };
  }

  return { ok: false, code: FLOW_CODE.VALIDATION, reason: "unknown_action" };
}

/**
 * M04 confirm create (idempotent).
 */
async function confirmStaffAddMemberCreate(db, input, deps) {
  const verified = verifyDraft(input.draftToken, input.env);
  if (!verified.ok) return verified;
  const draft = verified.draft;

  if (
    String(draft.actorUserId) !== String(input.actorUserId) ||
    String(draft.churchId) !== String(input.churchId) ||
    String(draft.organizationId) !== String(input.organizationId)
  ) {
    return { ok: false, code: FLOW_CODE.UNAUTHORIZED };
  }

  const action = String(input.action || "confirm_create").trim().toLowerCase();
  if (action === "back_edit" || action === "back") {
    return {
      ok: true,
      code: FLOW_CODE.OK,
      step: "form",
      values: draft.values,
      draft,
    };
  }

  pruneConsumed();
  const createToken = String(draft.createToken || "").trim();
  if (createToken && consumedCreateTokens.has(createToken)) {
    const prior = consumedCreateTokens.get(createToken);
    return {
      ok: true,
      code: FLOW_CODE.IDEMPOTENT_REPLAY,
      step: "created",
      memberId: prior.memberId,
      productIdentifier: prior.productIdentifier,
      portalAccessStatus: "not_activated",
      replay: true,
    };
  }

  // If possible matches existed and staff did not confirm different person, block.
  if (
    draft.overallMatchCode &&
    draft.overallMatchCode !== PERSON_MATCH_CODE.NO_MATCH &&
    draft.matchDecisionAction !== PERSON_MATCH_ACTION.ALLOW &&
    draft.duplicateOverride !== true
  ) {
    // Re-check live to present M03 again.
    const dup = await evaluateAddMemberDuplicates(
      db,
      {
        organizationId: draft.organizationId,
        churchId: draft.churchId,
        branchId: draft.branchId,
        membershipStatus: draft.membershipStatus,
        demographics: draft.demographics,
        profile: draft.profile,
      },
      deps
    );
    return {
      ok: false,
      code: dup.hardBlock ? FLOW_CODE.MATCH_BLOCKED : FLOW_CODE.MATCH_REQUIRED,
      step: "match",
      draftToken: input.draftToken,
      draft,
      matches: (dup && dup.matches) || [],
      overallMatchCode: dup.overallMatchCode,
      action: dup.action,
    };
  }

  const parsed = {
    ok: true,
    values: draft.values,
    demographics: draft.demographics,
    profile: draft.profile,
    membershipStatus: draft.membershipStatus,
    branchId: draft.branchId,
    presentationOnly: draft.presentationOnly,
    fieldErrors: [],
  };

  const created = await submitStaffAddMember(
    db,
    {
      actorUserId: draft.actorUserId,
      organizationId: draft.organizationId,
      churchId: draft.churchId,
      parsed,
      duplicateOverride: draft.duplicateOverride === true,
      duplicateOverrideReason:
        draft.duplicateOverrideReason || "staff_add_member_review_confirmed",
      reusePersonId: input.reusePersonId || null,
    },
    deps
  );

  if (!created.ok) {
    if (created.code === FORM_CODE.UNAUTHORIZED) {
      return { ok: false, code: FLOW_CODE.UNAUTHORIZED, detail: created };
    }
    if (created.code === FORM_CODE.DUPLICATE) {
      const cards = await presentMatchCards(db, {
        churchId: draft.churchId,
        matches: created.matches || [],
      });
      const hard = (created.detail && created.detail.code) === "duplicate_church_id";
      return {
        ok: false,
        code: hard ? FLOW_CODE.MATCH_BLOCKED : FLOW_CODE.MATCH_REQUIRED,
        step: "match",
        draftToken: input.draftToken,
        draft,
        matches: cards,
        values: draft.values,
        detail: created,
      };
    }
    return {
      ok: false,
      code: FLOW_CODE.FAILED,
      step: "review",
      draftToken: input.draftToken,
      draft,
      detail: created,
      fieldErrors: created.fieldErrors || [],
    };
  }

  if (createToken) {
    consumedCreateTokens.set(createToken, {
      memberId: created.memberId,
      productIdentifier: created.productIdentifier || null,
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    });
  }

  return {
    ok: true,
    code: FLOW_CODE.CREATED,
    step: "created",
    memberId: created.memberId,
    productIdentifier: created.productIdentifier,
    membershipStatus: created.membershipStatus,
    portalAccessStatus: created.portalAccessStatus || "not_activated",
    replay: false,
    created,
  };
}

function reviewModelFromDraft(draft, extras) {
  return {
    churchIdPreview: draft.churchIdPreview,
    values: draft.values,
    demographics: draft.demographics,
    profile: draft.profile,
    membershipStatus: draft.membershipStatus,
    presentationOnly: draft.presentationOnly || {},
    portalAccessStatus: "not_activated",
    duplicateOverride: draft.duplicateOverride === true,
    ...(extras || {}),
  };
}

module.exports = {
  FLOW_CODE,
  DRAFT_TTL_MS,
  beginStaffAddMemberFlow,
  handleMatchStep,
  confirmStaffAddMemberCreate,
  evaluateAddMemberDuplicates,
  presentMatchCards,
  signDraft,
  verifyDraft,
  buildDraftPayload,
  reviewModelFromDraft,
  buildAddMemberFormModel,
  parseAddMemberFormBody,
  FORM_CODE,
  // test helpers
  _consumedCreateTokens: consumedCreateTokens,
  _pruneConsumed: pruneConsumed,
};
