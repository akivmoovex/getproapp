"use strict";

/**
 * Notification template resolution, render, override, preview, and recorded test delivery.
 * Does not add a messaging provider — test delivery is recorded + audited only.
 */

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const churchPackageUsageService = require("./churchPackageUsageService");
const {
  TEMPLATE_KEYS,
  getTemplateDefinition,
  listTemplateDefinitions,
  validateTemplatesAgainstAllowlist,
  sampleVariablesForTemplate,
  MERGE_FIELD_PATTERN,
} = require("../../church/notificationTemplateCatalogue");
const {
  sanitizeNotificationHtml,
  escapeText,
} = require("../../church/notificationTemplateSanitize");

function catalogueDefaultRow(templateKey) {
  const def = getTemplateDefinition(templateKey);
  if (!def) return null;
  return {
    template_key: templateKey,
    organization_id: null,
    subject_template: def.defaultSubject,
    body_text_template: def.defaultBodyText,
    body_html_template: def.defaultBodyHtml,
    source: "catalogue_default",
    is_override: false,
  };
}

async function loadStoredTemplate(db, templateKey, organizationId) {
  if (organizationId != null) {
    const orgRow = await db.query(
      `SELECT * FROM public.church_notification_templates
       WHERE template_key = $1 AND organization_id = $2
       LIMIT 1`,
      [templateKey, organizationId]
    );
    if (orgRow.rows[0]) {
      return { ...orgRow.rows[0], source: "organization_override", is_override: true };
    }
  }
  const platform = await db.query(
    `SELECT * FROM public.church_notification_templates
     WHERE template_key = $1 AND organization_id IS NULL
     LIMIT 1`,
    [templateKey]
  );
  if (platform.rows[0]) {
    return { ...platform.rows[0], source: "platform_default", is_override: false };
  }
  return catalogueDefaultRow(templateKey);
}

async function getEffectiveTemplate(db, templateKey, organizationId = null) {
  const def = getTemplateDefinition(templateKey);
  if (!def) {
    const err = new Error("Unknown template key.");
    err.code = "UNKNOWN_TEMPLATE";
    throw err;
  }
  const row = await loadStoredTemplate(db, templateKey, organizationId);
  return {
    key: templateKey,
    label: def.label,
    description: def.description,
    mergeFields: def.mergeFields,
    organizationId: organizationId != null ? Number(organizationId) : null,
    subjectTemplate: row.subject_template,
    bodyTextTemplate: row.body_text_template,
    bodyHtmlTemplate: row.body_html_template,
    source: row.source,
    isOverride: Boolean(row.is_override),
    storedId: row.id || null,
    updatedAt: row.updated_at || null,
  };
}

async function listEffectiveTemplates(db, organizationId = null) {
  const out = [];
  for (const key of TEMPLATE_KEYS) {
    out.push(await getEffectiveTemplate(db, key, organizationId));
  }
  return out;
}

function applyMerge(template, variables, { htmlEscapeValues = false } = {}) {
  const vars = variables || {};
  return String(template || "").replace(MERGE_FIELD_PATTERN, (_, rawKey) => {
    const key = String(rawKey).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(vars, key) && vars[rawKey] == null) {
      return `{{${key}}}`;
    }
    const value = vars[key] != null ? vars[key] : vars[rawKey];
    const text = value == null ? "" : String(value);
    return htmlEscapeValues ? escapeText(text) : text;
  });
}

function collectMissingVariables(templateParts, variables) {
  const vars = variables || {};
  const missing = new Set();
  for (const part of templateParts) {
    const re = new RegExp(MERGE_FIELD_PATTERN.source, "gi");
    let m;
    while ((m = re.exec(String(part || "")))) {
      const key = m[1].toLowerCase();
      const has =
        Object.prototype.hasOwnProperty.call(vars, key) ||
        Object.prototype.hasOwnProperty.call(vars, m[1]);
      const value = has ? (vars[key] != null ? vars[key] : vars[m[1]]) : undefined;
      if (!has || value == null || String(value).trim() === "") {
        missing.add(key);
      }
    }
  }
  return [...missing];
}

function normalizeVariableMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    out[String(k).toLowerCase()] = v;
  }
  // Alias spelling
  if (out.organization_name && !out.organisation_name) {
    out.organisation_name = out.organization_name;
  }
  if (out.organisation_name && !out.organization_name) {
    out.organization_name = out.organisation_name;
  }
  return out;
}

function renderTemplateContent(effective, variables, opts = {}) {
  const vars = normalizeVariableMap(variables);
  const missing = collectMissingVariables(
    [effective.subjectTemplate, effective.bodyTextTemplate, effective.bodyHtmlTemplate],
    vars
  );
  if (missing.length && !opts.allowMissing) {
    const err = new Error(`Missing merge variables: ${missing.join(", ")}`);
    err.code = "MISSING_VARIABLES";
    err.missing = missing;
    throw err;
  }
  const subject = applyMerge(effective.subjectTemplate, vars, { htmlEscapeValues: false });
  const bodyText = applyMerge(effective.bodyTextTemplate, vars, { htmlEscapeValues: false });
  const rawHtml = effective.bodyHtmlTemplate
    ? applyMerge(effective.bodyHtmlTemplate, vars, { htmlEscapeValues: true })
    : null;
  const bodyHtml = rawHtml ? sanitizeNotificationHtml(rawHtml) : null;
  return {
    subject: subject.slice(0, 200),
    bodyText,
    bodyHtml,
    missing,
    templateKey: effective.key,
    source: effective.source,
  };
}

async function previewTemplate(db, opts) {
  const effective = await getEffectiveTemplate(db, opts.templateKey, opts.organizationId || null);
  const vars = opts.variables
    ? normalizeVariableMap(opts.variables)
    : sampleVariablesForTemplate(opts.templateKey);
  return renderTemplateContent(effective, vars, { allowMissing: Boolean(opts.allowMissing) });
}

function validateAndSanitizeInput(templateKey, fields) {
  const subject = String(fields.subject_template || "").trim();
  const bodyText = String(fields.body_text_template || "").trim();
  const htmlRaw =
    fields.body_html_template == null || String(fields.body_html_template).trim() === ""
      ? null
      : String(fields.body_html_template);
  if (!subject || !bodyText) {
    return { ok: false, error: "Subject and plain-text body are required." };
  }
  if (subject.length > 200) {
    return { ok: false, error: "Subject must be at most 200 characters." };
  }
  if (bodyText.length > 20000 || (htmlRaw && htmlRaw.length > 40000)) {
    return { ok: false, error: "Template body is too long." };
  }
  const validation = validateTemplatesAgainstAllowlist(templateKey, subject, bodyText, htmlRaw || "");
  if (!validation.ok) return validation;
  const bodyHtml = htmlRaw ? sanitizeNotificationHtml(htmlRaw) : null;
  // Re-validate after sanitise (merge fields inside href text etc.)
  const again = validateTemplatesAgainstAllowlist(templateKey, subject, bodyText, bodyHtml || "");
  if (!again.ok) return again;
  return {
    ok: true,
    subject_template: subject,
    body_text_template: bodyText,
    body_html_template: bodyHtml,
  };
}

async function upsertTemplate(db, opts) {
  const templateKey = String(opts.templateKey || "").trim();
  const organizationId = opts.organizationId != null ? Number(opts.organizationId) : null;
  const validated = validateAndSanitizeInput(templateKey, opts);
  if (!validated.ok) {
    const err = new Error(validated.error);
    err.code = "VALIDATION";
    throw err;
  }

  let row;
  if (organizationId == null) {
    const existing = await db.query(
      `SELECT id FROM public.church_notification_templates
       WHERE template_key = $1 AND organization_id IS NULL LIMIT 1`,
      [templateKey]
    );
    if (existing.rows[0]) {
      const r = await db.query(
        `UPDATE public.church_notification_templates
         SET subject_template = $2,
             body_text_template = $3,
             body_html_template = $4,
             updated_by_actor_type = $5,
             updated_by_actor_id = $6,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          existing.rows[0].id,
          validated.subject_template,
          validated.body_text_template,
          validated.body_html_template,
          opts.actorType || null,
          opts.actorId || null,
        ]
      );
      row = r.rows[0];
    } else {
      const r = await db.query(
        `INSERT INTO public.church_notification_templates (
           template_key, organization_id, subject_template, body_text_template, body_html_template,
           updated_by_actor_type, updated_by_actor_id
         ) VALUES ($1, NULL, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          templateKey,
          validated.subject_template,
          validated.body_text_template,
          validated.body_html_template,
          opts.actorType || null,
          opts.actorId || null,
        ]
      );
      row = r.rows[0];
    }
  } else {
    const existing = await db.query(
      `SELECT id FROM public.church_notification_templates
       WHERE template_key = $1 AND organization_id = $2 LIMIT 1`,
      [templateKey, organizationId]
    );
    if (existing.rows[0]) {
      const r = await db.query(
        `UPDATE public.church_notification_templates
         SET subject_template = $2,
             body_text_template = $3,
             body_html_template = $4,
             updated_by_actor_type = $5,
             updated_by_actor_id = $6,
             updated_at = now()
         WHERE id = $1 AND organization_id = $7
         RETURNING *`,
        [
          existing.rows[0].id,
          validated.subject_template,
          validated.body_text_template,
          validated.body_html_template,
          opts.actorType || null,
          opts.actorId || null,
          organizationId,
        ]
      );
      row = r.rows[0];
    } else {
      const r = await db.query(
        `INSERT INTO public.church_notification_templates (
           template_key, organization_id, subject_template, body_text_template, body_html_template,
           updated_by_actor_type, updated_by_actor_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          templateKey,
          organizationId,
          validated.subject_template,
          validated.body_text_template,
          validated.body_html_template,
          opts.actorType || null,
          opts.actorId || null,
        ]
      );
      row = r.rows[0];
    }
  }

  await auditLogsRepo.insertAuditLog(db, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: opts.actorType || "platform_admin",
    actor_id: opts.actorId || null,
    action:
      organizationId == null
        ? "platform_notification_template_updated"
        : "notification_template_override_saved",
    entity_type: "notification_template",
    entity_id: row.id,
    target_label: templateKey,
    metadata_json: {
      template_key: templateKey,
      organization_id: organizationId,
      source: organizationId == null ? "platform_default" : "organization_override",
    },
  });

  return getEffectiveTemplate(db, templateKey, organizationId);
}

async function restoreDefaultTemplate(db, opts) {
  const templateKey = String(opts.templateKey || "").trim();
  if (!getTemplateDefinition(templateKey)) {
    const err = new Error("Unknown template key.");
    err.code = "UNKNOWN_TEMPLATE";
    throw err;
  }

  // Platform restore: drop platform default row → catalogue default.
  if (opts.organizationId == null || opts.organizationId === "") {
    const deleted = await db.query(
      `DELETE FROM public.church_notification_templates
       WHERE template_key = $1 AND organization_id IS NULL
       RETURNING id`,
      [templateKey]
    );
    await auditLogsRepo.insertAuditLog(db, {
      organization_id: null,
      branch_id: null,
      actor_type: opts.actorType || "platform_admin",
      actor_id: opts.actorId || null,
      action: "notification_template_override_restored",
      entity_type: "notification_template",
      entity_id: deleted.rows[0]?.id || null,
      target_label: templateKey,
      metadata_json: {
        template_key: templateKey,
        restored_scope: "platform_default",
        deleted_override: deleted.rowCount > 0,
      },
    });
    return getEffectiveTemplate(db, templateKey, null);
  }

  const organizationId = Number(opts.organizationId);
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    const err = new Error("Organization override required to restore default.");
    err.code = "VALIDATION";
    throw err;
  }
  const deleted = await db.query(
    `DELETE FROM public.church_notification_templates
     WHERE template_key = $1 AND organization_id = $2
     RETURNING id`,
    [templateKey, organizationId]
  );
  await auditLogsRepo.insertAuditLog(db, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: opts.actorType || "hq_admin",
    actor_id: opts.actorId || null,
    action: "notification_template_override_restored",
    entity_type: "notification_template",
    entity_id: deleted.rows[0]?.id || null,
    target_label: templateKey,
    metadata_json: {
      template_key: templateKey,
      restored_scope: "organization_override",
      deleted_override: deleted.rowCount > 0,
    },
  });
  return getEffectiveTemplate(db, templateKey, organizationId);
}

/**
 * Recorded test delivery to an authorised administrator email (no SMTP provider).
 */
async function testSendTemplate(db, opts) {
  const templateKey = String(opts.templateKey || "").trim();
  const organizationId = opts.organizationId != null ? Number(opts.organizationId) : null;
  const recipientEmail = String(opts.recipientEmail || "")
    .trim()
    .toLowerCase();
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    const err = new Error("A valid recipient email is required.");
    err.code = "VALIDATION";
    throw err;
  }
  if (!opts.authorisedRecipient) {
    const err = new Error("Test delivery is only allowed to an authorised administrator.");
    err.code = "FORBIDDEN";
    throw err;
  }

  const preview = await previewTemplate(db, {
    templateKey,
    organizationId,
    variables: opts.variables || sampleVariablesForTemplate(templateKey),
    allowMissing: false,
  });

  // Never include secrets in stored test payload (already prevented by allowlist).
  const inserted = await db.query(
    `INSERT INTO public.church_notification_test_deliveries (
       organization_id, template_key, recipient_actor_type, recipient_actor_id, recipient_email,
       subject_rendered, body_text_rendered, body_html_rendered,
       requested_by_actor_type, requested_by_actor_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, created_at`,
    [
      organizationId,
      templateKey,
      opts.recipientActorType || "hq_admin",
      opts.recipientActorId || null,
      recipientEmail,
      preview.subject,
      preview.bodyText,
      preview.bodyHtml,
      opts.actorType || "platform_admin",
      opts.actorId || null,
    ]
  );

  if (organizationId) {
    await churchPackageUsageService.recordExternalEmailSend(db, {
      organizationId,
      category: "security_notification",
      count: 1,
    });
  }

  await auditLogsRepo.insertAuditLog(db, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: opts.actorType || "platform_admin",
    actor_id: opts.actorId || null,
    action: "notification_template_test_sent",
    entity_type: "notification_template_test",
    entity_id: inserted.rows[0].id,
    target_label: templateKey,
    metadata_json: {
      template_key: templateKey,
      recipient_email_domain: recipientEmail.includes("@") ? recipientEmail.split("@")[1] : null,
      recipient_actor_type: opts.recipientActorType || null,
      recorded_only: true,
    },
  });

  return {
    deliveryId: inserted.rows[0].id,
    createdAt: inserted.rows[0].created_at,
    preview,
    recordedOnly: true,
  };
}

module.exports = {
  listTemplateDefinitions,
  TEMPLATE_KEYS,
  getEffectiveTemplate,
  listEffectiveTemplates,
  renderTemplateContent,
  previewTemplate,
  upsertTemplate,
  restoreDefaultTemplate,
  testSendTemplate,
  validateAndSanitizeInput,
  sampleVariablesForTemplate,
  sanitizeNotificationHtml,
};
