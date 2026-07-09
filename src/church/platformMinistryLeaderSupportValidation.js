"use strict";

function parseLeaderId(value) {
  const leaderId = Number(value);
  if (!Number.isFinite(leaderId) || leaderId <= 0) {
    return { ok: false, error: "Invalid ministry leader ID." };
  }
  return { ok: true, leaderId: Math.floor(leaderId) };
}

function parseSafeReturnTo(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, returnTo: null };
  if (!raw.startsWith("/admin/church") || raw.includes("//") || raw.includes("..")) {
    return { ok: true, returnTo: null };
  }
  return { ok: true, returnTo: raw.slice(0, 500) };
}

function parseMinistryLeaderSupportParams(params, query) {
  const idParsed = parseLeaderId(params && params.leaderId);
  if (!idParsed.ok) {
    return { ok: false, errors: [idParsed.error] };
  }
  const branchIdRaw = params && params.branchId;
  let branchId = null;
  if (branchIdRaw != null && String(branchIdRaw).trim() !== "") {
    const branchParsed = parseLeaderId(branchIdRaw);
    if (!branchParsed.ok) {
      return { ok: false, errors: ["Invalid branch ID."] };
    }
    branchId = branchParsed.leaderId;
  }
  const returnParsed = parseSafeReturnTo(query && query.return_to);
  return {
    ok: true,
    errors: [],
    data: {
      leaderId: idParsed.leaderId,
      branchId,
      returnTo: returnParsed.returnTo,
    },
  };
}

module.exports = {
  parseLeaderId,
  parseSafeReturnTo,
  parseMinistryLeaderSupportParams,
};
