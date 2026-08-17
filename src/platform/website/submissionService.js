"use strict";

const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const resolver = require("./resolver");
const { recordWebsiteAudit } = require("./auditService");
const versionService = require("./versionService");
const { evaluatePublicationReadiness } = require("./checklistService");
const { withProvisioningTransaction, isPool } = require("../db/provisioningTransaction");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "submission_not_found",
  NO_CHANGES: "no_unpublished_changes",
  OPEN_EXISTS: "open_submission_exists",
  CONFLICT: "submission_conflict",
  WRONG_STATUS: "invalid_submission_status",
  TENANT_MISMATCH: "tenant_mismatch",
  NOT_READY: "publication_not_ready",
});

const STATUS = Object.freeze({
  SUBMITTED: "submitted",
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  REJECTED: "rejected",
  SUPERSEDED: "superseded",
});

function mapSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    instanceId: row.instance_id,
    status: row.status,
    snapshot: row.snapshot_json,
    changedKeys: row.changed_keys || [],
    submitterIdentityId: row.submitter_identity_id,
    submittedAt: row.submitted_at,
    reviewerIdentityId: row.reviewer_identity_id,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    publishedAt: row.published_at,
    versionId: row.version_id,
    rowVersion: Number(row.row_version) || 1,
    overrideReadiness: row.override_readiness === true,
  };
}

async function submitWebsiteChanges(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: "website_instance_not_found", submission: null };

  const resolved = await resolver.resolveWebsiteContent(db, {
    organizationId,
    instance,
    mode: resolver.MODE.DRAFT,
  });
  const changes = resolved.changes || [];
  if (!changes.length) return { ok: false, code: RESULT.NO_CHANGES, submission: null };

  const snapshot = resolver.snapshotFromResolved(resolved);
  snapshot.changes = changes;
  snapshot.submittedAt = new Date().toISOString();

  try {
    const rows = await db.query(
      `INSERT INTO platform.website_submissions (
         organization_id, instance_id, status, snapshot_json, changed_keys, submitter_identity_id
       ) VALUES ($1,$2,'submitted',$3::jsonb,$4::text[],$5)
       RETURNING *`,
      [
        organizationId,
        instance.id,
        JSON.stringify(snapshot),
        changes.map((c) => c.contentKey),
        input.actorIdentityId || null,
      ]
    );
    const submission = mapSubmission(rows.rows[0]);
    await recordWebsiteAudit(db, {
      organizationId,
      instanceId: instance.id,
      actorIdentityId: input.actorIdentityId || null,
      actionKey: "website.submit",
      submissionId: submission.id,
      metadata: { count: changes.length },
    });
    return { ok: true, code: RESULT.OK, submission };
  } catch (err) {
    if (err && err.code === "23505") {
      return { ok: false, code: RESULT.OPEN_EXISTS, submission: null };
    }
    throw err;
  }
}

async function getWebsiteSubmission(db, input) {
  const rows = await db.query(
    `SELECT * FROM platform.website_submissions
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [input.submissionId, input.organizationId]
  );
  const submission = mapSubmission(rows.rows[0] || null);
  if (!submission) return { ok: false, code: RESULT.NOT_FOUND, submission: null };
  return { ok: true, submission };
}

async function listWebsiteSubmissions(db, input) {
  const params = [];
  const where = [];
  if (input.organizationId) {
    params.push(input.organizationId);
    where.push(`s.organization_id = $${params.length}`);
  }
  if (input.instanceId) {
    params.push(input.instanceId);
    where.push(`s.instance_id = $${params.length}`);
  }
  if (input.status) {
    params.push(input.status);
    where.push(`s.status = $${params.length}`);
  }
  params.push(Math.min(Math.max(Number(input.limit) || 50, 1), 200));
  const sql = `SELECT s.*, i.slug, i.product_code, o.organization_key, o.display_name
                 FROM platform.website_submissions s
                 JOIN platform.website_instances i ON i.id = s.instance_id
                 JOIN platform.organizations o ON o.id = s.organization_id
                ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                ORDER BY s.submitted_at DESC
                LIMIT $${params.length}`;
  const rows = await db.query(sql, params);
  return {
    ok: true,
    submissions: rows.rows.map((row) => ({
      ...mapSubmission(row),
      slug: row.slug,
      productCode: row.product_code,
      organizationKey: row.organization_key,
      organizationName: row.display_name,
      changeCount: (row.changed_keys || []).length,
      pagesChanged: [...new Set((row.changed_keys || []).map((k) => String(k).split(".")[0]))],
    })),
  };
}

async function decideWebsiteSubmission(db, input) {
  if (isPool(db)) {
    return withProvisioningTransaction(db, (client) => decideWebsiteSubmission(client, input));
  }
  const organizationId = String((input && input.organizationId) || "");
  const locked = await db.query(
    `SELECT * FROM platform.website_submissions
      WHERE id = $1 AND organization_id = $2
      FOR UPDATE`,
    [input.submissionId, organizationId]
  );
  const loaded = {
    ok: Boolean(locked.rows[0]),
    submission: mapSubmission(locked.rows[0] || null),
    code: locked.rows[0] ? RESULT.OK : RESULT.NOT_FOUND,
  };
  if (!loaded.ok) return loaded;
  const submission = loaded.submission;
  if (submission.status !== STATUS.SUBMITTED) {
    return { ok: false, code: RESULT.WRONG_STATUS, submission };
  }
  const expectedVersion = Number(input.rowVersion);
  if (Number.isFinite(expectedVersion) && expectedVersion !== submission.rowVersion) {
    return { ok: false, code: RESULT.CONFLICT, submission };
  }

  const decision = String(input.decision || "").trim().toLowerCase();
  const nextStatus =
    decision === "approve"
      ? STATUS.APPROVED
      : decision === "request_changes" || decision === "changes_requested"
        ? STATUS.CHANGES_REQUESTED
        : decision === "reject"
          ? STATUS.REJECTED
          : null;
  if (!nextStatus) return { ok: false, code: RESULT.INVALID_INPUT, submission };

  const instance = await instanceRepo.findWebsiteInstanceById(db, submission.instanceId, organizationId);
  if (!instance) return { ok: false, code: "website_instance_not_found", submission };

  if (nextStatus === STATUS.APPROVED) {
    const hasPublished = Boolean(instance.publishedAt || instance.lastPublishedAt);
    const snapshotResolved = {
      template: require("./templateRegistry").getWebsiteTemplate(instance.templateId, instance.templateVersion),
      values: (submission.snapshot && submission.snapshot.values) || {},
      visibility: (submission.snapshot && submission.snapshot.visibility) || {},
    };
    let operational = input.operational || {};
    if (!input.operational) {
      try {
        const hco = await db.query(
          `SELECT public_name, public_phone_display, public_email_display, public_booking_enabled
             FROM activeclinic.healthcare_organizations
            WHERE organization_id = $1
            LIMIT 1`,
          [organizationId]
        );
        if (hco.rows[0]) {
          const fac = await db.query(
            `SELECT address_line_1, city, province, country_code, public_hours_json
               FROM activeclinic.facilities
              WHERE organization_id = $1 AND is_primary = true
              LIMIT 1`,
            [organizationId]
          );
          const f = fac.rows[0] || {};
          const address = [f.address_line_1, f.city, f.province, f.country_code].filter(Boolean).join(", ");
          operational = {
            clinic_name: hco.rows[0].public_name,
            phone: hco.rows[0].public_phone_display,
            email: hco.rows[0].public_email_display,
            booking: hco.rows[0].public_booking_enabled === true,
            address: address || null,
            hours: f.public_hours_json || null,
          };
        }
      } catch {
        operational = input.operational || {};
      }
    }
    const readiness = evaluatePublicationReadiness({
      template: snapshotResolved.template,
      resolved: snapshotResolved,
      operational,
      hasPublishedVersion: hasPublished,
      firstPublication: !hasPublished,
    });
    if (readiness.blocksFirstPublication && input.overrideReadiness !== true) {
      return {
        ok: false,
        code: RESULT.NOT_READY,
        submission,
        readiness,
      };
    }
    if (readiness.blocksFirstPublication && input.overrideReadiness === true) {
      await recordWebsiteAudit(db, {
        organizationId,
        instanceId: instance.id,
        actorIdentityId: input.actorIdentityId || null,
        actionKey: "website.publish.override",
        submissionId: submission.id,
        metadata: { codes: readiness.codes || [] },
      });
    }

    const applied = await contentService.applyPublishedSnapshot(
      db,
      instance,
      submission.snapshot,
      input.actorIdentityId || null
    );
    if (!applied.ok) return { ok: false, code: applied.code, submission };

    const version = await versionService.createWebsiteVersion(db, {
      instance,
      submissionId: submission.id,
      snapshot: submission.snapshot,
      submitterIdentityId: submission.submitterIdentityId,
      reviewerIdentityId: input.actorIdentityId || null,
      changeCount: (submission.changedKeys || []).length,
    });

    const claimed = await db.query(
      `UPDATE platform.website_submissions
          SET status = $2,
              reviewer_identity_id = $3,
              reviewed_at = now(),
              review_note = $4,
              published_at = now(),
              version_id = $5,
              override_readiness = $6,
              row_version = row_version + 1
        WHERE id = $1 AND organization_id = $7 AND status = 'submitted' AND row_version = $8
        RETURNING *`,
      [
        submission.id,
        STATUS.APPROVED,
        input.actorIdentityId || null,
        input.reviewNote || null,
        version.version.id,
        input.overrideReadiness === true,
        organizationId,
        submission.rowVersion,
      ]
    );
    if (!claimed.rowCount) {
      return { ok: false, code: RESULT.CONFLICT, submission };
    }
    await instanceRepo.updateWebsiteInstance(db, {
      instanceId: instance.id,
      organizationId,
      status: "published",
      lastPublishedAt: new Date().toISOString(),
      publishedAt: instance.publishedAt || new Date().toISOString(),
    });
    return { ok: true, code: RESULT.OK, submission: mapSubmission(claimed.rows[0]), version: version.version, readiness };
  }

  const claimed = await db.query(
    `UPDATE platform.website_submissions
        SET status = $2,
            reviewer_identity_id = $3,
            reviewed_at = now(),
            review_note = $4,
            row_version = row_version + 1
      WHERE id = $1 AND organization_id = $5 AND status = 'submitted' AND row_version = $6
      RETURNING *`,
    [
      submission.id,
      nextStatus,
      input.actorIdentityId || null,
      input.reviewNote || null,
      organizationId,
      submission.rowVersion,
    ]
  );
  if (!claimed.rowCount) {
    return { ok: false, code: RESULT.CONFLICT, submission };
  }
  await recordWebsiteAudit(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: nextStatus === STATUS.REJECTED ? "website.reject" : "website.changes_requested",
    submissionId: submission.id,
  });
  return { ok: true, code: RESULT.OK, submission: mapSubmission(claimed.rows[0]) };
}

module.exports = {
  RESULT,
  STATUS,
  mapSubmission,
  submitWebsiteChanges,
  getWebsiteSubmission,
  listWebsiteSubmissions,
  decideWebsiteSubmission,
};
