"use strict";

/**
 * Member notification preference repository (org/church scoped).
 */

const {
  PREFERENCE_CATEGORIES,
  defaultPreferences,
} = require("../messaging/messageConstants");

function mapRow(row) {
  if (!row) return null;
  return {
    churchId: row.church_id,
    memberId: row.member_id,
    category: row.category,
    inAppEnabled: Boolean(row.in_app_enabled),
    emailEnabled: Boolean(row.email_enabled),
    smsEnabled: Boolean(row.sms_enabled),
    pushEnabled: Boolean(row.push_enabled),
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id || null,
  };
}

async function listPreferences(client, { churchId, memberId }) {
  const result = await client.query(
    `SELECT church_id, member_id, category, in_app_enabled, email_enabled,
            sms_enabled, push_enabled, updated_at, updated_by_user_id
       FROM blessboard.member_notification_preferences
      WHERE church_id = $1 AND member_id = $2`,
    [churchId, memberId]
  );
  const byCategory = new Map(result.rows.map((r) => [r.category, mapRow(r)]));
  return PREFERENCE_CATEGORIES.map((category) => {
    if (byCategory.has(category)) return byCategory.get(category);
    const def = defaultPreferences().find((d) => d.category === category);
    return {
      churchId,
      memberId,
      category,
      inAppEnabled: def.inAppEnabled,
      emailEnabled: def.emailEnabled,
      smsEnabled: def.smsEnabled,
      pushEnabled: def.pushEnabled,
      updatedAt: null,
      updatedByUserId: null,
      isDefault: true,
    };
  });
}

async function upsertPreferences(client, input) {
  const rows = [];
  for (const pref of input.preferences || []) {
    const result = await client.query(
      `INSERT INTO blessboard.member_notification_preferences (
         church_id, member_id, category, in_app_enabled, email_enabled,
         sms_enabled, push_enabled, updated_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (church_id, member_id, category) DO UPDATE SET
         in_app_enabled = EXCLUDED.in_app_enabled,
         email_enabled = EXCLUDED.email_enabled,
         sms_enabled = EXCLUDED.sms_enabled,
         push_enabled = EXCLUDED.push_enabled,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = now()
       RETURNING church_id, member_id, category, in_app_enabled, email_enabled,
                 sms_enabled, push_enabled, updated_at, updated_by_user_id`,
      [
        input.churchId,
        input.memberId,
        pref.category,
        pref.inAppEnabled !== false,
        Boolean(pref.emailEnabled),
        Boolean(pref.smsEnabled),
        Boolean(pref.pushEnabled),
        input.updatedByUserId || null,
      ]
    );
    rows.push(mapRow(result.rows[0]));
  }
  return rows;
}

module.exports = {
  mapRow,
  listPreferences,
  upsertPreferences,
};
