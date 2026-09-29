"use strict";

/**
 * Thin notification abstraction.
 * Products register channel adapters; platform never owns member/patient inboxes.
 * Default behaviour is a structured no-op result (safe for tests / missing adapters).
 */

const { rejectForgedTenantIdentifiers } = require("../rbac/sharedTenantScope");

/** @type {Map<string, Function>} */
const channelHandlers = new Map();

const CHANNELS = Object.freeze(["email", "sms", "in_app", "webhook"]);

/**
 * @param {string} channel
 * @param {(payload: object) => Promise<object>|object} handler
 */
function registerNotificationChannel(channel, handler) {
  const key = String(channel || "")
    .trim()
    .toLowerCase();
  if (!CHANNELS.includes(key)) {
    return { ok: false, code: "invalid_channel" };
  }
  if (typeof handler !== "function") {
    return { ok: false, code: "invalid_handler" };
  }
  channelHandlers.set(key, handler);
  return { ok: true, code: "ok", channel: key };
}

function clearNotificationChannels() {
  channelHandlers.clear();
}

function listRegisteredNotificationChannels() {
  return Array.from(channelHandlers.keys()).sort();
}

/**
 * @param {{
 *   productCode: string,
 *   organizationId: string,
 *   channel: string,
 *   templateKey: string,
 *   recipientRef: string,
 *   payload?: object,
 *   trusted?: object,
 *   body?: object,
 *   query?: object,
 * }} input
 */
async function dispatchNotification(input) {
  const src = input && typeof input === "object" ? input : {};
  const productCode = String(src.productCode || "")
    .trim()
    .toLowerCase();
  if (productCode !== "blessboard" && productCode !== "activeclinic") {
    return { ok: false, code: "invalid_product_code" };
  }
  const organizationId = String(src.organizationId || "").trim();
  if (!organizationId) {
    return { ok: false, code: "tenant_unresolved", httpStatus: 403 };
  }
  const forged = rejectForgedTenantIdentifiers({
    body: src.body,
    query: src.query,
    trusted: Object.assign({ organizationId }, src.trusted || {}),
    allowMatchingTrusted: true,
  });
  if (!forged.ok) return forged;

  const channel = String(src.channel || "")
    .trim()
    .toLowerCase();
  if (!CHANNELS.includes(channel)) {
    return { ok: false, code: "invalid_channel" };
  }
  const templateKey = String(src.templateKey || "").trim();
  const recipientRef = String(src.recipientRef || "").trim();
  if (!templateKey || templateKey.length > 120) {
    return { ok: false, code: "invalid_template_key" };
  }
  if (!recipientRef || recipientRef.length > 200) {
    return { ok: false, code: "invalid_recipient_ref" };
  }

  const envelope = {
    productCode,
    organizationId,
    channel,
    templateKey,
    recipientRef,
    payload:
      src.payload && typeof src.payload === "object" && !Array.isArray(src.payload)
        ? src.payload
        : {},
    facilityId: src.trusted && src.trusted.facilityId ? src.trusted.facilityId : null,
    branchId: src.trusted && src.trusted.branchId ? src.trusted.branchId : null,
  };

  const handler = channelHandlers.get(channel);
  if (!handler) {
    return {
      ok: true,
      code: "queued_noop",
      delivered: false,
      reason: "no_adapter",
      envelope,
    };
  }

  try {
    const result = await handler(envelope);
    return {
      ok: true,
      code: "dispatched",
      delivered: result && result.delivered === true,
      adapterResult: result && typeof result === "object" ? result : { raw: result },
      envelope,
    };
  } catch (err) {
    return {
      ok: false,
      code: "dispatch_failed",
      delivered: false,
      message: "Notification dispatch failed.",
      envelope,
    };
  }
}

module.exports = {
  CHANNELS,
  registerNotificationChannel,
  clearNotificationChannels,
  listRegisteredNotificationChannels,
  dispatchNotification,
};
