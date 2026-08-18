"use strict";

/**
 * ActiveClinic Resend HTTPS transport (Phase H2).
 * Native fetch only. No SDK. Never logs bodies, tokens, or API keys.
 */

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const FETCH_TIMEOUT_MS = 15000;

const STATUS = Object.freeze({
  QUEUED: "queued",
  FAILED: "failed",
  SENDING_UNAVAILABLE: "sending_unavailable",
});

const PROVIDER_CODE = Object.freeze({
  RESEND: "resend",
  INVALID_RECIPIENT: "invalid_recipient",
  AUTHENTICATION_FAILED: "authentication_failed",
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  RATE_LIMITED: "rate_limited",
  REQUEST_REJECTED: "request_rejected",
  CONFIGURATION_ERROR: "configuration_error",
  UNKNOWN: "unknown_provider_error",
});

function maskEmail(value) {
  const s = String(value || "").trim().toLowerCase();
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

function failedResult(providerCode, extra) {
  return {
    sendingAvailable: true,
    accepted: false,
    delivered: false,
    status: STATUS.FAILED,
    providerCode,
    ...(extra || {}),
  };
}

function classifyResendFailure(httpStatus, errorName) {
  const status = Number(httpStatus) || 0;
  const name = String(errorName || "").trim().toLowerCase();
  if (status === 401 || status === 403 || name.includes("api_key") || name.includes("unauthorized")) {
    return PROVIDER_CODE.AUTHENTICATION_FAILED;
  }
  if (status === 429 || name.includes("rate_limit")) {
    return PROVIDER_CODE.RATE_LIMITED;
  }
  if (name.includes("invalid_from") || name.includes("from_address")) {
    return PROVIDER_CODE.CONFIGURATION_ERROR;
  }
  if (
    name.includes("invalid_to") ||
    name.includes("to_address") ||
    name.includes("invalid_recipient")
  ) {
    return PROVIDER_CODE.INVALID_RECIPIENT;
  }
  if (status >= 500 || status === 408) {
    return PROVIDER_CODE.PROVIDER_UNAVAILABLE;
  }
  if (status === 409 && name.includes("concurrent")) {
    return PROVIDER_CODE.PROVIDER_UNAVAILABLE;
  }
  if (status >= 400) {
    return PROVIDER_CODE.REQUEST_REJECTED;
  }
  return PROVIDER_CODE.UNKNOWN;
}

function pickErrorName(json) {
  if (!json || typeof json !== "object") return "";
  return String(json.name || json.error || json.type || "").trim();
}

function pickProviderMessageId(json) {
  if (!json || typeof json !== "object") return null;
  const id = json.id != null ? String(json.id).trim() : "";
  return id || null;
}

async function readJsonObject(response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function emitSafeLog(log, fields) {
  if (typeof log !== "function") return;
  log({
    adapter: "resend",
    templateKey: fields.templateKey || null,
    recipientMasked: fields.recipient ? maskEmail(fields.recipient) : null,
    status: fields.status || null,
    providerCode: fields.providerCode || null,
    idempotencyKey: fields.idempotencyKey || null,
    providerMessageId: fields.providerMessageId || null,
  });
}

function createResendAdapter(opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const apiKey = String(options.apiKey || "").trim();
  const from = String(options.from || "").trim();
  const replyTo = options.replyTo ? String(options.replyTo).trim() : "";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const log = options.log;

  const configured =
    Boolean(apiKey) && Boolean(from) && typeof fetchImpl === "function";

  return Object.freeze({
    id: "activeclinic_email_resend",
    sendingAvailable: configured,
    async send(envelope) {
      const src = envelope && typeof envelope === "object" ? envelope : {};
      const recipient = String(src.recipient || "").trim().toLowerCase();
      const idempotencyKey = src.idempotencyKey ? String(src.idempotencyKey).trim() : "";
      const templateKey = src.templateKey ? String(src.templateKey) : null;

      if (!configured) {
        const result = {
          sendingAvailable: false,
          accepted: false,
          delivered: false,
          status: STATUS.SENDING_UNAVAILABLE,
          providerCode: PROVIDER_CODE.CONFIGURATION_ERROR,
        };
        emitSafeLog(log, {
          templateKey,
          recipient,
          idempotencyKey,
          status: result.status,
          providerCode: result.providerCode,
        });
        return result;
      }

      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      if (idempotencyKey && idempotencyKey.length <= 256) {
        headers["Idempotency-Key"] = idempotencyKey;
      }

      const payload = {
        from,
        to: [recipient],
        subject: String(src.subject || ""),
        text: String(src.text || ""),
        html: String(src.html || ""),
      };
      if (replyTo) payload.reply_to = replyTo;

      let response;
      try {
        const init = {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        };
        if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
          init.signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
        }
        response = await fetchImpl(RESEND_EMAILS_URL, init);
      } catch {
        const result = failedResult(PROVIDER_CODE.PROVIDER_UNAVAILABLE);
        emitSafeLog(log, {
          templateKey,
          recipient,
          idempotencyKey,
          status: result.status,
          providerCode: result.providerCode,
        });
        return result;
      }

      const json = await readJsonObject(response);
      const httpStatus = Number(response && response.status) || 0;
      const ok = Boolean(response && response.ok) && httpStatus >= 200 && httpStatus < 300;
      const providerMessageId = pickProviderMessageId(json);

      if (ok && providerMessageId) {
        const result = {
          sendingAvailable: true,
          accepted: true,
          delivered: false,
          status: STATUS.QUEUED,
          providerCode: PROVIDER_CODE.RESEND,
          providerMessageId,
        };
        emitSafeLog(log, {
          templateKey,
          recipient,
          idempotencyKey,
          status: result.status,
          providerCode: result.providerCode,
          providerMessageId,
        });
        return result;
      }

      if (ok && !providerMessageId) {
        const result = failedResult(PROVIDER_CODE.UNKNOWN);
        emitSafeLog(log, {
          templateKey,
          recipient,
          idempotencyKey,
          status: result.status,
          providerCode: result.providerCode,
        });
        return result;
      }

      const result = failedResult(classifyResendFailure(httpStatus, pickErrorName(json)));
      emitSafeLog(log, {
        templateKey,
        recipient,
        idempotencyKey,
        status: result.status,
        providerCode: result.providerCode,
      });
      return result;
    },
  });
}

module.exports = {
  RESEND_EMAILS_URL,
  PROVIDER_CODE,
  createResendAdapter,
};
