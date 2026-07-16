"use strict";

const OFFLINE_CLIENT_ITEM_PATTERN = /^[a-zA-Z0-9._-]{8,128}$/;

function parseOfflineCheckInItem(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    client_item_id: String(item.client_item_id || "").trim(),
    service_session_id: Number(item.service_session_id),
    member_id: item.member_id != null ? Number(item.member_id) : null,
    check_in_kind: String(item.check_in_kind || "member").trim(),
    visitor_name: String(item.visitor_name || "").trim(),
    visitor_phone: String(item.visitor_phone || "").trim(),
    captured_at_client: String(item.captured_at_client || "").trim(),
    capture_source: String(item.capture_source || "").trim().slice(0, 200),
  };
}

function validateOfflineCheckInItem(item) {
  if (!item.client_item_id || !OFFLINE_CLIENT_ITEM_PATTERN.test(item.client_item_id)) {
    return { ok: false, error: "Each queued item needs a stable client_item_id (8–128 characters)." };
  }
  if (!Number.isFinite(item.service_session_id) || item.service_session_id <= 0) {
    return { ok: false, error: "service_session_id is required for each queued item." };
  }
  if (!item.captured_at_client || Number.isNaN(Date.parse(item.captured_at_client))) {
    return { ok: false, error: "captured_at_client must be a valid ISO timestamp." };
  }
  if (!item.capture_source) {
    return { ok: false, error: "capture_source is required (device identifier)." };
  }
  if (item.check_in_kind === "member") {
    if (!Number.isFinite(item.member_id) || item.member_id <= 0) {
      return { ok: false, error: "member_id is required for member offline check-ins." };
    }
  } else if (item.check_in_kind === "visitor") {
    if (!item.visitor_name) {
      return { ok: false, error: "visitor_name is required for visitor offline check-ins." };
    }
  } else {
    return { ok: false, error: "check_in_kind must be member or visitor." };
  }
  return { ok: true, item };
}

function normalizeOfflineItems(body) {
  const b = body && typeof body === "object" ? body : {};
  if (Array.isArray(b.items)) return b.items;
  if (b.items && typeof b.items === "object") {
    return Object.keys(b.items)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => b.items[k]);
  }
  return [];
}

function validateOfflineBatchBody(body) {
  const rawItems = normalizeOfflineItems(body);
  if (rawItems.length === 0) {
    return { ok: false, error: "At least one offline item is required.", items: [] };
  }
  if (rawItems.length > 100) {
    return { ok: false, error: "Maximum 100 items per sync batch.", items: [] };
  }
  const items = [];
  for (const raw of rawItems) {
    const parsed = parseOfflineCheckInItem(raw);
    const check = validateOfflineCheckInItem(parsed);
    if (!check.ok) return { ok: false, error: check.error, items: [] };
    items.push(check.item);
  }
  return { ok: true, items };
}

function validateBranchRulesBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const thresholdRaw = String(b.absence_threshold_weeks || "").trim();
  let absence_threshold_weeks = null;
  if (thresholdRaw) {
    const n = Number(thresholdRaw);
    if (!Number.isFinite(n) || n < 1 || n > 52) {
      return { ok: false, error: "Absence threshold must be between 1 and 52 weeks, or blank." };
    }
    absence_threshold_weeks = Math.floor(n);
  }
  return {
    ok: true,
    data: {
      absence_threshold_weeks,
      allow_multiple_services_per_day: String(b.allow_multiple_services_per_day || "") === "1",
      cross_branch_guest_enabled: String(b.cross_branch_guest_enabled || "") === "1",
    },
  };
}

function validateExemptionBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const memberId = Number(b.member_id);
  const effectiveFrom = String(b.effective_from || "").trim();
  const effectiveTo = String(b.effective_to || "").trim();
  if (!Number.isFinite(memberId) || memberId <= 0) {
    return { ok: false, error: "Member is required." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return { ok: false, error: "Effective from date is required." };
  }
  if (effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) {
    return { ok: false, error: "Effective to must be YYYY-MM-DD." };
  }
  return {
    ok: true,
    data: {
      member_id: memberId,
      reason: String(b.reason || "").trim().slice(0, 2000),
      effective_from: effectiveFrom,
      effective_to: effectiveTo || null,
    },
  };
}

function validateCrossBranchAuthBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const memberId = Number(b.member_id);
  const guestBranchId = Number(b.guest_branch_id);
  const effectiveFrom = String(b.effective_from || new Date().toISOString().slice(0, 10)).trim();
  if (!Number.isFinite(memberId) || memberId <= 0) {
    return { ok: false, error: "Member is required." };
  }
  if (!Number.isFinite(guestBranchId) || guestBranchId <= 0) {
    return { ok: false, error: "Guest branch is required." };
  }
  return {
    ok: true,
    data: {
      member_id: memberId,
      guest_branch_id: guestBranchId,
      effective_from: effectiveFrom,
      effective_to: String(b.effective_to || "").trim() || null,
    },
  };
}

module.exports = {
  validateOfflineBatchBody,
  validateBranchRulesBody,
  validateExemptionBody,
  validateCrossBranchAuthBody,
  parseOfflineCheckInItem,
};
