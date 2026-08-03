"use strict";

/**
 * Deployment session context_json helpers (facility selection, etc.).
 */

/**
 * @param {{ query: Function }} db
 * @param {{ sessionId: string, patch: object }} input
 */
async function mergeSessionContext(db, input) {
  const sessionId = String((input && input.sessionId) || "").trim();
  const patch = input && input.patch && typeof input.patch === "object" ? input.patch : {};
  if (!sessionId) return { ok: false, code: "invalid_input", context: null };

  const result = await db.query(
    `UPDATE platform.deployment_sessions
        SET context_json = COALESCE(context_json, '{}'::jsonb) || $2::jsonb
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING context_json`,
    [sessionId, JSON.stringify(patch)]
  );
  if (!result.rows[0]) return { ok: false, code: "session_not_found", context: null };
  return {
    ok: true,
    code: "ok",
    context:
      result.rows[0].context_json && typeof result.rows[0].context_json === "object"
        ? result.rows[0].context_json
        : {},
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ sessionId: string, keys: string[] }} input
 */
async function clearSessionContextKeys(db, input) {
  const sessionId = String((input && input.sessionId) || "").trim();
  const keys = Array.isArray(input.keys) ? input.keys : [];
  if (!sessionId) return { ok: false, code: "invalid_input" };
  let context = {};
  const current = await db.query(
    `SELECT context_json FROM platform.deployment_sessions
      WHERE id = $1 AND revoked_at IS NULL
      LIMIT 1`,
    [sessionId]
  );
  if (!current.rows[0]) return { ok: false, code: "session_not_found" };
  context =
    current.rows[0].context_json && typeof current.rows[0].context_json === "object"
      ? { ...current.rows[0].context_json }
      : {};
  for (const key of keys) {
    delete context[key];
  }
  const result = await db.query(
    `UPDATE platform.deployment_sessions
        SET context_json = $2::jsonb
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING context_json`,
    [sessionId, JSON.stringify(context)]
  );
  return {
    ok: true,
    code: "ok",
    context: result.rows[0] ? result.rows[0].context_json : context,
  };
}

module.exports = {
  mergeSessionContext,
  clearSessionContextKeys,
};
