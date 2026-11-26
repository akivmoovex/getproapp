"use strict";

/**
 * Authorized Community Benefits PostgreSQL persistence journey.
 * Agreements stay INACTIVE. Financial posting stays disabled.
 */

const assert = require("node:assert/strict");
const crypto = require("crypto");
const { createMemoryCommunityStore } = require(
  "../../../src/activeclinic/communityBenefits/memoryStore"
);
const service = require("../../../src/activeclinic/communityBenefits/communityBenefitsService");
const { calculateBenefit } = require("../../../src/activeclinic/communityBenefits/money");
const { financialPostingEnabled } = require("../../../src/activeclinic/communityBenefits/flags");
const persistence = require(
  "../../../src/activeclinic/communityBenefits/postgresCommunityPersistence"
);

async function runCommunityPostgresPersistence(pool) {
  assert.equal(financialPostingEnabled(), false);
  await persistence.assertCommunitySchema(pool);

  const org = await pool.query(
    `SELECT h.organization_id, h.id AS healthcare_organization_id, f.id AS facility_id
       FROM activeclinic.healthcare_organizations h
       JOIN activeclinic.facilities f ON f.healthcare_organization_id = h.id
      ORDER BY h.created_at ASC
      LIMIT 1`
  );
  assert.equal(org.rowCount, 1, "activeclinic organization prerequisite missing");
  const organizationId = org.rows[0].organization_id;
  const clinicA = org.rows[0].healthcare_organization_id;
  const facilityId = org.rows[0].facility_id;
  const other = await pool.query(
    `SELECT h.id AS healthcare_organization_id
       FROM activeclinic.healthcare_organizations h
      WHERE h.id <> $1
      ORDER BY h.created_at ASC
      LIMIT 1`,
    [clinicA]
  );
  assert.equal(other.rowCount, 1, "second clinic prerequisite missing");
  const clinicB = other.rows[0].healthcare_organization_id;

  const stamp = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
  const personId = crypto.randomUUID();
  const walkerId = crypto.randomUUID();
  const patientId = crypto.randomUUID();

  try {
    const membership = await persistence.insertMembership(pool, {
      organizationId,
      personId,
      status: "pending_consent",
      consentRecorded: false,
      identityVerified: false,
    });
    assert.equal(membership.status, "pending_consent");

    await pool.query(
      `UPDATE activeclinic.community_memberships
          SET consent_recorded = true,
              notice_version = $2,
              identity_verified = true,
              status = 'active'
        WHERE id = $1`,
      [membership.id, "draft-notice-v2134"]
    );

    const pass = await persistence.insertPass(pool, {
      personId,
      token: `token-${stamp}`,
      fallbackCode: `FB-${stamp}`,
    });
    assert.equal(pass.revoked_at, null);
    const rotated = await persistence.rotatePass(pool, {
      personId,
      token: `token-rot-${stamp}`,
      fallbackCode: `FB-ROT-${stamp}`,
    });
    const activePasses = await pool.query(
      `SELECT count(*)::int AS n
         FROM activeclinic.community_passes
        WHERE person_id = $1 AND revoked_at IS NULL`,
      [personId]
    );
    assert.equal(activePasses.rows[0].n, 1);
    assert.notEqual(rotated.token_hash, pass.token_hash);

    await persistence.insertAcquisition(pool, {
      organizationId,
      personId: walkerId,
      clinicId: clinicA,
      state: "CLINIC_DIRECT",
      actorId: "staff-a",
    });
    await persistence.insertMembership(pool, {
      organizationId,
      personId: walkerId,
      status: "active",
      consentRecorded: true,
      identityVerified: true,
      noticeVersion: "draft-notice-v2134",
    });

    const intro = await persistence.insertIntroduction(pool, {
      organizationId,
      personId,
      clinicId: clinicB,
      evidenceRef: `intro-${stamp}`,
      noticeVersion: "draft-notice-v2134",
      actorId: "system",
      correlationId: `corr-${stamp}`,
    });
    await persistence.insertAcquisition(pool, {
      organizationId,
      personId,
      clinicId: clinicB,
      state: "PLATFORM_INTRODUCED",
      actorId: "system",
    });
    assert.equal(intro.clinic_id, clinicB);

    const forged = await pool
      .query(
        `INSERT INTO activeclinic.community_introductions (
           organization_id, person_id, clinic_id, source_type, evidence_ref,
           notice_version, actor_id, correlation_id
         ) VALUES ($1, $2, $3, 'forged', $4, 'draft-notice-v2134', 'bad', 'x')`,
        [organizationId, personId, clinicA, `forged-${stamp}`]
      )
      .then(() => null)
      .catch((error) => error);
    assert.ok(forged, "forged introduction source must be rejected");

    const link = await persistence.insertPatientLink(pool, {
      organizationId,
      clinicId: clinicB,
      facilityId,
      personId,
      patientId,
      actorId: "reception-b",
    });
    assert.equal(link.patient_id, patientId);
    const duplicateLink = await pool
      .query(
        `INSERT INTO activeclinic.community_patient_links (
           organization_id, clinic_id, person_id, patient_id, actor_id
         ) VALUES ($1, $2, $3, $4, 'other')`,
        [organizationId, clinicB, personId, crypto.randomUUID()]
      )
      .then(() => null)
      .catch((error) => error);
    assert.ok(duplicateLink, "duplicate clinic person link must be rejected");

    const inactive = await persistence.insertAgreement(pool, {
      organizationId,
      clinicId: clinicB,
      model: "MODEL_B_COMMUNITY_CONTRIBUTION",
      contributionBps: 1000,
      status: "INACTIVE",
      legalApproval: "unapproved",
    });
    assert.equal(inactive.status, "INACTIVE");
    const illegalActive = await pool
      .query(
        `INSERT INTO activeclinic.community_agreements (
           organization_id, clinic_id, model, version, status, legal_approval, contribution_bps
         ) VALUES ($1, $2, 'MODEL_B_COMMUNITY_CONTRIBUTION', 2, 'ACTIVE', 'unapproved', 1000)`,
        [organizationId, clinicB]
      )
      .then(() => null)
      .catch((error) => error);
    assert.ok(illegalActive, "ACTIVE without legal approval must be rejected");

    const modelB = calculateBenefit({
      model: "MODEL_B_COMMUNITY_CONTRIBUTION",
      amountMinor: 10000,
      contributionBps: 1000,
    });
    assert.equal(modelB.contributionMinor, 1000);
    assert.equal(modelB.patientSavingsMinor, 0);

    const store = createMemoryCommunityStore();
    const created = service.addPerson(store, { displayName: "PG Member", id: personId });
    assert.equal(created.ok, true);
    service.requestEnrollment(store, { personId });
    service.recordConsent(store, { personId, noticeVersion: "draft-notice-v2134" });
    service.verifyIdentity(store, { personId, method: "staff_document" });
    service.activateMembership(store, { personId });
    service.recordIntroduction(store, {
      personId,
      clinicId: clinicB,
      sourceType: "platform_introduction",
      evidenceRef: `mem-intro-${stamp}`,
      noticeVersion: "draft-notice-v2134",
      actorId: "system",
      correlationId: `mem-corr-${stamp}`,
    });
    const agreement = service.createAgreement(store, {
      clinicId: clinicB,
      model: "MODEL_B_COMMUNITY_CONTRIBUTION",
      contributionBps: 1000,
      eligibleServices: ["consultation"],
    }).agreement;
    assert.equal(agreement.status, "INACTIVE");
    const preview = service.previewInvoice(store, {
      personId,
      clinicId: clinicB,
      agreementId: agreement.id,
      serviceCode: "consultation",
      amountMinor: 10000,
    });
    assert.equal(preview.ok, true);
    assert.equal(preview.decision.decision, "MEMBER_ONLY");
    assert.equal(preview.decision.reason, "agreement_inactive");
    assert.equal(preview.discountMinor, 0);
    assert.equal(preview.posted, false);

    agreement.status = "ACTIVE";
    agreement.legalApproval = "approved";
    const eligiblePreview = service.previewInvoice(store, {
      personId,
      clinicId: clinicB,
      agreementId: agreement.id,
      serviceCode: "consultation",
      amountMinor: 10000,
    });
    assert.equal(eligiblePreview.ok, true);
    assert.equal(eligiblePreview.decision.decision, "ELIGIBLE");
    assert.equal(eligiblePreview.contributionMinor, 1000);
    assert.equal(eligiblePreview.posted, false);

    await service.planLedger(store, {
      personId,
      clinicId: clinicB,
      agreementId: agreement.id,
      serviceCode: "consultation",
      amountMinor: 10000,
      paidMinor: 10000,
      idempotencyKey: `plan-${stamp}`,
    });
    const refund = await service.planRefund(store, { idempotencyKey: `plan-${stamp}` });
    assert.equal(refund.ok, true);
    assert.equal(refund.plan.contributionMinor, -1000);

    const firstBatch = await service.planSettlementBatch(store, {
      clinicId: clinicB,
      actorClinicId: clinicB,
      staffRole: "clinic_admin",
      batchKey: `batch-${stamp}`,
      actorId: "admin-b",
    });
    const secondBatch = await service.planSettlementBatch(store, {
      clinicId: clinicB,
      actorClinicId: clinicB,
      staffRole: "clinic_admin",
      batchKey: `batch-${stamp}`,
      actorId: "admin-b",
    });
    assert.equal(firstBatch.ok, true);
    assert.equal(secondBatch.duplicate, true);
    assert.equal(firstBatch.batch.posted, false);
    const posted = service.commitSettlement(store);
    assert.equal(posted.code, "posting_disabled");

    const persistedBatch = await persistence.insertSettlementBatch(pool, {
      organizationId,
      clinicId: clinicB,
      batchKey: `pg-batch-${stamp}`,
      contributionMinor: firstBatch.batch.contributionMinor,
    });
    assert.equal(persistedBatch.posted, false);
    assert.equal(persistedBatch.status, "PENDING_APPROVAL");
    const duplicateBatch = await pool
      .query(
        `INSERT INTO activeclinic.community_settlement_batches (
           organization_id, clinic_id, batch_key, contribution_minor
         ) VALUES ($1, $2, $3, 1)`,
        [organizationId, clinicB, `pg-batch-${stamp}`]
      )
      .then(() => null)
      .catch((error) => error);
    assert.ok(duplicateBatch, "duplicate settlement batch key must be rejected");
    const forcePost = await pool
      .query(
        `UPDATE activeclinic.community_settlement_batches SET posted = true WHERE id = $1`,
        [persistedBatch.id]
      )
      .then(() => null)
      .catch((error) => error);
    assert.ok(forcePost, "posted=true must remain blocked by schema");

    await persistence.insertAudit(pool, {
      organizationId,
      clinicId: clinicB,
      eventType: "settlement.planned",
      actorId: "admin-b",
    });

    service.addPerson(store, { displayName: "Walk In", id: walkerId });
    service.requestEnrollment(store, { personId: walkerId });
    service.recordConsent(store, { personId: walkerId, noticeVersion: "draft-notice-v2134" });
    service.verifyIdentity(store, { personId: walkerId, method: "staff_document" });
    service.activateMembership(store, { personId: walkerId });
    service.recordStaffRegistration(store, { personId: walkerId, clinicId: clinicA, actorId: "staff-a" });
    service.recordWalkIn(store, { personId: walkerId, clinicId: clinicA, actorId: "staff-a" });
    const walkAgreement = service.createAgreement(store, {
      clinicId: clinicA,
      model: "MODEL_A_DIRECT_DISCOUNT",
      discountBps: 1000,
      eligibleServices: ["consultation"],
    }).agreement;
    walkAgreement.status = "ACTIVE";
    walkAgreement.legalApproval = "approved";
    const walkEligible = service.decideEligibility(store, {
      personId: walkerId,
      clinicId: clinicA,
      agreementId: walkAgreement.id,
      serviceCode: "consultation",
    });
    assert.equal(walkEligible.decision, "NOT_ELIGIBLE");
    assert.equal(walkEligible.reason, "walk_in_no_introduction");
    const walkAcquisition = await pool.query(
      `SELECT state FROM activeclinic.clinic_acquisitions
        WHERE person_id = $1 AND clinic_id = $2
        ORDER BY recorded_at DESC LIMIT 1`,
      [walkerId, clinicA]
    );
    assert.equal(walkAcquisition.rows[0].state, "CLINIC_DIRECT");

    const foreignRead = await pool.query(
      `SELECT count(*)::int AS n
         FROM activeclinic.community_patient_links
        WHERE organization_id = $1 AND clinic_id = $2 AND person_id = $3`,
      [organizationId, clinicA, personId]
    );
    assert.equal(foreignRead.rows[0].n, 0);
  } finally {
    await pool.query(`DELETE FROM activeclinic.community_passes WHERE person_id = ANY($1::uuid[])`, [
      [personId, walkerId],
    ]);
    await persistence.cleanupOrganization(pool, organizationId);
  }
}

module.exports = {
  runCommunityPostgresPersistence,
};
