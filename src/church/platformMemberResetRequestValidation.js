"use strict";

function parseRequestId(value) {
  const requestId = Number(value);
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return { ok: false, error: "Invalid request ID." };
  }
  return { ok: true, requestId: Math.floor(requestId) };
}

function parseSafeReturnTo(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, returnTo: null };
  if (!raw.startsWith("/admin/church") || raw.includes("//") || raw.includes("..")) {
    return { ok: true, returnTo: null };
  }
  return { ok: true, returnTo: raw.slice(0, 500) };
}

function parseMemberResetRequestParams(params, query) {
  const idParsed = parseRequestId(params && params.requestId);
  if (!idParsed.ok) {
    return { ok: false, errors: [idParsed.error] };
  }
  const returnParsed = parseSafeReturnTo(query && query.return_to);
  return {
    ok: true,
    errors: [],
    data: {
      requestId: idParsed.requestId,
      returnTo: returnParsed.returnTo,
    },
  };
}

module.exports = {
  parseRequestId,
  parseSafeReturnTo,
  parseMemberResetRequestParams,
};
