"use strict";

/**
 * V2.01 Website Change Manager — shared backend foundation.
 *
 * Pending-change counts are derived from draft_value vs published_value on
 * platform.website_content (one distinct content key = one change). Save
 * operations are never counted. No independent counter table — no drift.
 *
 * Historical published versions (platform.website_versions) are read-only.
 * Field history is reconstructed from immutable snapshots + audit events.
 */

const contentService = require("./contentService");
const versionService = require("./versionService");
const mediaService = require("./mediaService");
const { authorizeWebsiteAction } = require("./authorizeWebsite");
const { PERMISSIONS, canViewWebsiteAdmin } = require("./permissions");
const { CONTENT_TYPES } = require("./contentTypes");
const { getWebsiteTemplate, getContentKeyDef } = require("./templateRegistry");
const { buildVersionDiff } = require("./reviewDiff");

const RESULT = Object.freeze({
  OK: "ok",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "website_instance_not_found",
  TENANT_MISMATCH: "tenant_mismatch",
  INVALID_INPUT: "invalid_input",
});

/** Content types that can appear in version snapshots / draft rows for field history. */
const FIELD_HISTORY_CONTENT_TYPES = Object.freeze([
  CONTENT_TYPES.SHORT_TEXT,
  CONTENT_TYPES.LONG_TEXT,
  CONTENT_TYPES.RICH_TEXT,
  CONTENT_TYPES.IMAGE,
  CONTENT_TYPES.VIDEO_URL,
  CONTENT_TYPES.URL,
  CONTENT_TYPES.EMAIL,
  CONTENT_TYPES.PHONE,
  CONTENT_TYPES.BOOLEAN,
  CONTENT_TYPES.ENUM,
  CONTENT_TYPES.STRUCTURED,
]);

function authFailureCode(code) {
  if (code === "forbidden") return RESULT.FORBIDDEN;
  if (code === "tenant_mismatch") return RESULT.TENANT_MISMATCH;
  if (code === "website_instance_not_found") return RESULT.NOT_FOUND;
  return code || RESULT.FORBIDDEN;
}

/**
 * Authorize Change Manager read access (view/edit/publish grants).
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function authorizeChangeManagerRead(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  if (!organizationId || !(input && input.instanceId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, instance: null };
  }
  if (Array.isArray(input.grantedPermissions)) {
    if (!canViewWebsiteAdmin(input.grantedPermissions)) {
      return { ok: false, code: RESULT.FORBIDDEN, instance: null };
    }
  }
  return authorizeWebsiteAction(db, {
    ...input,
    organizationId,
    permission: PERMISSIONS.VIEW,
  });
}

/**
 * Compare current draft to published baseline for one authorized website.
 * Count = distinct content keys whose draft differs from published.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   code?: string,
 *   pendingChangeCount: number,
 *   changes: object[],
 *   changedKeys: string[],
 *   instance: object|null,
 *   source: string,
 * }>}
 */
async function compareDraftToPublished(db, input) {
  const authorized = await authorizeChangeManagerRead(db, input);
  if (!authorized.ok) {
    return {
      ok: false,
      code: authFailureCode(authorized.code),
      pendingChangeCount: 0,
      changes: [],
      changedKeys: [],
      instance: authorized.instance || null,
      source: "draft_vs_published",
    };
  }
  const instance = authorized.instance;
  const organizationId = String(input.organizationId);
  const rows = await contentService.listWebsiteContent(db, instance, organizationId);
  const changes = contentService.diffContentRows(rows);
  const changedKeys = changes.map((c) => c.contentKey).filter(Boolean);
  // Distinct by content key (diffContentRows already one row per key).
  const distinct = new Set(changedKeys);
  return {
    ok: true,
    code: RESULT.OK,
    pendingChangeCount: distinct.size,
    changes,
    changedKeys: [...distinct].sort(),
    instance,
    source: "draft_vs_published",
  };
}

/**
 * Thin summary for toolbars / Stitch unpublished-changes badge.
 */
async function getPendingChangeSummary(db, input) {
  const compared = await compareDraftToPublished(db, input);
  if (!compared.ok) {
    return {
      ok: false,
      code: compared.code,
      pendingChangeCount: 0,
      changedKeys: [],
      hasPendingChanges: false,
    };
  }
  return {
    ok: true,
    code: RESULT.OK,
    pendingChangeCount: compared.pendingChangeCount,
    changedKeys: compared.changedKeys,
    hasPendingChanges: compared.pendingChangeCount > 0,
    instanceId: compared.instance && compared.instance.id,
  };
}

/**
 * Inventory historical drafts (current unpublished keys) and published versions
 * for an authorized website. Does not mutate history.
 */
async function auditWebsiteChangeHistory(db, input) {
  const compared = await compareDraftToPublished(db, input);
  if (!compared.ok) {
    return {
      ok: false,
      code: compared.code,
      pendingChangeCount: 0,
      versions: [],
      supportedFieldHistoryContentTypes: FIELD_HISTORY_CONTENT_TYPES,
    };
  }
  const organizationId = String(input.organizationId);
  const listed = await versionService.listWebsiteVersions(db, {
    instanceId: compared.instance.id,
    organizationId,
  });
  const versions = (listed.versions || []).map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    status: v.status,
    publishedAt: v.publishedAt,
    changeCount: Number(v.changeCount) || (Array.isArray(v.changedKeys) ? v.changedKeys.length : 0),
    changedKeys: Array.isArray(v.changedKeys) ? v.changedKeys.slice() : [],
    hasSnapshotValues: Boolean(
      v.snapshot && v.snapshot.values && typeof v.snapshot.values === "object"
    ),
    // Historical rows are immutable — never write back.
    immutable: true,
  }));

  const template = compared.instance
    ? getWebsiteTemplate(compared.instance.templateId, compared.instance.templateVersion)
    : null;
  const templateTypes = new Set();
  if (template && template.keys) {
    for (const def of Object.values(template.keys)) {
      if (def && def.type) templateTypes.add(def.type);
    }
  }

  return {
    ok: true,
    code: RESULT.OK,
    instanceId: compared.instance.id,
    organizationId,
    productCode: compared.instance.productCode || null,
    pendingChangeCount: compared.pendingChangeCount,
    pendingChangedKeys: compared.changedKeys,
    pendingChanges: compared.changes,
    versionCount: versions.length,
    versions,
    supportedFieldHistoryContentTypes: FIELD_HISTORY_CONTENT_TYPES,
    templateContentTypes: [...templateTypes].sort(),
    historyStorage: {
      pending: "platform.website_content.draft_value vs published_value",
      publishedVersions: "platform.website_versions.snapshot_json (immutable)",
      audit: "platform.website_audit_events",
      independentCounter: false,
      migrationRequired: false,
    },
  };
}

function snapshotValue(snapshot, contentKey) {
  if (!snapshot || !contentKey) return undefined;
  if (snapshot.values && Object.prototype.hasOwnProperty.call(snapshot.values, contentKey)) {
    return snapshot.values[contentKey];
  }
  return undefined;
}

/**
 * Field-level history for one content key from immutable published versions.
 * Current draft tip is appended when it differs from the live published value.
 * Never mutates website_versions.
 */
async function listFieldHistory(db, input) {
  const contentKey = String((input && input.contentKey) || "")
    .trim()
    .toLowerCase();
  if (!contentKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, entries: [] };
  }
  const authorized = await authorizeChangeManagerRead(db, input);
  if (!authorized.ok) {
    return { ok: false, code: authFailureCode(authorized.code), entries: [] };
  }
  const instance = authorized.instance;
  const organizationId = String(input.organizationId);
  const template = getWebsiteTemplate(instance.templateId, instance.templateVersion);
  const def = getContentKeyDef(template, contentKey);
  const contentType = (def && def.type) || null;
  const supportsFieldHistory =
    !contentType || FIELD_HISTORY_CONTENT_TYPES.includes(contentType);

  const listed = await versionService.listWebsiteVersions(db, {
    instanceId: instance.id,
    organizationId,
  });
  const versions = (listed.versions || [])
    .slice()
    .sort((a, b) => Number(a.versionNumber) - Number(b.versionNumber));

  const entries = [];
  let previousSnapshot = null;
  for (const version of versions) {
    const snap = version.snapshot || {};
    const keys = Array.isArray(version.changedKeys) ? version.changedKeys : [];
    const inChanged = keys.includes(contentKey);
    const prevVal = snapshotValue(previousSnapshot, contentKey);
    const curVal = snapshotValue(snap, contentKey);
    const valuePresent = snap.values && Object.prototype.hasOwnProperty.call(snap.values, contentKey);
    if (!supportsFieldHistory) {
      previousSnapshot = snap;
      continue;
    }
    if (inChanged || (valuePresent && !contentService.valuesEqual(prevVal, curVal))) {
      const diff = buildVersionDiff({
        snapshot: snap,
        previousSnapshot: previousSnapshot || {},
        changedKeys: [contentKey],
        template,
      });
      const item = (diff.items && diff.items[0]) || null;
      entries.push({
        kind: "published_version",
        versionId: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        publishedAt: version.publishedAt,
        contentKey,
        contentType: contentType || (item && item.contentType) || null,
        oldValue: prevVal,
        newValue: curVal,
        changeType: item ? item.changeType : "changed",
        immutable: true,
      });
    }
    previousSnapshot = snap;
  }

  const row = await contentService.getWebsiteContentRow(
    db,
    instance.id,
    organizationId,
    contentKey
  );
  if (
    supportsFieldHistory &&
    row &&
    !contentService.valuesEqual(row.draftValue, row.publishedValue)
  ) {
    entries.push({
      kind: "current_draft",
      versionId: null,
      versionNumber: null,
      status: "draft",
      publishedAt: null,
      contentKey,
      contentType: row.contentType || contentType,
      oldValue: row.publishedValue,
      newValue: row.draftValue,
      changeType: "changed",
      immutable: false,
    });
  }

  return {
    ok: true,
    code: RESULT.OK,
    contentKey,
    contentType,
    supportsFieldHistory,
    supportedFieldHistoryContentTypes: FIELD_HISTORY_CONTENT_TYPES,
    entries,
    entryCount: entries.length,
    row: row
      ? {
          contentKey: row.contentKey,
          contentType: row.contentType,
          draftValue: row.draftValue,
          publishedValue: row.publishedValue,
          updatedAt: row.updatedAt,
        }
      : null,
  };
}

/**
 * Present Field History + Restore panel for one content key.
 * Validates historical CDN/media ownership for image restore choices.
 */
async function getFieldHistoryRestorePanel(db, input) {
  const history = await listFieldHistory(db, input);
  if (!history.ok) {
    return { ok: false, code: history.code, panel: null };
  }
  const canEdit =
    Array.isArray(input.grantedPermissions) &&
    input.grantedPermissions.includes(PERMISSIONS.EDIT);
  const instance = (
    await authorizeChangeManagerRead(db, input)
  ).instance;
  const mediaAvailability = {};
  if (instance && history.contentType === CONTENT_TYPES.IMAGE) {
    for (const entry of history.entries || []) {
      if (entry.kind !== "published_version") continue;
      const choiceId = `earlier_published:${entry.versionId}`;
      const checked = await mediaService.assertOwnedWebsiteImageValue(db, {
        organizationId: input.organizationId,
        instance,
        value: entry.newValue,
        env: (input && input.env) || process.env,
      });
      mediaAvailability[choiceId] = {
        ok: checked.ok === true,
        code: checked.ok ? null : checked.code || "media_not_found",
      };
    }
  }
  const { presentFieldHistoryRestore } = require("../website-engine/fieldHistoryRestore");
  const panel = presentFieldHistoryRestore({
    history,
    row: history.row,
    canEdit,
    mediaAvailability,
  });
  return {
    ok: true,
    code: RESULT.OK,
    contentKey: history.contentKey,
    pendingChangeCount: (
      await getPendingChangeSummary(db, {
        ...input,
        grantedPermissions: input.grantedPermissions || [PERMISSIONS.VIEW, PERMISSIONS.EDIT],
      })
    ).pendingChangeCount,
    panel,
  };
}

/**
 * Restore one historical/published value into the current draft for a single field.
 * Never publishes. Uses expectedUpdatedAt conflict guard when provided.
 */
async function restoreFieldRevisionToDraft(db, input) {
  const contentKey = String((input && input.contentKey) || "")
    .trim()
    .toLowerCase();
  const choice = String((input && input.choice) || "").trim();
  if (!contentKey || !choice) {
    return { ok: false, code: RESULT.INVALID_INPUT, published: false };
  }
  if (choice === "previously_saved") {
    return {
      ok: false,
      code: "history_unavailable",
      reason: "Prior draft history is not stored for this field",
      published: false,
    };
  }

  const authorized = await authorizeWebsiteAction(db, {
    ...input,
    organizationId: String((input && input.organizationId) || ""),
    permission: PERMISSIONS.EDIT,
  });
  if (!authorized.ok) {
    return { ok: false, code: authFailureCode(authorized.code), published: false };
  }
  const instance = authorized.instance;
  const organizationId = String(input.organizationId);

  if (choice === "undo_current_edit" || choice === "currently_published") {
    const discarded = await contentService.discardWebsiteDraft(db, {
      organizationId,
      instanceId: instance.id,
      contentKey,
      actorIdentityId: input.actorIdentityId || null,
      expectedProductCode: input.expectedProductCode,
      expectedUpdatedAt: input.expectedUpdatedAt || null,
    });
    if (!discarded.ok) {
      return { ...discarded, published: false };
    }
    await recordWebsiteAuditSafe(db, {
      organizationId,
      instanceId: instance.id,
      actorIdentityId: input.actorIdentityId || null,
      actionKey: "website.draft.restore",
      contentKey,
      metadata: { restore_mode: choice, restored_from: "published" },
    });
    const summary = await getPendingChangeSummary(db, {
      ...input,
      grantedPermissions: input.grantedPermissions || [PERMISSIONS.VIEW, PERMISSIONS.EDIT],
    });
    return {
      ok: true,
      code: RESULT.OK,
      published: false,
      choice,
      contentKey,
      pendingChangeCount: summary.pendingChangeCount,
      changedKeys: summary.changedKeys,
    };
  }

  if (choice === "earlier_published") {
    const versionId = String((input && input.versionId) || "").trim();
    if (!versionId) {
      return { ok: false, code: RESULT.INVALID_INPUT, published: false };
    }
    const loaded = await versionService.getWebsiteVersion(db, {
      versionId,
      organizationId,
      instanceId: instance.id,
    });
    if (!loaded.ok || !loaded.version) {
      return { ok: false, code: loaded.code || RESULT.NOT_FOUND, published: false };
    }
    const snap = loaded.version.snapshot || {};
    const values = snap.values || {};
    if (!Object.prototype.hasOwnProperty.call(values, contentKey)) {
      return {
        ok: false,
        code: "history_unavailable",
        reason: "This published version does not include the selected field",
        published: false,
      };
    }
    const restoredValue = values[contentKey];
    const saved = await contentService.saveWebsiteDraft(db, {
      organizationId,
      instanceId: instance.id,
      contentKey,
      value: restoredValue,
      actorIdentityId: input.actorIdentityId || null,
      grantedPermissions: input.grantedPermissions || [PERMISSIONS.EDIT],
      expectedProductCode: input.expectedProductCode,
      expectedUpdatedAt: input.expectedUpdatedAt || null,
      env: input.env || process.env,
    });
    if (!saved.ok) {
      return {
        ok: false,
        code: saved.code,
        reason: saved.reason || null,
        content: saved.content || null,
        published: false,
      };
    }
    await recordWebsiteAuditSafe(db, {
      organizationId,
      instanceId: instance.id,
      actorIdentityId: input.actorIdentityId || null,
      actionKey: "website.draft.restore",
      contentKey,
      versionId,
      metadata: {
        restore_mode: "earlier_published",
        restored_from: "version",
        version_number: loaded.version.versionNumber,
      },
    });
    const summary = await getPendingChangeSummary(db, {
      ...input,
      grantedPermissions: input.grantedPermissions || [PERMISSIONS.VIEW, PERMISSIONS.EDIT],
    });
    return {
      ok: true,
      code: RESULT.OK,
      published: false,
      choice,
      versionId,
      contentKey,
      content: saved.content,
      pendingChangeCount: summary.pendingChangeCount,
      changedKeys: summary.changedKeys,
    };
  }

  return { ok: false, code: RESULT.INVALID_INPUT, published: false };
}

async function recordWebsiteAuditSafe(db, input) {
  try {
    const { recordWebsiteAudit } = require("./auditService");
    await recordWebsiteAudit(db, input);
  } catch {
    /* audit must not block restore */
  }
}

/**
 * Revert one field draft to published (does not publish; does not alter history).
 */
async function revertFieldToPublished(db, input) {
  const authorized = await authorizeWebsiteAction(db, {
    ...input,
    organizationId: String((input && input.organizationId) || ""),
    permission: PERMISSIONS.EDIT,
  });
  if (!authorized.ok) {
    return { ok: false, code: authFailureCode(authorized.code) };
  }
  const discarded = await contentService.discardWebsiteDraft(db, {
    organizationId: input.organizationId,
    instanceId: input.instanceId,
    contentKey: input.contentKey,
    actorIdentityId: input.actorIdentityId || null,
    expectedProductCode: input.expectedProductCode,
  });
  if (!discarded.ok) return discarded;
  const summary = await getPendingChangeSummary(db, {
    ...input,
    grantedPermissions: input.grantedPermissions || [PERMISSIONS.VIEW, PERMISSIONS.EDIT],
  });
  return {
    ok: true,
    code: RESULT.OK,
    pendingChangeCount: summary.pendingChangeCount,
    changedKeys: summary.changedKeys,
  };
}

/**
 * Revert all pending drafts to published values.
 */
async function revertAllPendingToPublished(db, input) {
  const authorized = await authorizeWebsiteAction(db, {
    ...input,
    organizationId: String((input && input.organizationId) || ""),
    permission: PERMISSIONS.EDIT,
  });
  if (!authorized.ok) {
    return { ok: false, code: authFailureCode(authorized.code) };
  }
  const discarded = await contentService.discardAllWebsiteDrafts(db, {
    organizationId: input.organizationId,
    instanceId: input.instanceId,
    actorIdentityId: input.actorIdentityId || null,
    expectedProductCode: input.expectedProductCode,
  });
  if (!discarded.ok) return discarded;
  const summary = await getPendingChangeSummary(db, {
    ...input,
    grantedPermissions: input.grantedPermissions || [PERMISSIONS.VIEW, PERMISSIONS.EDIT],
  });
  return {
    ok: true,
    code: RESULT.OK,
    discarded: discarded.discarded || 0,
    pendingChangeCount: summary.pendingChangeCount,
    changedKeys: summary.changedKeys,
  };
}

/**
 * Panel model for Stitch Unpublished Changes (grouped by website page).
 * Safe field revert is exposed only when discardPath is provided (existing discard).
 */
async function getUnpublishedChangesPanel(db, input) {
  const compared = await compareDraftToPublished(db, input);
  if (!compared.ok) {
    return {
      ok: false,
      code: compared.code,
      pendingChangeCount: 0,
      panel: null,
    };
  }
  const instance = compared.instance;
  const template = getWebsiteTemplate(instance.templateId, instance.templateVersion);
  const { presentUnpublishedChangesPanel } = require("../website-engine/unpublishedChangesPanel");
  const canEdit =
    !Array.isArray(input.grantedPermissions) ||
    input.grantedPermissions.includes(PERMISSIONS.EDIT);
  const canPublish =
    input.canPublish === true ||
    (Array.isArray(input.grantedPermissions) &&
      input.grantedPermissions.includes(PERMISSIONS.PUBLISH));
  const panel = presentUnpublishedChangesPanel({
    changes: compared.changes,
    template,
    canPublish,
    canEdit: Boolean(canEdit),
    canRevert: Boolean(input.discardPath) && Boolean(canEdit),
    previewHref: input.previewHref || null,
    publishPath: input.publishPath || null,
    discardPath: input.discardPath || null,
    pages: input.pages || [],
    now: input.now || new Date(),
  });
  return {
    ok: true,
    code: RESULT.OK,
    pendingChangeCount: compared.pendingChangeCount,
    changedKeys: compared.changedKeys,
    instanceId: instance.id,
    organizationId: String(input.organizationId),
    productCode: instance.productCode || null,
    panel,
  };
}

module.exports = {
  RESULT,
  FIELD_HISTORY_CONTENT_TYPES,
  authorizeChangeManagerRead,
  compareDraftToPublished,
  getPendingChangeSummary,
  auditWebsiteChangeHistory,
  listFieldHistory,
  revertFieldToPublished,
  revertAllPendingToPublished,
  getUnpublishedChangesPanel,
  getFieldHistoryRestorePanel,
  restoreFieldRevisionToDraft,
};
