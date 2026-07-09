"use strict";

function parseMemberId(value) {
  const memberId = Number(value);
  if (!Number.isFinite(memberId) || memberId <= 0) {
    return { ok: false, error: "Invalid member ID." };
  }
  return { ok: true, memberId };
}

function parseSafeReturnTo(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, returnTo: null };
  if (!raw.startsWith("/admin/") || raw.includes("//") || raw.includes("..")) {
    return { ok: true, returnTo: null };
  }
  return { ok: true, returnTo: raw.slice(0, 500) };
}

function parseMemberSupportParams(params, query) {
  const idParsed = parseMemberId(params && params.memberId);
  if (!idParsed.ok) {
    return { ok: false, errors: [idParsed.error] };
  }
  const returnParsed = parseSafeReturnTo(query && query.return_to);
  return {
    ok: true,
    errors: [],
    data: {
      memberId: idParsed.memberId,
      returnTo: returnParsed.returnTo,
    },
  };
}

module.exports = {
  parseMemberId,
  parseSafeReturnTo,
  parseMemberSupportParams,
};
