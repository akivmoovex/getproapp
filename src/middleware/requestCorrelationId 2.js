"use strict";

const crypto = require("crypto");

const HEADER_NAMES = ["x-request-id", "x-correlation-id"];
const SAFE_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Attach a request correlation id early in the middleware stack.
 * Honours inbound X-Request-Id / X-Correlation-Id when safe; otherwise generates one.
 */
function requestCorrelationId(req, res, next) {
  let id = null;
  for (const name of HEADER_NAMES) {
    const raw = req.headers[name];
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    if (candidate && SAFE_ID_RE.test(String(candidate).trim())) {
      id = String(candidate).trim();
      break;
    }
  }
  if (!id) {
    id = `bb_${crypto.randomBytes(12).toString("hex")}`;
  }
  req.correlationId = id;
  res.locals.correlationId = id;
  try {
    res.setHeader("X-Request-Id", id);
  } catch {
    /* headers may already be sent in edge cases */
  }
  return next();
}

function getCorrelationId(req) {
  if (req && req.correlationId) return String(req.correlationId);
  if (req && req.res && req.res.locals && req.res.locals.correlationId) {
    return String(req.res.locals.correlationId);
  }
  return null;
}

module.exports = {
  requestCorrelationId,
  getCorrelationId,
  SAFE_ID_RE,
};
