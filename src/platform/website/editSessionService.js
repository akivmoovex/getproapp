"use strict";

/**
 * Lightweight edit-session version batching.
 *
 * Each field save persists immediately and can auto-publish live content.
 * Multiple saves by the same editor on the same instance amend one published
 * version until the session closes. Frozen versions are never rewritten.
 *
 * Session close: Finish Editing, Submit, Restore, other editor, inactivity,
 * or logout when an identity is available. No WebSocket.
 */

const versionService = require("./versionService");
const { snapshotFromResolved, resolveWebsiteContent, MODE } = require("./resolver");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_INACTIVITY_MS = 30 * 60 * 1000;
const CLOSE_REASON = Object.freeze({
  FINISH: "finish_editing",
  SUBMIT: "submit",
  LOGOUT: "logout",
  INACTIVITY: "inactivity",
  OTHER_EDITOR: "other_editor",
  RESTORE: "restore",
  LIFECYCLE: "lifecycle",
});

function normalizeEditorId(value) {
  const id = String(value || "").trim();
  return UUID_RE.test(id) ? id : null;
}

function inactivityMs(input) {
  const n = Number(input && input.inactivityMs);
  if (Number.isFinite(n) && n >= 1000 && n <= 24 * 60 * 60 * 1000) return n;
  return DEFAULT_INACTIVITY_MS;
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    instanceId: row.instance_id,
    editorIdentityId: row.editor_identity_id || null,
    status: row.status,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    closedAt: row.closed_at,
    closeReason: row.close_reason || null,
    changedKeys: row.changed_keys || [],
  };
}

async function snapshotLive(db, instance) {
  const resolved = await resolveWebsiteContent(db, {
    organizationId: instance.organizationId,
    instance,
    mode: MODE.LIVE,
  });
  return snapshotFromResolved(resolved);
}

async function freezeSession(db, session, reason) {
  if (!session || session.status !== "open") return session;
  const rows = await db.query(
    `UPDATE platform.website_edit_sessions
        SET status = 'closed',
            closed_at = now(),
            close_reason = $2,
            last_activity_at = now()
      WHERE id = $1 AND status = 'open'
      RETURNING *`,
    [session.id, String(reason || CLOSE_REASON.FINISH).slice(0, 64)]
  );
  return mapSession(rows.rows[0] || session);
}

async function closeExpiredSessions(db, instance, opts) {
  const ms = inactivityMs(opts);
  const expired = await db.query(
    `SELECT * FROM platform.website_edit_sessions
      WHERE instance_id = $1
        AND organization_id = $2
        AND status = 'open'
        AND last_activity_at < now() - ($3::int * interval '1 millisecond')`,
    [instance.id, instance.organizationId, ms]
  );
  const closed = [];
  for (const row of expired.rows) {
    closed.push(await freezeSession(db, mapSession(row), CLOSE_REASON.INACTIVITY));
  }
  return closed;
}

async function closeOtherEditorSessions(db, instance, editorIdentityId) {
  const others = await db.query(
    `SELECT * FROM platform.website_edit_sessions
      WHERE instance_id = $1
        AND organization_id = $2
        AND status = 'open'
        AND editor_identity_id IS DISTINCT FROM $3`,
    [instance.id, instance.organizationId, editorIdentityId]
  );
  const closed = [];
  for (const row of others.rows) {
    closed.push(await freezeSession(db, mapSession(row), CLOSE_REASON.OTHER_EDITOR));
  }
  return closed;
}

async function findOpenSession(db, instance, editorIdentityId) {
  const rows = await db.query(
    `SELECT * FROM platform.website_edit_sessions
      WHERE instance_id = $1
        AND organization_id = $2
        AND status = 'open'
        AND editor_identity_id IS NOT DISTINCT FROM $3
      LIMIT 1`,
    [instance.id, instance.organizationId, editorIdentityId]
  );
  return mapSession(rows.rows[0] || null);
}

async function openSession(db, instance, editorIdentityId) {
  const rows = await db.query(
    `INSERT INTO platform.website_edit_sessions (
       organization_id, instance_id, editor_identity_id, status
     ) VALUES ($1,$2,$3,'open')
     RETURNING *`,
    [instance.organizationId, instance.id, editorIdentityId]
  );
  return mapSession(rows.rows[0]);
}

async function findSessionVersion(db, session) {
  if (!session) return null;
  const rows = await db.query(
    `SELECT * FROM platform.website_versions
      WHERE edit_session_id = $1 AND organization_id = $2
      ORDER BY version_number DESC
      LIMIT 1`,
    [session.id, session.organizationId]
  );
  return versionService.mapVersion(rows.rows[0] || null);
}

async function touchSessionKeys(db, session, contentKey) {
  const key = String(contentKey || "").trim();
  const rows = await db.query(
    `UPDATE platform.website_edit_sessions
        SET last_activity_at = now(),
            changed_keys = CASE
              WHEN $2 = '' THEN changed_keys
              WHEN $2 = ANY(changed_keys) THEN changed_keys
              ELSE array_append(changed_keys, $2)
            END
      WHERE id = $1 AND status = 'open'
      RETURNING *`,
    [session.id, key]
  );
  return mapSession(rows.rows[0] || session);
}

/**
 * After live content is already updated: attach this save to the editor session
 * and create or amend the single session version.
 */
async function recordAutoPublishSave(db, input) {
  const instance = input.instance;
  const editorIdentityId = normalizeEditorId(input.actorIdentityId);
  const contentKey = String(input.contentKey || "").trim();
  await closeExpiredSessions(db, instance, input);
  await closeOtherEditorSessions(db, instance, editorIdentityId);

  let session = await findOpenSession(db, instance, editorIdentityId);
  if (!session) session = await openSession(db, instance, editorIdentityId);
  session = await touchSessionKeys(db, session, contentKey);

  const snapshot = input.snapshot || (await snapshotLive(db, instance));
  const changedKeys = session.changedKeys || [];
  let version = await findSessionVersion(db, session);
  if (version && version.status === "published") {
    const amended = await versionService.amendOpenSessionVersion(db, {
      versionId: version.id,
      organizationId: instance.organizationId,
      editSessionId: session.id,
      snapshot,
      changedKeys,
    });
    version = amended.version || version;
  } else {
    const created = await versionService.createWebsiteVersion(db, {
      instance,
      snapshot,
      editorIdentityId,
      submitterIdentityId: editorIdentityId,
      changeCount: changedKeys.length,
      changedKeys,
      sourcePolicy: input.sourcePolicy,
      editSessionId: session.id,
      moderationStatus: "published",
      auditActionKey: input.auditActionKey || "website.publish",
    });
    version = created.ok ? created.version : null;
  }
  return { ok: true, session, version };
}

async function closeOpenSessionsForInstance(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instanceId = String((input && input.instanceId) || "");
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(instanceId)) {
    return { ok: false, sessions: [] };
  }
  const editorIdentityId =
    Object.prototype.hasOwnProperty.call(input || {}, "editorIdentityId")
      ? normalizeEditorId(input.editorIdentityId)
      : undefined;
  const params = [instanceId, organizationId];
  let sql = `SELECT * FROM platform.website_edit_sessions
              WHERE instance_id = $1 AND organization_id = $2 AND status = 'open'`;
  if (editorIdentityId !== undefined) {
    params.push(editorIdentityId);
    sql += ` AND editor_identity_id IS NOT DISTINCT FROM $3`;
  }
  const rows = await db.query(sql, params);
  const closed = [];
  for (const row of rows.rows) {
    closed.push(await freezeSession(db, mapSession(row), input.reason || CLOSE_REASON.FINISH));
  }
  return { ok: true, sessions: closed };
}

async function closeOpenSessionsForEditor(db, editorIdentityId, reason) {
  const editorId = normalizeEditorId(editorIdentityId);
  if (!editorId) return { ok: true, sessions: [] };
  const rows = await db.query(
    `SELECT * FROM platform.website_edit_sessions
      WHERE editor_identity_id = $1 AND status = 'open'`,
    [editorId]
  );
  const closed = [];
  for (const row of rows.rows) {
    closed.push(await freezeSession(db, mapSession(row), reason || CLOSE_REASON.LOGOUT));
  }
  return { ok: true, sessions: closed };
}

module.exports = {
  DEFAULT_INACTIVITY_MS,
  CLOSE_REASON,
  mapSession,
  recordAutoPublishSave,
  closeOpenSessionsForInstance,
  closeOpenSessionsForEditor,
  closeExpiredSessions,
  findOpenSession,
};
