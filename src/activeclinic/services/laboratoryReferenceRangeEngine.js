"use strict";

/**
 * Configurable laboratory reference rules.
 * No numeric threshold is built in. A result is classified only when the
 * caller supplies an approved rule for the same organisation, facility,
 * test, and unit.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNIT_RE = /^[A-Za-z0-9/%^.\-]{1,40}$/;

function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value == null ? "" : value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function blank(value) {
  return value == null || String(value).trim() === "";
}

function validateReferenceRangeRule(rule, context) {
  const source = rule && typeof rule === "object" ? rule : {};
  const ctx = context && typeof context === "object" ? context : {};
  const organizationId = String(source.organizationId || "");
  const facilityId = String(source.facilityId || "");
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(facilityId)) {
    return { ok: false, status: "invalid", reason: "scope" };
  }
  if (ctx.organizationId && organizationId !== String(ctx.organizationId)) {
    return { ok: false, status: "cross_tenant", reason: "organization" };
  }
  if (ctx.facilityId && facilityId !== String(ctx.facilityId)) {
    return { ok: false, status: "cross_facility", reason: "facility" };
  }
  const unit = String(source.unit || "").trim();
  if (!UNIT_RE.test(unit)) return { ok: false, status: "invalid", reason: "unit" };
  const low = finiteNumber(source.low);
  const high = finiteNumber(source.high);
  if (low == null || high == null || !(low < high)) {
    return { ok: false, status: "invalid", reason: "bounds" };
  }
  const criticalLow = blank(source.criticalLow) ? null : finiteNumber(source.criticalLow);
  const criticalHigh = blank(source.criticalHigh) ? null : finiteNumber(source.criticalHigh);
  if (!blank(source.criticalLow) && criticalLow == null) {
    return { ok: false, status: "invalid", reason: "critical_low" };
  }
  if (!blank(source.criticalHigh) && criticalHigh == null) {
    return { ok: false, status: "invalid", reason: "critical_high" };
  }
  if (criticalLow != null && !(criticalLow < low)) {
    return { ok: false, status: "invalid", reason: "critical_low" };
  }
  if (criticalHigh != null && !(criticalHigh > high)) {
    return { ok: false, status: "invalid", reason: "critical_high" };
  }
  const testCode = String(source.testCode || "").trim();
  if (!testCode || testCode.length > 80) {
    return { ok: false, status: "invalid", reason: "test" };
  }
  const version = Number(source.version);
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, status: "invalid", reason: "version" };
  }
  const effectiveFromMs = Date.parse(source.effectiveFrom);
  if (!Number.isFinite(effectiveFromMs)) {
    return { ok: false, status: "invalid", reason: "effective_from" };
  }
  let effectiveUntilMs = null;
  if (!blank(source.effectiveUntil)) {
    effectiveUntilMs = Date.parse(source.effectiveUntil);
    if (!Number.isFinite(effectiveUntilMs) || effectiveUntilMs <= effectiveFromMs) {
      return { ok: false, status: "invalid", reason: "effective_until" };
    }
  }
  if (source.status !== "approved") {
    return { ok: false, status: "invalid", reason: "not_approved" };
  }
  const patientGroup = blank(source.patientGroup) ? null : String(source.patientGroup).trim();
  return {
    ok: true,
    status: "valid",
    rule: {
      id: source.id || null,
      organizationId,
      facilityId,
      testCode,
      unit,
      low,
      high,
      criticalLow,
      criticalHigh,
      version,
      effectiveFromMs,
      effectiveUntilMs,
      patientGroup,
      displayText: blank(source.displayText) ? null : String(source.displayText).slice(0, 200),
    },
  };
}

function emptyJudgement(status) {
  return {
    status,
    interpretation: null,
    isAbnormal: null,
    isCritical: null,
    configurationVersion: null,
    low: null,
    high: null,
  };
}

function interpretLaboratoryValue(input) {
  const source = input && typeof input === "object" ? input : {};
  const rules = Array.isArray(source.rules) ? source.rules : [];
  if (!rules.length) return emptyJudgement("unconfigured");
  const value = finiteNumber(source.value);
  const unit = String(source.unit || "").trim();
  const recordedAt = Date.parse(source.recordedAt);
  const testCode = String(source.testCode || "").trim();
  if (value == null || !UNIT_RE.test(unit) || !Number.isFinite(recordedAt) || !testCode) {
    return emptyJudgement("invalid");
  }

  const applicable = [];
  let sawOtherUnit = false;
  let sawOtherGroup = false;
  for (const candidate of rules) {
    const checked = validateReferenceRangeRule(candidate, source);
    if (checked.status === "cross_tenant" || checked.status === "cross_facility") {
      return emptyJudgement(checked.status);
    }
    if (!checked.ok) continue;
    const rule = checked.rule;
    if (rule.testCode !== testCode) continue;
    if (recordedAt < rule.effectiveFromMs) continue;
    if (rule.effectiveUntilMs != null && recordedAt >= rule.effectiveUntilMs) continue;
    if (rule.patientGroup && rule.patientGroup !== String(source.patientGroup || "")) {
      sawOtherGroup = true;
      continue;
    }
    if (rule.unit !== unit) {
      sawOtherUnit = true;
      continue;
    }
    applicable.push(rule);
  }
  if (!applicable.length && sawOtherUnit) return emptyJudgement("incompatible_unit");
  if (!applicable.length && sawOtherGroup) return emptyJudgement("not_applicable");
  if (!applicable.length) return emptyJudgement("unconfigured");
  const top = Math.max(...applicable.map((rule) => rule.version));
  const chosen = applicable.filter((rule) => rule.version === top);
  if (chosen.length !== 1) return emptyJudgement("conflict");
  const rule = chosen[0];
  let interpretation = "within_range";
  let isAbnormal = false;
  let isCritical = false;
  if (rule.criticalLow != null && value < rule.criticalLow) {
    interpretation = "critical_low";
    isAbnormal = true;
    isCritical = true;
  } else if (rule.criticalHigh != null && value > rule.criticalHigh) {
    interpretation = "critical_high";
    isAbnormal = true;
    isCritical = true;
  } else if (value < rule.low) {
    interpretation = "below_range";
    isAbnormal = true;
  } else if (value > rule.high) {
    interpretation = "above_range";
    isAbnormal = true;
  }
  return {
    status: "applicable",
    interpretation,
    isAbnormal,
    isCritical,
    configurationVersion: rule.version,
    low: rule.low,
    high: rule.high,
    displayText: rule.displayText,
  };
}

function retainLaboratoryInterpretation(previous, next, reassessAuthorized) {
  if (reassessAuthorized !== true) return previous == null ? null : previous;
  return next == null ? null : next;
}

module.exports = {
  validateReferenceRangeRule,
  interpretLaboratoryValue,
  retainLaboratoryInterpretation,
};
