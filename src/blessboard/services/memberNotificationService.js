"use strict";

/**
 * Member notification inbox + preference services.
 */

const notificationRepo = require("../repositories/memberNotificationRepository");
const preferenceRepo = require("../repositories/notificationPreferenceRepository");
const {
  INBOX_CATEGORIES,
  PREFERENCE_CATEGORIES,
  preferencesForPreset,
  PREFERENCE_PRESETS,
} = require("../messaging/messageConstants");
const {
  getDeliveryChannelAvailability,
} = require("../messaging/deliveryChannelAvailability");
const { maskEmail, maskPhone, renderSafeMessageBodyHtml } = require("../messaging/messageSanitize");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
});

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

async function listInbox(db, opts) {
  const category = String(opts.category || "all");
  if (!INBOX_CATEGORIES.includes(category)) {
    return { status: STATUS.INVALID_INPUT, reason: "category" };
  }
  return withClient(db, async (client) => {
    const listed = await notificationRepo.listForMember(client, {
      churchId: opts.churchId,
      memberId: opts.memberId,
      category,
      unreadOnly: Boolean(opts.unreadOnly),
      limit: opts.limit,
      offset: opts.offset,
    });
    return {
      status: STATUS.OK,
      ...listed,
      category,
      items: listed.items.map((item) => ({
        ...item,
        bodyHtml: renderSafeMessageBodyHtml(item.body),
      })),
    };
  });
}

async function getNotification(db, opts) {
  return withClient(db, async (client) => {
    const item = await notificationRepo.getForMember(client, opts);
    if (!item) return { status: STATUS.NOT_FOUND };
    return {
      status: STATUS.OK,
      item: {
        ...item,
        bodyHtml: renderSafeMessageBodyHtml(item.body),
      },
    };
  });
}

async function markRead(db, opts) {
  return withClient(db, async (client) => {
    const item = await notificationRepo.markRead(client, opts);
    if (!item) return { status: STATUS.NOT_FOUND };
    return { status: STATUS.OK, item };
  });
}

async function markUnread(db, opts) {
  return withClient(db, async (client) => {
    const item = await notificationRepo.markUnread(client, opts);
    if (!item) return { status: STATUS.NOT_FOUND };
    return { status: STATUS.OK, item };
  });
}

async function markAllRead(db, opts) {
  return withClient(db, async (client) => {
    const result = await notificationRepo.markAllRead(client, opts);
    return { status: STATUS.OK, ...result };
  });
}

async function archiveNotification(db, opts) {
  return withClient(db, async (client) => {
    const item = await notificationRepo.archive(client, opts);
    if (!item) return { status: STATUS.NOT_FOUND };
    return { status: STATUS.OK, item };
  });
}

async function getPreferences(db, opts) {
  return withClient(db, async (client) => {
    const preferences = await preferenceRepo.listPreferences(client, {
      churchId: opts.churchId,
      memberId: opts.memberId,
    });
    const member = await client.query(
      `SELECT email_display, email_normalized, phone_display, phone_normalized
         FROM blessboard.members
        WHERE id = $1 AND church_id = $2`,
      [opts.memberId, opts.churchId]
    );
    const row = member.rows[0] || {};
    const availability = getDeliveryChannelAvailability(opts.env);
    return {
      status: STATUS.OK,
      preferences,
      availability,
      contact: {
        emailMasked: maskEmail(row.email_display || row.email_normalized),
        phoneMasked: maskPhone(row.phone_display || row.phone_normalized),
        hasEmail: Boolean(row.email_normalized),
        hasPhone: Boolean(row.phone_normalized),
        pushDevices: 0,
        pushStatus: availability.push.available ? "ready" : "not_available_yet",
      },
      presets: PREFERENCE_PRESETS,
    };
  });
}

function parsePrefBool(body, key, fallback) {
  if (body[key] == null) return fallback;
  return body[key] === true || body[key] === "1" || body[key] === "on" || body[key] === "true";
}

async function updatePreferences(db, opts) {
  const availability = getDeliveryChannelAvailability(opts.env);
  let rows;

  if (opts.preset && opts.preset !== "custom") {
    if (!PREFERENCE_PRESETS.includes(opts.preset)) {
      return { status: STATUS.INVALID_INPUT, reason: "preset" };
    }
    rows = preferencesForPreset(opts.preset);
  } else {
    rows = [];
    for (const category of PREFERENCE_CATEGORIES) {
      const prefix = category;
      rows.push({
        category,
        inAppEnabled: parsePrefBool(
          opts.body || {},
          `${prefix}__in_app`,
          true
        ),
        emailEnabled: parsePrefBool(opts.body || {}, `${prefix}__email`, false),
        smsEnabled: parsePrefBool(opts.body || {}, `${prefix}__sms`, false),
        pushEnabled: parsePrefBool(opts.body || {}, `${prefix}__push`, false),
      });
    }
  }

  // Enforce channel eligibility honestly.
  const memberContact = await withClient(db, async (client) => {
    const result = await client.query(
      `SELECT email_normalized, phone_normalized
         FROM blessboard.members WHERE id = $1 AND church_id = $2`,
      [opts.memberId, opts.churchId]
    );
    return result.rows[0] || {};
  });

  for (const row of rows) {
    row.inAppEnabled = true; // canonical letterbox remains on
    if (row.emailEnabled) {
      if (!availability.email.available || !memberContact.email_normalized) {
        row.emailEnabled = false;
      }
    }
    if (row.smsEnabled) {
      if (!availability.sms.available || !memberContact.phone_normalized) {
        row.smsEnabled = false;
      }
    }
    if (row.pushEnabled) {
      if (!availability.push.available) {
        row.pushEnabled = false;
      }
    }
  }

  return withClient(db, async (client) => {
    const saved = await preferenceRepo.upsertPreferences(client, {
      churchId: opts.churchId,
      memberId: opts.memberId,
      updatedByUserId: opts.updatedByUserId,
      preferences: rows,
    });
    return { status: STATUS.OK, preferences: saved };
  });
}

module.exports = {
  STATUS,
  listInbox,
  getNotification,
  markRead,
  markUnread,
  markAllRead,
  archiveNotification,
  getPreferences,
  updatePreferences,
};
