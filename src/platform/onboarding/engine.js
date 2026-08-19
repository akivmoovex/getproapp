"use strict";

/**
 * Shared post-registration onboarding engine.
 * Product adapters supply live step facts; this module owns status, skip,
 * resume cursor, persistence, and post-login / dashboard redirects.
 */

const { recordAuditEventSafe } = require("../services/auditEventService");
const { getOnboardingAdapter } = require("./adapters");
const {
  PRODUCT,
  STATUS,
  STEP_KIND,
  AUDIT_ACTION,
  isTerminalStatus,
  pathsForProduct,
} = require("./constants");
const repo = require("./repository");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeStep(raw, skippedSet) {
  const key = String((raw && raw.key) || "").trim();
  if (!key) return null;
  const kind = raw.kind === STEP_KIND.REQUIRED ? STEP_KIND.REQUIRED : STEP_KIND.RECOMMENDED;
  const skipped = skippedSet.has(key);
  const complete = raw.complete === true || skipped;
  const skippable = kind === STEP_KIND.RECOMMENDED || raw.skippable === true;
  return {
    key,
    label: String((raw && raw.label) || key),
    kind,
    complete,
    skipped,
    skippable,
    destinationUrl: raw.destinationUrl != null ? String(raw.destinationUrl) : null,
    explanation: raw.explanation != null ? String(raw.explanation) : null,
  };
}

function firstIncomplete(steps, kind) {
  return steps.find((s) => s.kind === kind && s.complete !== true) || null;
}

function resumeStepFrom(steps) {
  return firstIncomplete(steps, STEP_KIND.REQUIRED) || firstIncomplete(steps, STEP_KIND.RECOMMENDED) || null;
}

function requiredIncomplete(steps) {
  return steps.filter((s) => s.kind === STEP_KIND.REQUIRED && s.complete !== true);
}

async function writeAudit(db, input) {
  const deploymentCode = String((input && input.deploymentCode) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!deploymentCode || !UUID_RE.test(organizationId)) return;
  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId,
    actorUserId: input.actorUserId || null,
    actionKey: input.actionKey,
    entityType: "organization_onboarding",
    entityId: organizationId,
    outcome: "success",
    metadata: input.metadata || {},
  });
}

function buildEvaluation({ productCode, organizationId, progress, steps, canManage, storedTerminal }) {
  const paths = pathsForProduct(productCode);
  const required = steps.filter((s) => s.kind === STEP_KIND.REQUIRED);
  const recommended = steps.filter((s) => s.kind === STEP_KIND.RECOMMENDED);
  const requiredDone = required.length > 0 && required.every((s) => s.complete);
  const recommendedIncomplete = recommended.filter((s) => s.complete !== true);
  const storedStatus = storedTerminal || (progress && progress.status) || STATUS.NOT_STARTED;
  let status = storedStatus;
  if (!isTerminalStatus(storedStatus)) {
    if (requiredDone) status = STATUS.COMPLETED;
    else if (steps.some((s) => s.complete) || (progress && progress.startedAt)) {
      status = STATUS.IN_PROGRESS;
    } else {
      status = STATUS.NOT_STARTED;
    }
  }
  const resumeStep = isTerminalStatus(status) ? null : resumeStepFrom(steps);
  const onboardingRequired =
    canManage === true && !isTerminalStatus(status) && requiredIncomplete(steps).length > 0;
  const completedCount = steps.filter((s) => s.complete).length;
  return {
    ok: true,
    productCode,
    organizationId,
    status,
    storedStatus,
    onboardingRequired,
    canManage: canManage === true,
    steps,
    required,
    recommended,
    requiredComplete: required.filter((s) => s.complete).length,
    requiredTotal: required.length,
    recommendedIncomplete,
    resumeStep,
    currentStepKey: resumeStep ? resumeStep.key : null,
    completedCount,
    totalCount: steps.length,
    percentage: steps.length === 0 ? 0 : Math.round((completedCount / steps.length) * 100),
    dashboardPath: paths.dashboard,
    onboardingPath: paths.onboarding,
    startedAt: progress && progress.startedAt,
    completedAt: progress && progress.completedAt,
    lastResumedAt: progress && progress.lastResumedAt,
    skippedStepKeys: progress && Array.isArray(progress.skippedStepKeys) ? progress.skippedStepKeys : [],
  };
}

/**
 * Honor deep links into setup; never bounce a completed org back into onboarding.
 * Dashboard (or empty) requests go to onboarding while required steps remain.
 */
function applyOnboardingRedirect(input) {
  const evaluation = input && input.evaluation;
  const paths = evaluation
    ? { dashboard: evaluation.dashboardPath, onboarding: evaluation.onboardingPath }
    : pathsForProduct(input && input.productCode);
  if (!paths) return input && input.requestedPath ? String(input.requestedPath) : "/";
  const requestedRaw = input && input.requestedPath != null ? String(input.requestedPath).trim() : "";
  const requested = requestedRaw || paths.dashboard;
  if (!evaluation) return requested;

  const isOnboardingPath =
    requested === paths.onboarding || requested.startsWith(`${paths.onboarding}/`);
  if (isTerminalStatus(evaluation.status) || evaluation.onboardingRequired !== true) {
    if (isOnboardingPath) return paths.dashboard;
    return requested;
  }
  if (requested === paths.dashboard || requested === "/" || isOnboardingPath) {
    return paths.onboarding;
  }
  return requested;
}

async function evaluateOrganizationOnboarding(db, input) {
  const productCode = String((input && input.productCode) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const adapter = getOnboardingAdapter(productCode);
  if (!adapter || !UUID_RE.test(organizationId)) {
    return { ok: false, reason: "invalid_scope" };
  }
  const persist = input.persist !== false;
  const markResumed = input.markResumed === true;
  const [listed, progress, storedTerminal] = await Promise.all([
    adapter.listSteps(db, {
      organizationId,
      actor: input.actor || null,
    }),
    repo.getProgress(db, organizationId, productCode),
    adapter.getStoredTerminalStatus
      ? adapter.getStoredTerminalStatus(db, { organizationId })
      : Promise.resolve(null),
  ]);
  const skippedSet = new Set(
    ((progress && progress.skippedStepKeys) || []).map((k) => String(k))
  );
  const steps = (listed && Array.isArray(listed.steps) ? listed.steps : [])
    .map((raw) => normalizeStep(raw, skippedSet))
    .filter(Boolean);
  const canManage = adapter.canManage(input.actor || null) === true;
  const evaluation = buildEvaluation({
    productCode,
    organizationId,
    progress,
    steps,
    canManage,
    storedTerminal,
  });

  if (!persist) return evaluation;

  const becomingComplete =
    evaluation.status === STATUS.COMPLETED && !isTerminalStatus(evaluation.storedStatus);
  const becomingSkipped = evaluation.status === STATUS.SKIPPED;
  const nextStatus = evaluation.status;
  const saved = await repo.upsertProgress(db, {
    organizationId,
    productCode,
    status: nextStatus,
    currentStepKey: evaluation.currentStepKey,
    skippedStepKeys: evaluation.skippedStepKeys,
    markStarted: nextStatus !== STATUS.NOT_STARTED,
    markCompleted: nextStatus === STATUS.COMPLETED || becomingSkipped,
    markResumed,
    lastAuditAction: becomingComplete
      ? AUDIT_ACTION.COMPLETED
      : markResumed
        ? AUDIT_ACTION.RESUMED
        : AUDIT_ACTION.EVALUATED,
  });
  evaluation.startedAt = saved && saved.startedAt;
  evaluation.completedAt = saved && saved.completedAt;
  evaluation.lastResumedAt = saved && saved.lastResumedAt;
  evaluation.storedStatus = saved && saved.status;

  if (becomingComplete && typeof adapter.syncProductCompletion === "function") {
    try {
      await adapter.syncProductCompletion(db, {
        organizationId,
        status: STATUS.COMPLETED,
        completedAt: saved && saved.completedAt,
      });
    } catch {
      /* product follow-up row is best-effort */
    }
  }

  if (becomingComplete) {
    await writeAudit(db, {
      deploymentCode: input.deploymentCode || (listed && listed.deploymentCode),
      organizationId,
      actorUserId: input.actor && input.actor.userId,
      actionKey: "organization.onboarding.completed",
      metadata: { product_code: productCode, action: AUDIT_ACTION.COMPLETED },
    });
  }

  return evaluation;
}

async function skipOnboardingStep(db, input) {
  const evaluation = await evaluateOrganizationOnboarding(db, { ...input, persist: true });
  if (!evaluation.ok) return evaluation;
  if (evaluation.canManage !== true) {
    return { ok: false, reason: "forbidden", evaluation };
  }
  if (isTerminalStatus(evaluation.status)) {
    return { ok: true, skipped: false, evaluation };
  }
  const stepKey = String((input && input.stepKey) || "").trim();
  const step = evaluation.steps.find((s) => s.key === stepKey);
  if (!step) return { ok: false, reason: "unknown_step", evaluation };
  if (!step.skippable) return { ok: false, reason: "not_skippable", evaluation };
  const skippedStepKeys = [...new Set([...(evaluation.skippedStepKeys || []), stepKey])];
  await repo.upsertProgress(db, {
    organizationId: evaluation.organizationId,
    productCode: evaluation.productCode,
    status: evaluation.status === STATUS.NOT_STARTED ? STATUS.IN_PROGRESS : evaluation.status,
    currentStepKey: evaluation.currentStepKey,
    skippedStepKeys,
    markStarted: true,
    lastAuditAction: AUDIT_ACTION.STEP_SKIPPED,
  });
  await writeAudit(db, {
    deploymentCode: input.deploymentCode,
    organizationId: evaluation.organizationId,
    actorUserId: input.actor && input.actor.userId,
    actionKey: "organization.onboarding.step_skipped",
    metadata: { product_code: evaluation.productCode, step_key: stepKey.slice(0, 40) },
  });
  const next = await evaluateOrganizationOnboarding(db, { ...input, persist: true });
  return { ok: true, skipped: true, evaluation: next };
}

async function completeOrganizationOnboarding(db, input) {
  const evaluation = await evaluateOrganizationOnboarding(db, { ...input, persist: true });
  if (!evaluation.ok) return evaluation;
  if (evaluation.canManage !== true) {
    return { ok: false, reason: "forbidden", evaluation };
  }
  if (isTerminalStatus(evaluation.status)) {
    return { ok: true, evaluation };
  }
  if (requiredIncomplete(evaluation.steps).length > 0) {
    return { ok: false, reason: "required_incomplete", evaluation };
  }
  const saved = await repo.upsertProgress(db, {
    organizationId: evaluation.organizationId,
    productCode: evaluation.productCode,
    status: STATUS.COMPLETED,
    currentStepKey: null,
    skippedStepKeys: evaluation.skippedStepKeys,
    markStarted: true,
    markCompleted: true,
    lastAuditAction: AUDIT_ACTION.COMPLETED,
  });
  const adapter = getOnboardingAdapter(evaluation.productCode);
  if (adapter && typeof adapter.syncProductCompletion === "function") {
    try {
      await adapter.syncProductCompletion(db, {
        organizationId: evaluation.organizationId,
        status: STATUS.COMPLETED,
        completedAt: saved && saved.completedAt,
      });
    } catch {
      /* product follow-up row is best-effort */
    }
  }
  await writeAudit(db, {
    deploymentCode: input.deploymentCode,
    organizationId: evaluation.organizationId,
    actorUserId: input.actor && input.actor.userId,
    actionKey: "organization.onboarding.completed",
    metadata: { product_code: evaluation.productCode, action: AUDIT_ACTION.COMPLETED },
  });
  const next = await evaluateOrganizationOnboarding(db, { ...input, persist: true });
  return { ok: true, evaluation: next };
}

async function resolvePostLoginPath(db, input) {
  const evaluation = await evaluateOrganizationOnboarding(db, {
    ...input,
    persist: true,
  });
  const requestedPath = input && input.requestedPath != null ? input.requestedPath : null;
  if (!evaluation.ok) {
    const paths = pathsForProduct(input && input.productCode);
    return {
      ok: false,
      path: requestedPath || (paths && paths.dashboard) || "/",
      evaluation: null,
    };
  }
  return {
    ok: true,
    path: applyOnboardingRedirect({ evaluation, requestedPath }),
    evaluation,
  };
}

module.exports = {
  PRODUCT,
  STATUS,
  STEP_KIND,
  evaluateOrganizationOnboarding,
  skipOnboardingStep,
  completeOrganizationOnboarding,
  resolvePostLoginPath,
  applyOnboardingRedirect,
};
