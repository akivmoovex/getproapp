"use strict";

const { ok, quarantine } = require("./helpers");
const { requireMappedParent } = require("./parents");

const FORBIDDEN_META_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "secret",
  "authorization",
  "cookie",
  "ssn",
  "national_id",
  "email",
  "phone",
  "full_name",
]);

function redactMetadata(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = String(k).toLowerCase();
    if (
      FORBIDDEN_META_KEYS.has(key) ||
      key.includes("password") ||
      key.includes("secret") ||
      key.includes("email") ||
      key.includes("phone")
    ) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (!row.action) return quarantine("missing_action", row);

  const warnings = [];
  const metadata = redactMetadata(row.metadata_json || row.metadata || {});
  if (JSON.stringify(metadata).length > 8000) {
    warnings.push("metadata_truncated");
  }

  if (row.organization_id == null) {
    return quarantine("missing_organization_id", row, warnings);
  }

  const org = requireMappedParent(
    ctx.idMap,
    "church_organizations",
    row.organization_id,
    "orphan_organization",
    row
  );
  if (!org.ok) return org.result;

  const church = requireMappedParent(
    ctx.idMap,
    "church_organizations_church",
    row.organization_id,
    "orphan_organization",
    row
  );
  if (!church.ok) return church.result;

  let branchId = null;
  if (row.branch_id != null) {
    const branch = requireMappedParent(
      ctx.idMap,
      "church_branches",
      row.branch_id,
      "orphan_branch",
      row
    );
    if (!branch.ok) return branch.result;
    branchId = branch.id;
  }

  const eventId = ctx.idMap.resolve("church_audit_logs", id, "platform.audit_events");

  let actionKey = String(row.action)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  if (!/^[a-z][a-z0-9_.]{1,95}$/.test(actionKey)) {
    actionKey = "legacy.audit_event";
    warnings.push("action_key_normalized");
  }

  let entityType = String(row.entity_type || "legacy")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_");
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(entityType)) entityType = "legacy";

  return ok(
    {
      auditEvent: {
        id: eventId,
        deploymentCode: ctx.runConfig.deploymentCode,
        organizationId: org.id,
        churchId: church.id,
        branchId,
        actorUserId: null,
        actionKey,
        entityType,
        outcome: "success",
        metadataJson: metadata,
        createdAt: row.created_at || null,
      },
      unsupported: {
        actor_type: row.actor_type,
        actor_id: row.actor_id,
        rollback_delete: "audit_events_are_append_only",
      },
    },
    warnings
  );
}

module.exports = { transform, redactMetadata, FORBIDDEN_META_KEYS };
