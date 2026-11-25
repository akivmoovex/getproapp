"use strict";

const crypto = require("crypto");
const { calculateBenefit } = require("./money");
const { financialPostingEnabled } = require("./flags");
const { audit, id } = require("./memoryStore");

const PROGRAM_ID = "activeclinic-community";
const PASS_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function fail(code) {
  return { ok: false, code };
}

function person(store, personId) {
  return store.persons.get(personId) || null;
}

function addPerson(store, input) {
  const row = {
    id: input.id || id(),
    displayName: String(input.displayName || "").trim(),
    reviewState: input.reviewState || "clear",
  };
  if (!row.displayName) return fail("name_required");
  store.persons.set(row.id, row);
  audit(store, { type: "person.created", personId: row.id, at: input.at });
  return { ok: true, person: row };
}

function flagDuplicate(store, input) {
  const row = person(store, input.personId);
  if (!row) return fail("person_not_found");
  row.reviewState = "review_required";
  audit(store, { type: "person.review_required", personId: row.id, at: input.at });
  return { ok: true, person: { ...row } };
}

function membership(store, personId) {
  return store.memberships.get(`${PROGRAM_ID}:${personId}`) || null;
}

function requestEnrollment(store, input) {
  if (!person(store, input.personId)) return fail("person_not_found");
  const existing = membership(store, input.personId);
  if (existing) return { ok: true, membership: existing, duplicate: true };
  const row = {
    id: id(),
    programId: PROGRAM_ID,
    personId: input.personId,
    status: "pending_consent",
    identityVerified: false,
    consentRecorded: false,
    history: [{ status: "pending_consent", at: input.at || Date.now() }],
  };
  store.memberships.set(`${PROGRAM_ID}:${input.personId}`, row);
  audit(store, { type: "membership.requested", personId: input.personId, membershipId: row.id, at: input.at });
  return { ok: true, membership: row, duplicate: false };
}

function recordConsent(store, input) {
  const row = membership(store, input.personId);
  if (!row) return fail("membership_not_found");
  if (!input.noticeVersion) return fail("notice_required");
  row.consentRecorded = true;
  row.noticeVersion = String(input.noticeVersion);
  row.history.push({ status: row.status, consent: true, at: input.at || Date.now() });
  audit(store, { type: "membership.consent", personId: input.personId, at: input.at });
  return { ok: true, membership: row };
}

function verifyIdentity(store, input) {
  const row = membership(store, input.personId);
  if (!row) return fail("membership_not_found");
  if (!input.method || input.method === "qr_scan") return fail("verification_method_rejected");
  row.identityVerified = true;
  row.verificationMethod = String(input.method);
  audit(store, { type: "membership.identity_verified", personId: input.personId, at: input.at });
  return { ok: true, membership: row };
}

function activateMembership(store, input) {
  const row = membership(store, input.personId);
  if (!row) return fail("membership_not_found");
  if (!row.consentRecorded || !row.identityVerified) return fail("consent_or_identity_pending");
  if (person(store, input.personId).reviewState === "review_required") return fail("review_required");
  row.status = "active";
  row.history.push({ status: "active", at: input.at || Date.now() });
  audit(store, { type: "membership.activated", personId: input.personId, at: input.at });
  return { ok: true, membership: row };
}

function setMembershipStatus(store, input, status) {
  const row = membership(store, input.personId);
  if (!row) return fail("membership_not_found");
  row.status = status;
  row.history.push({ status, at: input.at || Date.now() });
  audit(store, { type: `membership.${status}`, personId: input.personId, at: input.at });
  return { ok: true, membership: row };
}

function acquisitionsFor(store, personId, clinicId) {
  return store.acquisitions.filter((row) => row.personId === personId && row.clinicId === clinicId);
}

function currentAcquisition(store, personId, clinicId) {
  const rows = acquisitionsFor(store, personId, clinicId);
  return rows.length ? rows[rows.length - 1] : null;
}

function recordWalkIn(store, input) {
  if (!person(store, input.personId)) return fail("person_not_found");
  if (!input.clinicId || !input.actorId) return fail("binding");
  const current = currentAcquisition(store, input.personId, input.clinicId);
  if (current && current.state === "PLATFORM_INTRODUCED") {
    return { ok: true, acquisition: current, unchanged: true };
  }
  if (current && current.state === "CLINIC_DIRECT") {
    return { ok: true, acquisition: current, duplicate: true };
  }
  const row = {
    id: id(),
    personId: input.personId,
    clinicId: input.clinicId,
    state: "CLINIC_DIRECT",
    at: input.at || Date.now(),
    actorId: input.actorId,
  };
  store.acquisitions.push(row);
  audit(store, { type: "acquisition.clinic_direct", personId: input.personId, clinicId: input.clinicId, at: row.at });
  return { ok: true, acquisition: row };
}

function recordStaffRegistration(store, input) {
  audit(store, {
    type: "registration.staff",
    personId: input.personId,
    clinicId: input.clinicId,
    at: input.at,
    note: "staff_registration_does_not_attribute",
  });
  return { ok: true, acquisition: currentAcquisition(store, input.personId, input.clinicId) };
}

function recordIntroduction(store, input) {
  if (!person(store, input.personId)) return fail("person_not_found");
  if (!input.clinicId || !input.actorId || !input.correlationId) return fail("binding");
  if (input.sourceType !== "platform_introduction") return fail("forged_referral");
  if (!input.evidenceRef || !input.noticeVersion) return fail("evidence_required");
  const duplicate = store.introductions.find((row) => row.evidenceRef === input.evidenceRef);
  if (duplicate) return { ok: true, introduction: duplicate, duplicate: true, code: "duplicate_event" };
  const event = {
    id: id(),
    personId: input.personId,
    clinicId: input.clinicId,
    sourceType: "platform_introduction",
    evidenceRef: String(input.evidenceRef),
    noticeVersion: String(input.noticeVersion),
    actorId: input.actorId,
    correlationId: String(input.correlationId),
    at: input.at || Date.now(),
  };
  store.introductions.push(event);
  const current = currentAcquisition(store, input.personId, input.clinicId);
  const reopen = !current || current.state === "CLINIC_EXITED";
  if (reopen) {
    store.acquisitions.push({
      id: id(),
      personId: input.personId,
      clinicId: input.clinicId,
      state: "PLATFORM_INTRODUCED",
      at: event.at,
      actorId: input.actorId,
      introductionId: event.id,
    });
  }
  audit(store, {
    type: "introduction.recorded",
    personId: input.personId,
    clinicId: input.clinicId,
    correlationId: event.correlationId,
    at: event.at,
  });
  return {
    ok: true,
    introduction: event,
    acquisition: currentAcquisition(store, input.personId, input.clinicId),
    converted: !current,
    reopened: Boolean(current && current.state === "CLINIC_EXITED"),
  };
}

function recordClinicExit(store, input) {
  if (!person(store, input.personId)) return fail("person_not_found");
  if (!input.clinicId || !input.actorId) return fail("binding");
  const row = {
    id: id(),
    personId: input.personId,
    clinicId: input.clinicId,
    state: "CLINIC_EXITED",
    at: input.at || Date.now(),
    actorId: input.actorId,
  };
  store.acquisitions.push(row);
  audit(store, { type: "acquisition.clinic_exit", personId: input.personId, clinicId: input.clinicId, at: row.at });
  return { ok: true, acquisition: row, history: acquisitionsFor(store, input.personId, input.clinicId) };
}

function issuePass(store, input) {
  const row = membership(store, input.personId);
  if (!row || row.status === "revoked" || row.status === "suspended") return fail("membership_blocked");
  const token = crypto.randomBytes(32).toString("base64url");
  const record = {
    id: id(),
    personId: input.personId,
    tokenHash: hashToken(token),
    fallbackCode: crypto.randomBytes(6).toString("hex"),
    issuedAt: input.at || Date.now(),
    expiresAt: (input.at || Date.now()) + PASS_TTL_MS,
    revokedAt: null,
  };
  store.passes.push(record);
  audit(store, { type: "pass.issued", personId: input.personId, passId: record.id, at: record.issuedAt });
  return { ok: true, pass: record, token, fallbackCode: record.fallbackCode };
}

function rotatePass(store, input) {
  const current = store.passes.filter((row) => row.personId === input.personId && !row.revokedAt);
  for (const row of current) row.revokedAt = input.at || Date.now();
  return issuePass(store, input);
}

function revokePass(store, input) {
  const row = store.passes.find((item) => item.id === input.passId && item.personId === input.personId);
  if (!row) return fail("pass_not_found");
  row.revokedAt = input.at || Date.now();
  audit(store, { type: "pass.revoked", personId: input.personId, passId: row.id, at: row.revokedAt });
  return { ok: true, pass: row };
}

function presentPass(store, input) {
  const secret = String(input.token || input.fallbackCode || "");
  if (!secret) return fail("invalid_pass");
  const hashed = input.token ? hashToken(input.token) : null;
  const row = store.passes.find((item) => (
    hashed ? item.tokenHash === hashed : item.fallbackCode === input.fallbackCode
  ));
  if (!row) return fail("invalid_pass");
  const now = input.at || Date.now();
  if (row.revokedAt) return fail("revoked_pass");
  if (now >= row.expiresAt) return fail("expired_pass");
  const member = membership(store, row.personId);
  const who = person(store, row.personId);
  audit(store, {
    type: "pass.presented",
    personId: row.personId,
    clinicId: input.clinicId || null,
    actorId: input.actorId || null,
    at: now,
  });
  return {
    ok: true,
    presentation: {
      personId: row.personId,
      displayName: who ? who.displayName : "",
      membershipStatus: member ? member.status : "none",
      clinicId: input.clinicId || null,
    },
  };
}

function addPatient(store, input) {
  const row = {
    id: input.id || id(),
    clinicId: input.clinicId,
    facilityId: input.facilityId,
    displayName: input.displayName,
    phone: input.phone || null,
  };
  store.patients.push(row);
  if (input.diagnosis) {
    store.charts.push({ clinicId: input.clinicId, patientId: row.id, diagnosis: String(input.diagnosis) });
  }
  return { ok: true, patient: row };
}

function localPatients(store, input) {
  return store.patients.filter((row) => {
    if (row.clinicId !== input.clinicId) return false;
    if (input.facilityId && row.facilityId !== input.facilityId) return false;
    if (input.phone && row.phone !== input.phone) return false;
    return true;
  });
}

function readChart(store, input) {
  if (input.actorClinicId !== input.clinicId) return fail("cross_clinic_chart");
  const row = store.charts.find((item) => item.clinicId === input.clinicId && item.patientId === input.patientId);
  if (!row) return fail("chart_not_found");
  return { ok: true, chart: { diagnosis: row.diagnosis } };
}

async function linkMember(store, input) {
  if (!input.confirmed) return fail("confirmation_required");
  if (input.staffRole !== "reception" && input.staffRole !== "clinic_admin") return fail("access_denied");
  if (input.actorClinicId !== input.clinicId) return fail("wrong_clinic");
  return store.serial(`link:${input.clinicId}:${input.personId}`, async () => {
    const existing = store.links.find((row) => row.clinicId === input.clinicId && row.personId === input.personId);
    if (existing) return fail("already_linked");
    if (!input.patientId) return fail("review_required");
    const patient = store.patients.find((row) => row.id === input.patientId && row.clinicId === input.clinicId);
    if (!patient) return fail("patient_not_found");
    if (input.facilityId && patient.facilityId !== input.facilityId) return fail("wrong_facility");
    const row = {
      id: id(),
      clinicId: input.clinicId,
      facilityId: patient.facilityId,
      personId: input.personId,
      patientId: patient.id,
      at: input.at || Date.now(),
      actorId: input.actorId,
    };
    store.links.push(row);
    audit(store, {
      type: "link.created",
      personId: input.personId,
      clinicId: input.clinicId,
      patientId: patient.id,
      actorId: input.actorId || null,
      at: row.at,
    });
    return { ok: true, link: row };
  });
}

function createAgreement(store, input) {
  const row = {
    id: id(),
    clinicId: input.clinicId,
    model: input.model,
    version: input.version || 1,
    status: "INACTIVE",
    currency: "ZMW",
    discountBps: input.discountBps == null ? null : input.discountBps,
    contributionBps: input.contributionBps == null ? null : input.contributionBps,
    eligibleServices: input.eligibleServices || [],
    exclusions: input.exclusions || [],
    effectiveFrom: input.effectiveFrom || null,
    effectiveTo: input.effectiveTo || null,
    settlementPeriod: input.settlementPeriod || "monthly",
    legalApproval: "unapproved",
    taxTreatment: input.taxTreatment || "unspecified",
    refundPolicy: input.refundPolicy || "reverse_unsettled",
  };
  store.agreements.push(row);
  audit(store, { type: "agreement.drafted", agreementId: row.id, clinicId: row.clinicId });
  return { ok: true, agreement: row };
}

function decideEligibility(store, input) {
  const who = person(store, input.personId);
  if (!who) return { decision: "NOT_ELIGIBLE", reason: "person_not_found" };
  if (who.reviewState === "review_required") return { decision: "REVIEW_REQUIRED", reason: "duplicate_person" };
  const member = membership(store, input.personId);
  if (!member) return { decision: "NOT_ELIGIBLE", reason: "no_membership" };
  if (member.status === "suspended" || member.status === "revoked") {
    return { decision: "NOT_ELIGIBLE", reason: "membership_blocked" };
  }
  if (member.status !== "active") return { decision: "NOT_ELIGIBLE", reason: "membership_pending" };
  const acquisition = currentAcquisition(store, input.personId, input.clinicId);
  if (acquisition && acquisition.state === "CLINIC_EXITED") {
    return { decision: "NOT_ELIGIBLE", reason: "clinic_exit" };
  }
  const introduced = store.introductions.some((row) => (
    row.personId === input.personId && row.clinicId === input.clinicId && row.sourceType === "platform_introduction"
  ));
  if (!introduced) {
    if (acquisition && acquisition.state === "CLINIC_DIRECT") {
      return { decision: "NOT_ELIGIBLE", reason: "walk_in_no_introduction" };
    }
    return { decision: "MEMBER_ONLY", reason: "no_introduction" };
  }
  const agreement = store.agreements.find((row) => row.id === input.agreementId && row.clinicId === input.clinicId);
  if (!agreement) return { decision: "MEMBER_ONLY", reason: "agreement_missing" };
  if (input.policyVersion && agreement.version !== input.policyVersion) {
    return { decision: "NOT_ELIGIBLE", reason: "stale_policy" };
  }
  const now = input.at || Date.now();
  if (agreement.effectiveFrom && now < agreement.effectiveFrom) {
    return { decision: "NOT_ELIGIBLE", reason: "agreement_not_started" };
  }
  if (agreement.effectiveTo && now > agreement.effectiveTo) return { decision: "NOT_ELIGIBLE", reason: "agreement_expired" };
  if (agreement.status !== "ACTIVE" || agreement.legalApproval !== "approved") {
    return { decision: "MEMBER_ONLY", reason: "agreement_inactive" };
  }
  if (agreement.exclusions.includes(input.serviceCode)) return { decision: "NOT_ELIGIBLE", reason: "service_excluded" };
  if (agreement.eligibleServices.length && !agreement.eligibleServices.includes(input.serviceCode)) {
    return { decision: "NOT_ELIGIBLE", reason: "service_excluded" };
  }
  return { decision: "ELIGIBLE", reason: "introduced_repeat" };
}

function previewInvoice(store, input) {
  const decision = decideEligibility(store, input);
  const amountMinor = input.amountMinor;
  if (!Number.isInteger(amountMinor) || amountMinor < 0) return fail("invalid_amount");
  if (decision.decision !== "ELIGIBLE") {
    return {
      ok: true,
      decision,
      discountMinor: 0,
      payableMinor: amountMinor,
      patientSavingsMinor: 0,
      disclosure: "No community discount is applied.",
      posted: false,
    };
  }
  const agreement = store.agreements.find((row) => row.id === input.agreementId);
  if (!agreement) return fail("agreement_missing");
  let quote;
  try {
    quote = calculateBenefit({
      model: agreement.model,
      amountMinor,
      discountBps: agreement.discountBps,
      contributionBps: agreement.contributionBps,
    });
  } catch (error) {
    return fail(error.code || "unsupported_model");
  }
  return {
    ok: true,
    decision,
    ...quote,
    disclosure: quote.patientSavingsMinor > 0
      ? `Community discount ${quote.patientSavingsMinor} ngwee.`
      : "No community discount is applied.",
    posted: false,
  };
}

function planLedger(store, input) {
  if (!input.idempotencyKey) return Promise.resolve(fail("idempotency_required"));
  return store.serial(`plan:${input.idempotencyKey}`, async () => {
  const existing = store.plans.get(input.idempotencyKey);
  if (existing) return { ok: true, plan: existing, duplicate: true };
  const decision = decideEligibility(store, input);
  if (decision.decision !== "ELIGIBLE") return { ok: false, code: "not_eligible", decision };
  const agreement = store.agreements.find((row) => row.id === input.agreementId);
  if (!agreement) return fail("agreement_missing");
  const paid = input.paidMinor == null ? input.amountMinor : input.paidMinor;
  if (!Number.isInteger(paid) || paid < 0 || paid > input.amountMinor) return fail("invalid_amount");
  let full;
  try {
    full = calculateBenefit({
      model: agreement.model,
      amountMinor: input.amountMinor,
      discountBps: agreement.discountBps,
      contributionBps: agreement.contributionBps,
    });
  } catch (error) {
    return fail(error.code || "unsupported_model");
  }
  const contributionMinor = input.amountMinor === 0 ? 0 : Math.floor((full.contributionMinor * paid) / input.amountMinor);
  const plan = {
    id: id(),
    idempotencyKey: input.idempotencyKey,
    clinicId: input.clinicId,
    contributionMinor,
    currency: "ZMW",
    reversalOf: null,
  };
  store.plans.set(input.idempotencyKey, plan);
  return { ok: true, plan, duplicate: false };
  });
}

function selectAgreementForClinic(store, clinicId, at) {
  const rows = store.agreements.filter((row) => row.clinicId === clinicId);
  const now = at || Date.now();
  const active = rows.filter((row) => (
    row.status === "ACTIVE"
    && row.legalApproval === "approved"
    && (!row.effectiveFrom || now >= row.effectiveFrom)
    && (!row.effectiveTo || now <= row.effectiveTo)
  ));
  if (active.length) {
    const ordered = active.slice().sort((left, right) => left.version - right.version);
    return ordered[ordered.length - 1];
  }
  return rows.length ? rows[rows.length - 1] : null;
}

function commitLedger(store, input) {
  if (financialPostingEnabled() !== false) return fail("posting_guard_missing");
  audit(store, { type: "ledger.refused", idempotencyKey: input.idempotencyKey, at: input.at });
  return { ok: false, code: "posting_disabled", posted: false, ledgerCount: store.ledger.length };
}

function planRefund(store, input) {
  if (!input.idempotencyKey) return Promise.resolve(fail("idempotency_required"));
  return store.serial(`plan:${input.idempotencyKey}`, async () => {
  const original = store.plans.get(input.idempotencyKey);
  if (!original) return fail("plan_not_found");
  const key = `${input.idempotencyKey}:refund`;
  if (store.plans.has(key)) return { ok: true, plan: store.plans.get(key), duplicate: true };
  const plan = {
    id: id(),
    idempotencyKey: key,
    clinicId: original.clinicId,
    contributionMinor: original.contributionMinor === 0 ? 0 : -original.contributionMinor,
    currency: "ZMW",
    reversalOf: original.id,
  };
  store.plans.set(key, plan);
  return { ok: true, plan, duplicate: false };
  });
}

module.exports = {
  PROGRAM_ID,
  addPerson,
  flagDuplicate,
  requestEnrollment,
  recordConsent,
  verifyIdentity,
  activateMembership,
  suspendMembership: (store, input) => setMembershipStatus(store, input, "suspended"),
  revokeMembership: (store, input) => setMembershipStatus(store, input, "revoked"),
  recordWalkIn,
  recordStaffRegistration,
  recordIntroduction,
  recordClinicExit,
  issuePass,
  rotatePass,
  revokePass,
  presentPass,
  addPatient,
  localPatients,
  readChart,
  linkMember,
  createAgreement,
  decideEligibility,
  previewInvoice,
  planLedger,
  selectAgreementForClinic,
  commitLedger,
  planRefund,
  currentAcquisition,
};
