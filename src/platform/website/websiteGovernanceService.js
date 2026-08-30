"use strict";

/**
 * Post-publication website governance for Platform Admin / CSR.
 * Approval is secondary and never gates the customer's initial go-live.
 * Hide maps to existing offline. Block maps to existing suspended.
 * Revert is restore-as-new (immutable history).
 */

const instanceRepo = require("./instanceRepository");
const versionService = require("./versionService");
const { recordWebsiteAudit } = require("./auditService");
const { recordModerationEvent, listModerationEvents, ACTION } = require("./moderationEventService");
const {
  takeWebsiteOffline,
  suspendWebsite,
  restoreWebsiteAvailability,
} = require("./lifecycleService");
const { restoreWebsiteVersionLive } = require("./publicationService");
const { LIFECYCLE_STATUS } = require("./lifecycleStatus");
const { buildVersionDiff } = require("./reviewDiff");
const { getWebsiteTemplate } = require("./templateRegistry");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
} = require("./publicWebsiteUrl");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REVIEW_STATUS = Object.freeze({
  UNREVIEWED: "unreviewed",
  APPROVED: "approved",
});

const WEBSITE_STATUS = Object.freeze({
  LIVE: "live",
  HIDDEN: "hidden",
  BLOCKED: "blocked",
});

const WEBSITE_STATUS_LABEL = Object.freeze({
  [WEBSITE_STATUS.LIVE]: "Live",
  [WEBSITE_STATUS.HIDDEN]: "Hidden",
  [WEBSITE_STATUS.BLOCKED]: "Blocked",
});

const REVIEW_STATUS_LABEL = Object.freeze({
  [REVIEW_STATUS.UNREVIEWED]: "Unreviewed",
  [REVIEW_STATUS.APPROVED]: "Approved",
});

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "website_instance_not_found",
  VERSION_NOT_FOUND: "website_version_not_found",
  REASON_REQUIRED: "reason_required",
});

function websiteStatusFromLifecycle(lifecycleStatus) {
  if (lifecycleStatus === LIFECYCLE_STATUS.OFFLINE) return WEBSITE_STATUS.HIDDEN;
  if (lifecycleStatus === LIFECYCLE_STATUS.SUSPENDED) return WEBSITE_STATUS.BLOCKED;
  return WEBSITE_STATUS.LIVE;
}

function productLabel(productCode) {
  if (productCode === PRODUCT_CODE.ACTIVECLINIC) return "ActiveClinic";
  if (productCode === PRODUCT_CODE.BLESSBOARD) return "BlessBoard";
  return productCode || "—";
}

function reasonText(raw) {
  const text = String(raw == null ? "" : raw).trim();
  return text ? text.slice(0, 500) : "";
}

function actorMeta(input) {
  return {
    actorIdentityId: (input && input.actorIdentityId) || null,
    actorRole: input && input.actorRole ? String(input.actorRole).slice(0, 80) : null,
    actorDisplayName:
      input && input.actorDisplayName ? String(input.actorDisplayName).slice(0, 120) : null,
  };
}

async function loadInstance(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: RESULT.NOT_FOUND, instance: null };
  return { ok: true, instance };
}

/**
 * Current published version, latest approved version, previous approved version.
 * Approval events are append-only; a later publish does not erase them.
 */
async function resolveApprovedVersions(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instanceId = String((input && input.instanceId) || "");
  const listed = await versionService.listWebsiteVersions(db, { instanceId, organizationId });
  const versions = listed.versions || [];
  const currentPublished = versions.find((row) => row.status === "published") || null;
  const events = await listModerationEvents(db, {
    organizationId,
    instanceId,
    limit: 400,
  });
  const seen = new Set();
  const approved = [];
  for (const event of events.events || []) {
    if (event.actionKey !== ACTION.APPROVE_VERSION) continue;
    const versionId = event.targetVersionId;
    if (!versionId || seen.has(versionId)) continue;
    seen.add(versionId);
    const match = versions.find((row) => String(row.id) === String(versionId));
    if (match) {
      approved.push({
        version: match,
        approvedAt: event.createdAt,
        reviewerIdentityId: event.actorIdentityId,
        note: event.notes || event.reason || null,
        eventId: event.id,
        reviewerDisplayName:
          (event.metadata && (event.metadata.reviewer_display_name || event.metadata.actor_display_name)) ||
          null,
      });
    }
  }
  return {
    ok: true,
    currentPublished,
    lastApproved: approved[0] || null,
    previousApproved: approved[1] || null,
    approvedHistory: approved,
    versions,
  };
}

function reviewStatusForVersion(versionId, lastApproved) {
  if (
    versionId &&
    lastApproved &&
    lastApproved.version &&
    String(lastApproved.version.id) === String(versionId)
  ) {
    return REVIEW_STATUS.APPROVED;
  }
  return REVIEW_STATUS.UNREVIEWED;
}

async function listRecentWebsitePublications(db, input) {
  const params = [];
  const where = ["i.status <> 'archived'"];
  if (input && input.productCode) {
    params.push(String(input.productCode));
    where.push(`i.product_code = $${params.length}`);
  }
  if (input && input.organizationId && UUID_RE.test(String(input.organizationId))) {
    params.push(input.organizationId);
    where.push(`i.organization_id = $${params.length}`);
  }
  params.push(Math.min(Math.max(Number(input && input.limit) || 80, 1), 200));
  const sql = `
    SELECT v.id,
           v.version_number,
           v.published_at,
           v.status AS version_status,
           COALESCE(v.editor_identity_id, v.submitter_identity_id) AS editor_identity_id,
           i.id AS instance_id,
           i.product_code,
           i.slug,
           i.lifecycle_status,
           i.organization_id,
           o.organization_key,
           o.display_name,
           live.id AS current_version_id,
           live.version_number AS current_version_number,
           approved.target_version_id AS last_approved_version_id,
           approved_v.version_number AS last_approved_version_number,
           approved.created_at AS last_approved_at
      FROM platform.website_versions v
      JOIN platform.website_instances i
        ON i.id = v.instance_id
      JOIN platform.organizations o
        ON o.id = i.organization_id
      LEFT JOIN LATERAL (
        SELECT pv.id, pv.version_number
          FROM platform.website_versions pv
         WHERE pv.instance_id = i.id
           AND pv.status = 'published'
         ORDER BY pv.version_number DESC
         LIMIT 1
      ) live ON true
      LEFT JOIN LATERAL (
        SELECT e.target_version_id, e.created_at
          FROM platform.website_moderation_events e
         WHERE e.instance_id = i.id
           AND e.action_key = '${ACTION.APPROVE_VERSION}'
           AND e.target_version_id IS NOT NULL
         ORDER BY e.created_at DESC
         LIMIT 1
      ) approved ON true
      LEFT JOIN platform.website_versions approved_v
        ON approved_v.id = approved.target_version_id
     WHERE ${where.join(" AND ")}
     ORDER BY v.published_at DESC
     LIMIT $${params.length}
  `;
  const rows = await db.query(sql, params);
  let publications = rows.rows.map((row) => {
    const websiteStatus = websiteStatusFromLifecycle(row.lifecycle_status);
    const reviewStatus =
      row.last_approved_version_id && String(row.last_approved_version_id) === String(row.current_version_id)
        ? REVIEW_STATUS.APPROVED
        : REVIEW_STATUS.UNREVIEWED;
    return {
      id: row.id,
      kind: "version",
      productCode: row.product_code,
      productLabel: productLabel(row.product_code),
      organizationId: row.organization_id,
      organizationKey: row.organization_key,
      organizationName: row.display_name,
      websiteName: row.display_name,
      instanceId: row.instance_id,
      slug: row.slug,
      publicPath: buildPublicOrganizationWebsitePath({
        product: row.product_code,
        organizationKey: row.organization_key,
      }),
      publishedByIdentityId: row.editor_identity_id,
      publishedAt: row.published_at,
      versionId: row.id,
      versionNumber: Number(row.version_number),
      currentVersionId: row.current_version_id,
      currentVersionNumber: row.current_version_number != null ? Number(row.current_version_number) : null,
      lastApprovedVersionId: row.last_approved_version_id,
      lastApprovedVersionNumber:
        row.last_approved_version_number != null ? Number(row.last_approved_version_number) : null,
      lastApprovedAt: row.last_approved_at,
      reviewStatus,
      reviewStatusLabel: REVIEW_STATUS_LABEL[reviewStatus],
      websiteStatus,
      websiteStatusLabel: WEBSITE_STATUS_LABEL[websiteStatus],
      lifecycleStatus: row.lifecycle_status,
    };
  });
  if (input && input.tenant) {
    const needle = String(input.tenant).toLowerCase();
    publications = publications.filter(
      (row) =>
        String(row.organizationKey || "").toLowerCase().includes(needle) ||
        String(row.organizationName || "").toLowerCase().includes(needle)
    );
  }
  if (input && input.reviewStatus === REVIEW_STATUS.UNREVIEWED) {
    publications = publications.filter((row) => row.reviewStatus === REVIEW_STATUS.UNREVIEWED);
  }
  if (input && input.reviewStatus === REVIEW_STATUS.APPROVED) {
    publications = publications.filter((row) => row.reviewStatus === REVIEW_STATUS.APPROVED);
  }
  if (input && input.websiteStatus && WEBSITE_STATUS_LABEL[input.websiteStatus]) {
    publications = publications.filter((row) => row.websiteStatus === input.websiteStatus);
  }
  return { ok: true, publications };
}

/**
 * Append-only post-publication approval. Does not change lifecycle or public access.
 */
async function approveWebsiteVersion(db, input) {
  const loaded = await loadInstance(db, input);
  if (!loaded.ok) return loaded;
  const instance = loaded.instance;
  const versionId = String((input && input.versionId) || "");
  if (!UUID_RE.test(versionId)) return { ok: false, code: RESULT.INVALID_INPUT, instance };
  const version = await versionService.getWebsiteVersion(db, {
    versionId,
    organizationId: instance.organizationId,
    instanceId: instance.id,
  });
  if (!version.ok) return { ok: false, code: RESULT.VERSION_NOT_FOUND, instance };
  const resolved = await resolveApprovedVersions(db, {
    organizationId: instance.organizationId,
    instanceId: instance.id,
  });
  const actor = actorMeta(input);
  const note = input && input.note ? String(input.note).trim().slice(0, 4000) : "";
  const previousReview =
    resolved.lastApproved && resolved.lastApproved.version
      ? resolved.lastApproved.version.id
      : REVIEW_STATUS.UNREVIEWED;
  await recordModerationEvent(db, {
    organizationId: instance.organizationId,
    instanceId: instance.id,
    productCode: instance.productCode,
    actorIdentityId: actor.actorIdentityId,
    actionKey: ACTION.APPROVE_VERSION,
    notes: note || null,
    notesTenantVisible: false,
    previousState: previousReview,
    newState: REVIEW_STATUS.APPROVED,
    targetVersionId: version.version.id,
    metadata: {
      reviewer_id: actor.actorIdentityId,
      reviewer_display_name: actor.actorDisplayName,
      actor_role: actor.actorRole,
      version_number: version.version.versionNumber,
    },
  });
  await recordWebsiteAudit(db, {
    organizationId: instance.organizationId,
    instanceId: instance.id,
    actorIdentityId: actor.actorIdentityId,
    actionKey: ACTION.APPROVE_VERSION,
    versionId: version.version.id,
    metadata: {
      actor_role: actor.actorRole,
      version_number: version.version.versionNumber,
      review_status: REVIEW_STATUS.APPROVED,
      previous: typeof previousReview === "string" ? String(previousReview).slice(0, 120) : "unreviewed",
      next: REVIEW_STATUS.APPROVED,
    },
  });
  return {
    ok: true,
    code: RESULT.OK,
    instance,
    version: version.version,
    reviewStatus: REVIEW_STATUS.APPROVED,
  };
}

async function hideWebsite(db, input) {
  const reason = reasonText(input && input.reason);
  if (!reason) return { ok: false, code: RESULT.REASON_REQUIRED, instance: null };
  const loaded = await loadInstance(db, input);
  if (!loaded.ok) return loaded;
  const actor = actorMeta(input);
  return takeWebsiteOffline(db, {
    ...input,
    ...actor,
    reason,
    notes: input.notes || reason,
    auditActionKey: "website.moderation.hide",
    moderationActionKey: ACTION.HIDE,
    previousStateOverride: websiteStatusFromLifecycle(loaded.instance.lifecycleStatus),
    newStateOverride: WEBSITE_STATUS.HIDDEN,
  });
}

async function unhideWebsite(db, input) {
  const loaded = await loadInstance(db, input);
  if (!loaded.ok) return loaded;
  const actor = actorMeta(input);
  return restoreWebsiteAvailability(db, {
    ...input,
    ...actor,
    lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    auditActionKey: "website.moderation.unhide",
    moderationActionKey: ACTION.UNHIDE,
    previousStateOverride: WEBSITE_STATUS.HIDDEN,
    newStateOverride: WEBSITE_STATUS.LIVE,
  });
}

async function blockWebsite(db, input) {
  const reason = reasonText(input && input.reason);
  if (!reason) return { ok: false, code: RESULT.REASON_REQUIRED, instance: null };
  const loaded = await loadInstance(db, input);
  if (!loaded.ok) return loaded;
  const actor = actorMeta(input);
  return suspendWebsite(db, {
    ...input,
    ...actor,
    reason,
    notes: input.notes || reason,
    editLocked: true,
    publishLocked: true,
    auditActionKey: "website.moderation.block",
    moderationActionKey: ACTION.BLOCK,
    previousStateOverride: websiteStatusFromLifecycle(loaded.instance.lifecycleStatus),
    newStateOverride: WEBSITE_STATUS.BLOCKED,
  });
}

async function unblockWebsite(db, input) {
  const loaded = await loadInstance(db, input);
  if (!loaded.ok) return loaded;
  const actor = actorMeta(input);
  return restoreWebsiteAvailability(db, {
    ...input,
    ...actor,
    lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    auditActionKey: "website.moderation.unblock",
    moderationActionKey: ACTION.UNBLOCK,
    previousStateOverride: WEBSITE_STATUS.BLOCKED,
    newStateOverride: WEBSITE_STATUS.LIVE,
  });
}

/**
 * Restore an approved (or explicitly chosen) version as a new published version.
 * Historical versions remain.
 */
async function revertToApprovedVersion(db, input) {
  const reason = reasonText(input && input.reason);
  if (!reason) return { ok: false, code: RESULT.REASON_REQUIRED, instance: null };
  const loaded = await loadInstance(db, input);
  if (!loaded.ok) return loaded;
  const instance = loaded.instance;
  const resolved = await resolveApprovedVersions(db, {
    organizationId: instance.organizationId,
    instanceId: instance.id,
  });
  const requestedId = String((input && input.versionId) || "");
  const target =
    (requestedId &&
      resolved.versions.find((row) => String(row.id) === requestedId)) ||
    (resolved.lastApproved && resolved.lastApproved.version) ||
    null;
  if (!target) return { ok: false, code: RESULT.VERSION_NOT_FOUND, instance };
  const actor = actorMeta(input);
  const restored = await restoreWebsiteVersionLive(db, {
    organizationId: instance.organizationId,
    instanceId: instance.id,
    versionId: target.id,
    actorIdentityId: actor.actorIdentityId,
    actorRole: actor.actorRole,
    reason,
    notes: reason,
    auditActionKey: ACTION.REVERT,
    moderationActionKey: ACTION.REVERT,
  });
  if (!restored.ok) return restored;
  return {
    ok: true,
    code: RESULT.OK,
    instance,
    version: restored.version,
    restoredFrom: restored.restoredFrom || target,
  };
}

function buildGovernanceReview(input) {
  const instance = input && input.instance;
  const template = instance
    ? getWebsiteTemplate(instance.templateId, instance.templateVersion)
    : input && input.template;
  const current = input && input.currentPublished;
  const approved = input && input.lastApproved && input.lastApproved.version;
  const previousSnapshot =
    approved && approved.snapshot
      ? approved.snapshot
      : (input && input.previousSnapshot) || {};
  const currentSnapshot = (current && current.snapshot) || (input && input.snapshot) || {};
  const diff = buildVersionDiff({
    snapshot: currentSnapshot,
    previousSnapshot,
    changedKeys: (current && current.changedKeys) || (input && input.changedKeys) || [],
    template,
  });
  const organizationKey = (input && input.organizationKey) || "";
  const productCode = (instance && instance.productCode) || (input && input.productCode) || "";
  const publicPath = organizationKey
    ? buildPublicOrganizationWebsitePath({
        product: productCode,
        organizationKey,
      })
    : "";
  return {
    ...diff,
    compareLabel: {
      previous: approved ? `Previous approved (v${approved.versionNumber})` : "Previous",
      current: current ? `Current published (v${current.versionNumber})` : "Current published",
    },
    visual: {
      previousApprovedPath:
        approved && organizationKey
          ? `/admin/organizations/${encodeURIComponent(organizationKey)}/website/versions/${approved.id}/preview`
          : null,
      currentPublishedPath: publicPath || null,
      currentSnapshotPath:
        current && organizationKey
          ? `/admin/organizations/${encodeURIComponent(organizationKey)}/website/versions/${current.id}/preview`
          : null,
    },
  };
}

module.exports = {
  REVIEW_STATUS,
  REVIEW_STATUS_LABEL,
  WEBSITE_STATUS,
  WEBSITE_STATUS_LABEL,
  RESULT,
  ACTION,
  websiteStatusFromLifecycle,
  productLabel,
  resolveApprovedVersions,
  reviewStatusForVersion,
  listRecentWebsitePublications,
  approveWebsiteVersion,
  hideWebsite,
  unhideWebsite,
  blockWebsite,
  unblockWebsite,
  revertToApprovedVersion,
  buildGovernanceReview,
};
