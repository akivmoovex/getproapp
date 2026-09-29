"use strict";

/**
 * Platform Admin support-context persistence.
 */

async function insertSupportContext(client, fields) {
  const ttlSeconds = Math.max(60, Math.floor(Number(fields.ttlSeconds) || 20 * 60));
  const { rows } = await client.query(
    `INSERT INTO platform.support_contexts
       (deployment_code, actor_user_id, organization_id, church_id, branch_id,
        support_type, reason, context_token_hash, status, started_at, expires_at,
        actor_session_id)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, 'active', now(), now() + make_interval(secs => $9), $10)
     RETURNING id, deployment_code, actor_user_id, organization_id, church_id, branch_id,
               support_type, reason, status, started_at, expires_at, ended_at, end_reason,
               actor_session_id`,
    [
      fields.deploymentCode,
      fields.actorUserId,
      fields.organizationId,
      fields.churchId,
      fields.branchId || null,
      fields.supportType,
      fields.reason,
      fields.contextTokenHash,
      ttlSeconds,
      fields.actorSessionId || null,
    ]
  );
  return rows[0] || null;
}

async function findActiveByTokenHash(client, tokenHash) {
  const { rows } = await client.query(
    `SELECT id, deployment_code, actor_user_id, organization_id, church_id, branch_id,
            support_type, reason, status, started_at, expires_at, ended_at, end_reason,
            actor_session_id
       FROM platform.support_contexts
      WHERE context_token_hash = $1
        AND status = 'active'
      LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function findActiveByActor(client, actorUserId) {
  const { rows } = await client.query(
    `SELECT id, deployment_code, actor_user_id, organization_id, church_id, branch_id,
            support_type, reason, status, started_at, expires_at, ended_at, end_reason,
            actor_session_id
       FROM platform.support_contexts
      WHERE actor_user_id = $1
        AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1`,
    [actorUserId]
  );
  return rows[0] || null;
}

async function endSupportContext(client, { id, status, endReason }) {
  const { rows } = await client.query(
    `UPDATE platform.support_contexts
        SET status = $2,
            ended_at = now(),
            end_reason = $3,
            updated_at = now()
      WHERE id = $1
        AND status = 'active'
      RETURNING id, deployment_code, actor_user_id, organization_id, church_id, branch_id,
                support_type, reason, status, started_at, expires_at, ended_at, end_reason,
                actor_session_id`,
    [id, status, endReason || null]
  );
  return rows[0] || null;
}

async function endActiveForActor(client, { actorUserId, status, endReason }) {
  const { rows } = await client.query(
    `UPDATE platform.support_contexts
        SET status = $2,
            ended_at = now(),
            end_reason = $3,
            updated_at = now()
      WHERE actor_user_id = $1
        AND status = 'active'
      RETURNING id`,
    [actorUserId, status, endReason || null]
  );
  return rows;
}

module.exports = {
  insertSupportContext,
  findActiveByTokenHash,
  findActiveByActor,
  endSupportContext,
  endActiveForActor,
};
