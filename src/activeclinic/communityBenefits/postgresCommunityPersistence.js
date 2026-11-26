"use strict";

/**
 * Disposable PostgreSQL persistence helpers for Community Benefits.
 * Does not create tables. Does not enable financial posting.
 * Agreements written here remain INACTIVE unless a later approved path
 * supplies both ACTIVE status and legal_approval = approved.
 */

const crypto = require("crypto");
const { PROGRAM_ID } = require("./communityBenefitsService");

function requireRelation(pool, name) {
  return pool.query("SELECT to_regclass($1) AS rel", [name]).then((result) => {
    if (!result.rows[0] || !result.rows[0].rel) {
      const error = new Error(`BLOCKED_BY_MIGRATION: ${name} is not present. Refusing to create it.`);
      error.code = "BLOCKED_BY_MIGRATION";
      throw error;
    }
  });
}

async function assertCommunitySchema(pool) {
  await requireRelation(pool, "activeclinic.community_memberships");
  await requireRelation(pool, "activeclinic.community_settlement_batches");
  await requireRelation(pool, "activeclinic.community_passes");
  await requireRelation(pool, "activeclinic.community_agreements");
  await requireRelation(pool, "activeclinic.clinic_acquisitions");
  await requireRelation(pool, "activeclinic.community_introductions");
  await requireRelation(pool, "activeclinic.community_patient_links");
  await requireRelation(pool, "activeclinic.community_audit_events");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function insertMembership(pool, input) {
  const result = await pool.query(
    `INSERT INTO activeclinic.community_memberships (
       organization_id, program_id, person_id, status, identity_verified, consent_recorded, notice_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, status, identity_verified, consent_recorded, notice_version`,
    [
      input.organizationId,
      input.programId || PROGRAM_ID,
      input.personId,
      input.status || "pending_consent",
      input.identityVerified === true,
      input.consentRecorded === true,
      input.noticeVersion || null,
    ]
  );
  return result.rows[0];
}

async function insertPass(pool, input) {
  const token = input.token || crypto.randomBytes(16).toString("hex");
  const result = await pool.query(
    `INSERT INTO activeclinic.community_passes (
       person_id, token_hash, fallback_code, issued_at, expires_at, revoked_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, token_hash, fallback_code, revoked_at`,
    [
      input.personId,
      hashToken(token),
      input.fallbackCode || `FB-${crypto.randomBytes(3).toString("hex")}`,
      new Date(input.issuedAt || Date.now()),
      new Date(input.expiresAt || Date.now() + 24 * 60 * 60 * 1000),
      input.revokedAt ? new Date(input.revokedAt) : null,
    ]
  );
  return { ...result.rows[0], token };
}

async function rotatePass(pool, input) {
  await pool.query(
    `UPDATE activeclinic.community_passes
        SET revoked_at = now()
      WHERE person_id = $1 AND revoked_at IS NULL`,
    [input.personId]
  );
  return insertPass(pool, input);
}

async function insertAcquisition(pool, input) {
  const result = await pool.query(
    `INSERT INTO activeclinic.clinic_acquisitions (
       organization_id, person_id, clinic_id, state, actor_id
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, state, clinic_id`,
    [input.organizationId, input.personId, input.clinicId, input.state, input.actorId]
  );
  return result.rows[0];
}

async function insertIntroduction(pool, input) {
  const result = await pool.query(
    `INSERT INTO activeclinic.community_introductions (
       organization_id, person_id, clinic_id, source_type, evidence_ref,
       notice_version, actor_id, correlation_id
     ) VALUES ($1, $2, $3, 'platform_introduction', $4, $5, $6, $7)
     RETURNING id, evidence_ref, clinic_id`,
    [
      input.organizationId,
      input.personId,
      input.clinicId,
      input.evidenceRef,
      input.noticeVersion,
      input.actorId,
      input.correlationId,
    ]
  );
  return result.rows[0];
}

async function insertPatientLink(pool, input) {
  const result = await pool.query(
    `INSERT INTO activeclinic.community_patient_links (
       organization_id, clinic_id, facility_id, person_id, patient_id, actor_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, clinic_id, person_id, patient_id`,
    [
      input.organizationId,
      input.clinicId,
      input.facilityId || null,
      input.personId,
      input.patientId,
      input.actorId,
    ]
  );
  return result.rows[0];
}

async function insertAgreement(pool, input) {
  const result = await pool.query(
    `INSERT INTO activeclinic.community_agreements (
       organization_id, clinic_id, model, version, status, legal_approval,
       currency, discount_bps, contribution_bps
     ) VALUES ($1, $2, $3, $4, $5, $6, 'ZMW', $7, $8)
     RETURNING id, status, legal_approval, model, contribution_bps, discount_bps, version`,
    [
      input.organizationId,
      input.clinicId,
      input.model,
      input.version || 1,
      input.status || "INACTIVE",
      input.legalApproval || "unapproved",
      input.discountBps == null ? null : input.discountBps,
      input.contributionBps == null ? null : input.contributionBps,
    ]
  );
  return result.rows[0];
}

async function insertSettlementBatch(pool, input) {
  const result = await pool.query(
    `INSERT INTO activeclinic.community_settlement_batches (
       organization_id, clinic_id, batch_key, status, contribution_minor, currency, posted
     ) VALUES ($1, $2, $3, 'PENDING_APPROVAL', $4, 'ZMW', false)
     RETURNING id, batch_key, status, contribution_minor, posted`,
    [input.organizationId, input.clinicId, input.batchKey, input.contributionMinor]
  );
  return result.rows[0];
}

async function insertAudit(pool, input) {
  const result = await pool.query(
    `INSERT INTO activeclinic.community_audit_events (
       organization_id, clinic_id, event_type, actor_id
     ) VALUES ($1, $2, $3, $4)
     RETURNING id, event_type`,
    [input.organizationId, input.clinicId || null, input.eventType, input.actorId || null]
  );
  return result.rows[0];
}

async function cleanupOrganization(pool, organizationId) {
  await pool.query(`DELETE FROM activeclinic.community_settlement_batches WHERE organization_id = $1`, [
    organizationId,
  ]);
  await pool.query(`DELETE FROM activeclinic.community_audit_events WHERE organization_id = $1`, [
    organizationId,
  ]);
  await pool.query(`DELETE FROM activeclinic.community_patient_links WHERE organization_id = $1`, [
    organizationId,
  ]);
  await pool.query(`DELETE FROM activeclinic.community_introductions WHERE organization_id = $1`, [
    organizationId,
  ]);
  await pool.query(`DELETE FROM activeclinic.clinic_acquisitions WHERE organization_id = $1`, [
    organizationId,
  ]);
  await pool.query(`DELETE FROM activeclinic.community_agreements WHERE organization_id = $1`, [
    organizationId,
  ]);
  await pool.query(
    `DELETE FROM activeclinic.community_passes
      WHERE person_id IN (
        SELECT person_id FROM activeclinic.community_memberships WHERE organization_id = $1
      )`,
    [organizationId]
  );
  await pool.query(`DELETE FROM activeclinic.community_memberships WHERE organization_id = $1`, [
    organizationId,
  ]);
}

module.exports = {
  assertCommunitySchema,
  hashToken,
  insertMembership,
  insertPass,
  rotatePass,
  insertAcquisition,
  insertIntroduction,
  insertPatientLink,
  insertAgreement,
  insertSettlementBatch,
  insertAudit,
  cleanupOrganization,
};
