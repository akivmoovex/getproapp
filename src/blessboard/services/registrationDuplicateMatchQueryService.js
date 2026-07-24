"use strict";

/**
 * Phase2 Prompt 048 — duplicate match query service.
 * Loads candidates in batched queries (no N+1), scores via 046, persists via 047 repo.
 * No routes/UI. Does not change approval gates. Strips unrelated user PII from responses.
 */

const repo = require("../repositories/platformChurchRegistrationRepository");
const {
  normalizeChurchNameForDuplicate,
  normalizePlaceForDuplicate,
  normalizeEmailForDuplicate,
  normalizePhoneForDuplicate,
  normalizeWebsiteDomainForDuplicate,
  normalizeCompareText,
} = require("./registrationDuplicateNormalization");
const {
  RISK_LEVELS,
  scoreRegistrationDuplicateMatch,
} = require("./registrationDuplicateScoring");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RISK_RANK = Object.freeze({
  [RISK_LEVELS.CONFIRMED]: 0,
  [RISK_LEVELS.STRONG]: 1,
  [RISK_LEVELS.POSSIBLE]: 2,
  [RISK_LEVELS.NONE]: 3,
});

const DEFAULT_CANDIDATE_LIMIT = 40;

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimStr(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {object} row
 */
function mapSubjectFromApplicationRow(row) {
  const r = row && typeof row === "object" ? row : {};
  const phoneNorm = trimStr(r.contact_phone_normalized);
  const phoneDisplay = trimStr(r.contact_phone);
  const email = trimStr(r.contact_email);
  const churchName = trimStr(r.church_name);
  const city = trimStr(r.city);
  const country = trimStr(r.country);
  return {
    id: r.id != null ? String(r.id) : null,
    type: "application",
    churchName,
    city,
    country,
    contactEmail: email,
    contactPhone: phoneDisplay || phoneNorm,
    contactPhoneNormalized: phoneNorm || null,
    branchName: trimStr(r.branch_name) || null,
    website: null,
    registrationNumber: null,
    applicationStatus: trimStr(r.application_status),
    provisioningStatus: trimStr(r.provisioning_status),
    organizationId: r.organization_id != null ? String(r.organization_id) : null,
  };
}

/**
 * Safe subject presentation (no source_ip / user_agent / raw message dump).
 * @param {ReturnType<typeof mapSubjectFromApplicationRow>} subject
 */
function presentSubject(subject) {
  if (!subject) return null;
  return {
    id: subject.id,
    type: "application",
    churchName: subject.churchName || null,
    city: subject.city || null,
    country: subject.country || null,
    applicationStatus: subject.applicationStatus || null,
    provisioningStatus: subject.provisioningStatus || null,
    organizationId: subject.organizationId || null,
    hasContactEmail: Boolean(subject.contactEmail),
    hasContactPhone: Boolean(subject.contactPhoneNormalized || subject.contactPhone),
  };
}

/**
 * @param {string} type
 * @param {object} row
 */
function candidateFromRow(type, row) {
  const r = row && typeof row === "object" ? row : {};
  const id = r.id != null ? String(r.id) : null;
  if (type === "application") {
    return {
      id,
      type: "application",
      churchName: r.church_name,
      city: r.city,
      country: r.country,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
      contactPhoneNormalized: r.contact_phone_normalized,
      applicationStatus: r.application_status,
      provisioningStatus: r.provisioning_status,
      _raw: r,
    };
  }
  if (type === "organization") {
    return {
      id,
      type: "organization",
      displayName: r.display_name,
      churchName: r.display_name,
      primaryEmail: r.primary_email,
      churchOwnedEmails: r.primary_email ? [r.primary_email] : [],
      contactPhone: r.primary_phone,
      organizationKey: r.organization_key,
      status: r.status,
      dataEnvironment: r.data_environment,
      _raw: r,
    };
  }
  if (type === "church") {
    return {
      id,
      type: "church",
      displayName: r.display_name,
      churchName: r.display_name,
      primaryEmail: r.primary_email,
      churchOwnedEmails: r.primary_email ? [r.primary_email] : [],
      contactPhone: r.primary_phone,
      churchKey: r.church_key,
      organizationId: r.organization_id != null ? String(r.organization_id) : null,
      status: r.status,
      dataEnvironment: r.data_environment,
      _raw: r,
    };
  }
  if (type === "branch") {
    return {
      id,
      type: "branch",
      displayName: r.display_name,
      churchName: r.display_name,
      churchId: r.church_id != null ? String(r.church_id) : null,
      branchKey: r.branch_key,
      status: r.status,
      country: r.country_code,
      _raw: r,
    };
  }
  if (type === "domain") {
    return {
      id,
      type: "domain",
      website: r.hostname,
      hostname: r.hostname,
      domainType: r.domain_type,
      status: r.status,
      organizationId: r.organization_id != null ? String(r.organization_id) : null,
      _raw: r,
    };
  }
  if (type === "user") {
    return {
      id,
      type: "user",
      isPlatformUser: true,
      contactEmail: r.email_normalized || null,
      status: r.status,
      _raw: r,
    };
  }
  return { id, type, _raw: r };
}

/**
 * Operator-facing candidate summary — no unrelated user emails/phones.
 * @param {string} type
 * @param {object|null} row
 */
function presentCandidateSummary(type, row) {
  if (!row) {
    return { type, id: null, unavailable: true };
  }
  const id = row.id != null ? String(row.id) : null;
  if (type === "application") {
    return {
      type,
      id,
      churchName: row.church_name != null ? String(row.church_name) : null,
      city: row.city != null ? String(row.city) : null,
      country: row.country != null ? String(row.country) : null,
      applicationStatus: row.application_status != null ? String(row.application_status) : null,
      provisioningStatus:
        row.provisioning_status != null ? String(row.provisioning_status) : null,
    };
  }
  if (type === "organization") {
    return {
      type,
      id,
      displayName: row.display_name != null ? String(row.display_name) : null,
      organizationKey: row.organization_key != null ? String(row.organization_key) : null,
      status: row.status != null ? String(row.status) : null,
      dataEnvironment: row.data_environment != null ? String(row.data_environment) : null,
      hasPrimaryEmail: Boolean(row.primary_email),
    };
  }
  if (type === "church") {
    return {
      type,
      id,
      displayName: row.display_name != null ? String(row.display_name) : null,
      churchKey: row.church_key != null ? String(row.church_key) : null,
      organizationId: row.organization_id != null ? String(row.organization_id) : null,
      status: row.status != null ? String(row.status) : null,
      hasPrimaryEmail: Boolean(row.primary_email),
    };
  }
  if (type === "branch") {
    return {
      type,
      id,
      displayName: row.display_name != null ? String(row.display_name) : null,
      branchKey: row.branch_key != null ? String(row.branch_key) : null,
      churchId: row.church_id != null ? String(row.church_id) : null,
      status: row.status != null ? String(row.status) : null,
      countryCode: row.country_code != null ? String(row.country_code) : null,
    };
  }
  if (type === "domain") {
    return {
      type,
      id,
      hostname: row.hostname != null ? String(row.hostname) : null,
      domainType: row.domain_type != null ? String(row.domain_type) : null,
      status: row.status != null ? String(row.status) : null,
      organizationId: row.organization_id != null ? String(row.organization_id) : null,
    };
  }
  if (type === "user") {
    return {
      type,
      id,
      label: "Platform user account",
      status: row.status != null ? String(row.status) : null,
    };
  }
  return { type, id };
}

/**
 * @param {object|null} stored
 */
function manualEvidenceFromStored(stored) {
  if (!stored || !stored.review_decision) return null;
  const decision = String(stored.review_decision);
  if (decision === "confirmed_duplicate" || decision === "link_existing_church") {
    return { adminMarkedSameDuplicate: true };
  }
  if (decision === "different_church") {
    return { adminMarkedDifferentDuplicate: true };
  }
  return null;
}

/**
 * @param {object[]} matches
 */
function sortMatchesStable(matches) {
  return [...matches].sort((a, b) => {
    const ra = RISK_RANK[a.riskLevel] != null ? RISK_RANK[a.riskLevel] : 9;
    const rb = RISK_RANK[b.riskLevel] != null ? RISK_RANK[b.riskLevel] : 9;
    if (ra !== rb) return ra - rb;
    const sa = Number(a.score) || 0;
    const sb = Number(b.score) || 0;
    if (sb !== sa) return sb - sa;
    const ida = String(a.matchedRecordId || "");
    const idb = String(b.matchedRecordId || "");
    if (ida < idb) return -1;
    if (ida > idb) return 1;
    const ta = String(a.matchedRecordType || "");
    const tb = String(b.matchedRecordType || "");
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
}

/**
 * @param {object} scored
 */
function evidenceSnapshotFromScore(scored) {
  return {
    signals: Array.isArray(scored.signals) ? scored.signals : [],
    reasons: Array.isArray(scored.reasons) ? scored.reasons : [],
    explanation: scored.explanation != null ? String(scored.explanation) : "",
    candidateType: scored.candidateType != null ? String(scored.candidateType) : null,
    calculatedAt: scored.calculatedAt != null ? String(scored.calculatedAt) : null,
    advisory: true,
    autoMerge: false,
    autoReject: false,
    approvalGateUnchanged: true,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} subject
 * @param {object} deps
 */
async function loadCandidatesBatched(db, subject, deps) {
  const limit = deps.candidateLimit || DEFAULT_CANDIDATE_LIMIT;
  const nameNorm = normalizeChurchNameForDuplicate(subject.churchName);
  const branchNorm = subject.branchName
    ? normalizeCompareText(subject.branchName, 200)
    : null;
  const emailNorm = normalizeEmailForDuplicate(subject.contactEmail);
  const phoneFromHelper = normalizePhoneForDuplicate(subject.contactPhone, subject.country);
  const phoneNorm =
    subject.contactPhoneNormalized ||
    (phoneFromHelper && phoneFromHelper.normalized) ||
    null;
  const cityNorm = normalizePlaceForDuplicate(subject.city);
  const countryNorm = normalizePlaceForDuplicate(subject.country);
  const domainNorm = normalizeWebsiteDomainForDuplicate(subject.website);

  const displayName = nameNorm ? nameNorm.normalized : null;

  const [applications, organizations, churches, branches, domains, user] = await Promise.all([
    deps.listDuplicateCandidateApplications(db, {
      excludeApplicationId: subject.id,
      phoneNormalized: phoneNorm,
      churchName: nameNorm ? nameNorm.normalized : null,
      city: cityNorm ? cityNorm.normalized : null,
      country: countryNorm ? countryNorm.normalized : null,
      emailNormalized: emailNorm ? emailNorm.normalized : null,
      limit,
    }),
    displayName
      ? deps.listDuplicateCandidateOrganizations(db, {
          displayNameNormalized: displayName,
          limit,
        })
      : Promise.resolve([]),
    displayName
      ? deps.listDuplicateCandidateChurches(db, {
          displayNameNormalized: displayName,
          limit,
        })
      : Promise.resolve([]),
    branchNorm || displayName
      ? deps.listDuplicateCandidateBranches(db, {
          displayNameNormalized: branchNorm || displayName,
          limit,
        })
      : Promise.resolve([]),
    domainNorm && domainNorm.normalized
      ? deps.listDuplicateCandidateDomains(db, {
          hostname: domainNorm.normalized,
          limit,
        })
      : Promise.resolve([]),
    emailNorm && emailNorm.normalized
      ? deps.findDuplicateCandidateUserByEmail(db, emailNorm.normalized)
      : Promise.resolve(null),
  ]);

  /** @type {object[]} */
  const candidates = [];
  for (const row of applications || []) {
    candidates.push(candidateFromRow("application", row));
  }
  for (const row of organizations || []) {
    candidates.push(candidateFromRow("organization", row));
  }
  for (const row of churches || []) {
    candidates.push(candidateFromRow("church", row));
  }
  for (const row of branches || []) {
    candidates.push(candidateFromRow("branch", row));
  }
  for (const row of domains || []) {
    candidates.push(candidateFromRow("domain", row));
  }
  if (user && user.id) {
    candidates.push(candidateFromRow("user", user));
  }
  return candidates;
}

/**
 * @param {object} deps
 */
function resolveDeps(deps = {}) {
  return {
    getRegistrationApplicationById:
      deps.getRegistrationApplicationById || repo.getRegistrationApplicationById,
    listDuplicateCandidateApplications:
      deps.listDuplicateCandidateApplications || repo.listDuplicateCandidateApplications,
    listDuplicateCandidateOrganizations:
      deps.listDuplicateCandidateOrganizations || repo.listDuplicateCandidateOrganizations,
    listDuplicateCandidateChurches:
      deps.listDuplicateCandidateChurches || repo.listDuplicateCandidateChurches,
    listDuplicateCandidateBranches:
      deps.listDuplicateCandidateBranches || repo.listDuplicateCandidateBranches,
    listDuplicateCandidateDomains:
      deps.listDuplicateCandidateDomains || repo.listDuplicateCandidateDomains,
    findDuplicateCandidateUserByEmail:
      deps.findDuplicateCandidateUserByEmail || repo.findDuplicateCandidateUserByEmail,
    loadDuplicateMatchRecordsByType:
      deps.loadDuplicateMatchRecordsByType || repo.loadDuplicateMatchRecordsByType,
    replaceRegistrationDuplicateMatches:
      deps.replaceRegistrationDuplicateMatches || repo.replaceRegistrationDuplicateMatches,
    listRegistrationDuplicateMatches:
      deps.listRegistrationDuplicateMatches || repo.listRegistrationDuplicateMatches,
    getRegistrationDuplicateMatchById:
      deps.getRegistrationDuplicateMatchById || repo.getRegistrationDuplicateMatchById,
    scoreRegistrationDuplicateMatch:
      deps.scoreRegistrationDuplicateMatch || scoreRegistrationDuplicateMatch,
    candidateLimit: deps.candidateLimit,
    now: deps.now,
  };
}

/**
 * @param {object[]} storedRows
 * @param {object} records
 */
function presentStoredMatches(storedRows, records) {
  const presented = (storedRows || []).map((row) => {
    const type = String(row.matched_record_type || "");
    const id = String(row.matched_record_id || "");
    const map = records && records[type] ? records[type] : null;
    const raw = map && map.get ? map.get(id) : null;
    return {
      id: String(row.id),
      applicationId: String(row.application_id),
      matchedRecordType: type,
      matchedRecordId: id,
      score: Number(row.score) || 0,
      riskLevel: String(row.risk_level || RISK_LEVELS.NONE),
      evidenceSnapshot:
        row.evidence_snapshot && typeof row.evidence_snapshot === "object"
          ? row.evidence_snapshot
          : {},
      reviewDecision: row.review_decision != null ? String(row.review_decision) : null,
      reviewReason: row.review_reason != null ? String(row.review_reason) : null,
      reviewedByUserId:
        row.reviewed_by_user_id != null ? String(row.reviewed_by_user_id) : null,
      reviewedAt: row.reviewed_at || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      candidate: presentCandidateSummary(type, raw),
    };
  });
  return sortMatchesStable(presented);
}

/**
 * @param {object[]} stored
 */
function groupIdsByType(stored) {
  const buckets = new Map();
  for (const row of stored || []) {
    const type = String(row.matched_record_type || "");
    const mid = String(row.matched_record_id || "");
    if (!type || !UUID_RE.test(mid)) continue;
    if (!buckets.has(type)) buckets.set(type, []);
    buckets.get(type).push(mid);
  }
  return [...buckets.entries()].map(([type, ids]) => ({ type, ids }));
}

/**
 * Run duplicate check: load candidates (batched), score, persist, return ordered matches.
 *
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {object} [deps]
 */
async function runDuplicateCheck(db, applicationId, deps = {}) {
  const id = String(applicationId || "").trim();
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, status: "invalid_input", message: "invalid_application_id" };
  }
  const d = resolveDeps(deps);
  const row = await d.getRegistrationApplicationById(db, id);
  if (!row) {
    return { ok: false, status: "not_found", message: "application_not_found" };
  }

  const subject = mapSubjectFromApplicationRow(row);
  const existing = await d.listRegistrationDuplicateMatches(db, id);
  const priorByKey = new Map(
    (existing || []).map((m) => [`${m.matched_record_type}:${m.matched_record_id}`, m])
  );

  const candidates = await loadCandidatesBatched(db, subject, d);
  const toStore = [];
  const now = d.now != null ? d.now : new Date().toISOString();

  for (const candidate of candidates) {
    if (!candidate.id) continue;
    if (candidate.type === "application" && String(candidate.id) === id) continue;

    const prior = priorByKey.get(`${candidate.type}:${candidate.id}`);
    const scored = d.scoreRegistrationDuplicateMatch({
      subject,
      candidate,
      manualEvidence: manualEvidenceFromStored(prior),
      now,
    });

    if (!scored || scored.riskLevel === RISK_LEVELS.NONE || Number(scored.totalWeight) <= 0) {
      continue;
    }

    toStore.push({
      matchedRecordType: candidate.type,
      matchedRecordId: candidate.id,
      score: Math.floor(Number(scored.totalWeight) || 0),
      riskLevel: scored.riskLevel,
      evidenceSnapshot: evidenceSnapshotFromScore(scored),
    });
  }

  const stored = await d.replaceRegistrationDuplicateMatches(db, id, toStore);
  const records = await d.loadDuplicateMatchRecordsByType(db, groupIdsByType(stored));
  const matches = presentStoredMatches(stored, records);

  return {
    ok: true,
    status: "ok",
    applicationId: id,
    subject: presentSubject(subject),
    matches,
    checkedAt: typeof now === "string" ? now : new Date(now).toISOString(),
    advisory: true,
    autoMerge: false,
    autoReject: false,
    approvalGateUnchanged: true,
  };
}

/**
 * List persisted matches with safe candidate summaries (batched enrichment).
 *
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {object} [deps]
 */
async function listDuplicateMatches(db, applicationId, deps = {}) {
  const id = String(applicationId || "").trim();
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, status: "invalid_input", message: "invalid_application_id" };
  }
  const d = resolveDeps(deps);
  const row = await d.getRegistrationApplicationById(db, id);
  if (!row) {
    return { ok: false, status: "not_found", message: "application_not_found" };
  }

  const stored = await d.listRegistrationDuplicateMatches(db, id);
  const records = await d.loadDuplicateMatchRecordsByType(db, groupIdsByType(stored));
  return {
    ok: true,
    status: "ok",
    applicationId: id,
    subject: presentSubject(mapSubjectFromApplicationRow(row)),
    matches: presentStoredMatches(stored, records),
    advisory: true,
    approvalGateUnchanged: true,
  };
}

/**
 * Authorized comparison side for Prompt 051 screens.
 * Includes only allowlisted registration/organization fields; never invents missing data.
 * Unrelated user emails/phones are withheld for type=user.
 *
 * @param {"application"|"candidate"} role
 * @param {string} type
 * @param {object|null} row
 */
function presentAuthorizedComparisonSide(role, type, row) {
  const r = row && typeof row === "object" ? row : {};
  const recordType = trimStr(type) || "application";
  const id = r.id != null ? String(r.id) : null;

  if (recordType === "user") {
    return {
      role,
      type: "user",
      id,
      label: "Platform user account",
      legalName: null,
      publicName: null,
      country: null,
      province: null,
      district: null,
      town: null,
      address: null,
      phone: null,
      phoneWithheld: true,
      email: null,
      emailWithheld: true,
      website: null,
      registrationNumber: null,
      leader: null,
      branchCount: null,
      adminCount: null,
      organizationStatus: r.status != null ? String(r.status) : null,
      createdAt: r.created_at || r.createdAt || null,
    };
  }

  if (recordType === "application") {
    const phone = trimStr(r.contact_phone || r.contactPhone || r.contact_phone_normalized);
    const email = trimStr(r.contact_email || r.contactEmail);
    return {
      role,
      type: "application",
      id,
      label: null,
      legalName: null,
      publicName: trimStr(r.church_name || r.churchName) || null,
      country: trimStr(r.country) || null,
      province: null,
      district: null,
      town: trimStr(r.city || r.town) || null,
      address: null,
      phone: phone || null,
      phoneWithheld: false,
      email: email || null,
      emailWithheld: false,
      website: null,
      registrationNumber: null,
      leader: trimStr(r.contact_name || r.contactName) || null,
      branchCount: null,
      adminCount: null,
      organizationStatus: trimStr(r.application_status || r.applicationStatus) || null,
      createdAt: r.created_at || r.createdAt || null,
    };
  }

  if (recordType === "organization" || recordType === "church") {
    const display = trimStr(r.display_name || r.displayName || r.church_name || r.churchName);
    const legal = trimStr(r.legal_name || r.legalName);
    return {
      role,
      type: recordType,
      id,
      label: null,
      legalName: legal || null,
      publicName: display || null,
      country: trimStr(r.country || r.country_code || r.countryCode) || null,
      province: null,
      district: null,
      town: trimStr(r.city || r.town) || null,
      address: null,
      phone: trimStr(r.primary_phone || r.contact_phone || r.contactPhone) || null,
      phoneWithheld: false,
      email: trimStr(r.primary_email || r.contact_email || r.contactEmail) || null,
      emailWithheld: false,
      website: null,
      registrationNumber: null,
      leader: null,
      branchCount: null,
      adminCount: null,
      organizationStatus: trimStr(r.status) || null,
      createdAt: r.created_at || r.createdAt || null,
    };
  }

  if (recordType === "branch") {
    return {
      role,
      type: "branch",
      id,
      label: null,
      legalName: null,
      publicName: trimStr(r.display_name || r.displayName) || null,
      country: trimStr(r.country_code || r.countryCode || r.country) || null,
      province: null,
      district: null,
      town: null,
      address: null,
      phone: null,
      phoneWithheld: false,
      email: null,
      emailWithheld: false,
      website: null,
      registrationNumber: null,
      leader: null,
      branchCount: null,
      adminCount: null,
      organizationStatus: trimStr(r.status) || null,
      createdAt: r.created_at || r.createdAt || null,
    };
  }

  if (recordType === "domain") {
    return {
      role,
      type: "domain",
      id,
      label: null,
      legalName: null,
      publicName: null,
      country: null,
      province: null,
      district: null,
      town: null,
      address: null,
      phone: null,
      phoneWithheld: false,
      email: null,
      emailWithheld: false,
      website: trimStr(r.hostname) || null,
      registrationNumber: null,
      leader: null,
      branchCount: null,
      adminCount: null,
      organizationStatus: trimStr(r.status) || null,
      createdAt: r.created_at || r.createdAt || null,
    };
  }

  return {
    role,
    type: recordType,
    id,
    label: null,
    legalName: null,
    publicName: null,
    country: null,
    province: null,
    district: null,
    town: null,
    address: null,
    phone: null,
    phoneWithheld: false,
    email: null,
    emailWithheld: false,
    website: null,
    registrationNumber: null,
    leader: null,
    branchCount: null,
    adminCount: null,
    organizationStatus: null,
    createdAt: null,
  };
}

/**
 * Side-by-side comparison payload for one stored match.
 *
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {string} matchId
 * @param {object} [deps]
 */
async function getDuplicateComparison(db, applicationId, matchId, deps = {}) {
  const appId = String(applicationId || "").trim();
  const mid = String(matchId || "").trim();
  if (!appId || !UUID_RE.test(appId) || !mid || !UUID_RE.test(mid)) {
    return { ok: false, status: "invalid_input", message: "invalid_ids" };
  }
  const d = resolveDeps(deps);
  const row = await d.getRegistrationApplicationById(db, appId);
  if (!row) {
    return { ok: false, status: "not_found", message: "application_not_found" };
  }

  const match = await d.getRegistrationDuplicateMatchById(db, mid, {
    applicationId: appId,
  });
  if (!match) {
    return { ok: false, status: "not_found", message: "match_not_found" };
  }

  const type = String(match.matched_record_type || "");
  const records = await d.loadDuplicateMatchRecordsByType(db, [
    { type, ids: [String(match.matched_record_id)] },
  ]);
  const presented = presentStoredMatches([match], records)[0];
  const subject = mapSubjectFromApplicationRow(row);
  const map = records && records[type] ? records[type] : null;
  const rawCandidate =
    map && map.get ? map.get(String(match.matched_record_id)) : null;

  return {
    ok: true,
    status: "ok",
    applicationId: appId,
    match: presented,
    comparison: {
      subject: presentSubject(subject),
      candidate: presented.candidate,
      authorizedSubject: presentAuthorizedComparisonSide("application", "application", row),
      authorizedCandidate: presentAuthorizedComparisonSide("candidate", type, rawCandidate),
      score: presented.score,
      riskLevel: presented.riskLevel,
      evidenceSnapshot: presented.evidenceSnapshot,
      reviewDecision: presented.reviewDecision,
      reviewReason: presented.reviewReason,
    },
    advisory: true,
    autoMerge: false,
    autoReject: false,
    approvalGateUnchanged: true,
  };
}

module.exports = {
  RISK_RANK,
  DEFAULT_CANDIDATE_LIMIT,
  runDuplicateCheck,
  listDuplicateMatches,
  getDuplicateComparison,
  presentSubject,
  presentCandidateSummary,
  presentAuthorizedComparisonSide,
  mapSubjectFromApplicationRow,
  sortMatchesStable,
};
