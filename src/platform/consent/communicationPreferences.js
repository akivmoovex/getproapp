"use strict";

/**
 * Safely-common consent / preference primitives.
 *
 * IN SCOPE:
 * - Channel communication preferences (email/sms/in_app) by opaque subject_ref
 * - Versioned policy acceptance (terms / privacy / marketing)
 *
 * OUT OF SCOPE (product-owned):
 * - Clinical / treatment / HIPAA-style consent (ActiveClinic)
 * - Member pastoral / ministry consent (BlessBoard)
 * - Patient or member foreign keys
 */

const {
  rejectForgedTenantIdentifiers,
} = require("../rbac/sharedTenantScope");

const PRODUCT_CODES = Object.freeze(["blessboard", "activeclinic"]);
const CHANNELS = Object.freeze(["email", "sms", "in_app"]);

const POLICY_KEYS = Object.freeze({
  TERMS: "terms",
  PRIVACY: "privacy",
  MARKETING: "marketing",
});

/**
 * @param {string} productCode
 */
function assertProductCode(productCode) {
  const code = String(productCode || "")
    .trim()
    .toLowerCase();
  if (!PRODUCT_CODES.includes(code)) {
    return { ok: false, code: "invalid_product_code", productCode: code };
  }
  return { ok: true, code: "ok", productCode: code };
}

/**
 * Trusted scope must supply organizationId. Client body tenant IDs are rejected.
 * @param {{
 *   trusted: { organizationId: string, facilityId?: string|null, branchId?: string|null },
 *   body?: object|null,
 *   query?: object|null,
 * }} input
 */
function assertTrustedOrgScope(input) {
  const trusted = (input && input.trusted) || null;
  const organizationId =
    trusted && trusted.organizationId
      ? String(trusted.organizationId).trim()
      : "";
  if (!organizationId) {
    return {
      ok: false,
      code: "tenant_unresolved",
      reasonCode: "RBAC_TENANT_UNRESOLVED",
      httpStatus: 403,
    };
  }
  const forged = rejectForgedTenantIdentifiers({
    body: input && input.body,
    query: input && input.query,
    trusted: {
      organizationId,
      facilityId: trusted.facilityId || null,
      branchId: trusted.branchId || null,
    },
    allowMatchingTrusted: true,
  });
  if (!forged.ok) return forged;
  return {
    ok: true,
    code: "ok",
    organizationId,
    facilityId: trusted.facilityId ? String(trusted.facilityId) : null,
    branchId: trusted.branchId ? String(trusted.branchId) : null,
  };
}

/**
 * @param {object} input
 */
function normalizePreferenceInput(input) {
  const src = input && typeof input === "object" ? input : {};
  const product = assertProductCode(src.productCode);
  if (!product.ok) return product;
  const subjectKind = String(src.subjectKind || "").trim();
  const subjectRef = String(src.subjectRef || "").trim();
  const channel = String(src.channel || "")
    .trim()
    .toLowerCase();
  const purposeKey = String(src.purposeKey || "").trim();
  if (!subjectKind || subjectKind.length > 64) {
    return { ok: false, code: "invalid_subject_kind" };
  }
  if (!subjectRef || subjectRef.length > 200) {
    return { ok: false, code: "invalid_subject_ref" };
  }
  if (!CHANNELS.includes(channel)) {
    return { ok: false, code: "invalid_channel" };
  }
  if (!purposeKey || purposeKey.length > 80) {
    return { ok: false, code: "invalid_purpose_key" };
  }
  return {
    ok: true,
    code: "ok",
    productCode: product.productCode,
    subjectKind,
    subjectRef,
    channel,
    purposeKey,
    optedIn: src.optedIn === true,
    source:
      src.source == null || src.source === ""
        ? null
        : String(src.source).trim().slice(0, 80),
  };
}

/**
 * Upsert a communication preference using trusted org scope only.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   trusted: object,
 *   body?: object,
 *   productCode: string,
 *   subjectKind: string,
 *   subjectRef: string,
 *   channel: string,
 *   purposeKey: string,
 *   optedIn: boolean,
 *   source?: string|null,
 *   actorIdentityId?: string|null,
 * }} input
 */
async function upsertCommunicationPreference(db, input) {
  const scope = assertTrustedOrgScope(input);
  if (!scope.ok) return scope;
  const normalized = normalizePreferenceInput(input);
  if (!normalized.ok) return normalized;

  const result = await db.query(
    `INSERT INTO platform.communication_preferences (
       organization_id, product_code, subject_kind, subject_ref,
       channel, purpose_key, opted_in, facility_id, branch_id, source,
       updated_by_identity_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (organization_id, product_code, subject_kind, subject_ref, channel, purpose_key)
     DO UPDATE SET
       opted_in = EXCLUDED.opted_in,
       facility_id = COALESCE(EXCLUDED.facility_id, platform.communication_preferences.facility_id),
       branch_id = COALESCE(EXCLUDED.branch_id, platform.communication_preferences.branch_id),
       source = COALESCE(EXCLUDED.source, platform.communication_preferences.source),
       updated_by_identity_id = EXCLUDED.updated_by_identity_id,
       updated_at = now()
     RETURNING id, organization_id, product_code, subject_kind, subject_ref,
               channel, purpose_key, opted_in, updated_at`,
    [
      scope.organizationId,
      normalized.productCode,
      normalized.subjectKind,
      normalized.subjectRef,
      normalized.channel,
      normalized.purposeKey,
      normalized.optedIn,
      scope.facilityId,
      scope.branchId,
      normalized.source,
      input.actorIdentityId || null,
    ]
  );
  return { ok: true, code: "ok", preference: mapPreference(result.rows[0]) };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   trusted: object,
 *   productCode: string,
 *   subjectKind: string,
 *   subjectRef: string,
 * }} input
 */
async function listCommunicationPreferences(db, input) {
  const scope = assertTrustedOrgScope(input);
  if (!scope.ok) return scope;
  const product = assertProductCode(input.productCode);
  if (!product.ok) return product;
  const subjectKind = String(input.subjectKind || "").trim();
  const subjectRef = String(input.subjectRef || "").trim();
  if (!subjectKind || !subjectRef) {
    return { ok: false, code: "invalid_subject" };
  }
  const result = await db.query(
    `SELECT id, organization_id, product_code, subject_kind, subject_ref,
            channel, purpose_key, opted_in, updated_at
     FROM platform.communication_preferences
     WHERE organization_id = $1
       AND product_code = $2
       AND subject_kind = $3
       AND subject_ref = $4
     ORDER BY channel ASC, purpose_key ASC`,
    [scope.organizationId, product.productCode, subjectKind, subjectRef]
  );
  return {
    ok: true,
    code: "ok",
    preferences: result.rows.map(mapPreference),
  };
}

function mapPreference(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    productCode: row.product_code,
    subjectKind: row.subject_kind,
    subjectRef: row.subject_ref,
    channel: row.channel,
    purposeKey: row.purpose_key,
    optedIn: row.opted_in === true,
    updatedAt: row.updated_at,
  };
}

/**
 * Record a versioned policy acceptance (not clinical consent).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function recordPolicyAcceptance(db, input) {
  const scope = assertTrustedOrgScope(input);
  if (!scope.ok) return scope;
  const product = assertProductCode(input.productCode);
  if (!product.ok) return product;
  const policyKey = String(input.policyKey || "").trim();
  const policyVersion = String(input.policyVersion || "").trim();
  const subjectKind = String(input.subjectKind || "").trim();
  const subjectRef = String(input.subjectRef || "").trim();
  if (!policyKey || policyKey.length > 80) {
    return { ok: false, code: "invalid_policy_key" };
  }
  if (!policyVersion || policyVersion.length > 40) {
    return { ok: false, code: "invalid_policy_version" };
  }
  if (!subjectKind || !subjectRef) {
    return { ok: false, code: "invalid_subject" };
  }
  const result = await db.query(
    `INSERT INTO platform.policy_acceptances (
       organization_id, product_code, policy_key, policy_version,
       subject_kind, subject_ref, facility_id, branch_id,
       actor_identity_id, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING id, organization_id, product_code, policy_key, policy_version,
               subject_kind, subject_ref, accepted_at`,
    [
      scope.organizationId,
      product.productCode,
      policyKey,
      policyVersion,
      subjectKind,
      subjectRef,
      scope.facilityId,
      scope.branchId,
      input.actorIdentityId || null,
      JSON.stringify(
        input.metadata && typeof input.metadata === "object" ? input.metadata : {}
      ),
    ]
  );
  const row = result.rows[0];
  return {
    ok: true,
    code: "ok",
    acceptance: {
      id: row.id,
      organizationId: row.organization_id,
      productCode: row.product_code,
      policyKey: row.policy_key,
      policyVersion: row.policy_version,
      subjectKind: row.subject_kind,
      subjectRef: row.subject_ref,
      acceptedAt: row.accepted_at,
    },
  };
}

/**
 * Pure helper for registration-style checkbox + versioned policy record shape.
 */
function buildPolicyAcceptanceDraft(input) {
  const product = assertProductCode(input && input.productCode);
  if (!product.ok) return product;
  const policyKey = String((input && input.policyKey) || "").trim();
  const policyVersion = String((input && input.policyVersion) || "").trim();
  if (!policyKey || !policyVersion) {
    return { ok: false, code: "invalid_policy" };
  }
  return {
    ok: true,
    code: "ok",
    draft: {
      productCode: product.productCode,
      policyKey,
      policyVersion,
      subjectKind: String((input && input.subjectKind) || "identity").trim(),
      subjectRef: String((input && input.subjectRef) || "").trim(),
      acceptedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  PRODUCT_CODES,
  CHANNELS,
  POLICY_KEYS,
  assertProductCode,
  assertTrustedOrgScope,
  normalizePreferenceInput,
  upsertCommunicationPreference,
  listCommunicationPreferences,
  recordPolicyAcceptance,
  buildPolicyAcceptanceDraft,
};
