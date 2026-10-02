"use strict";

/**
 * Allowlisted BlessBoard system notification templates and merge fields.
 * Defaults are the platform catalogue; org overrides live in DB.
 */

const { getBlessBoardPublicUrl, getChurchHostDomain } = require("./blessBoardEnv");

const MERGE_FIELD_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

const COMMON_FIELDS = Object.freeze([
  "organisation_name",
  "organization_name",
  "branch_name",
  "admin_name",
  "member_name",
  "support_url",
  "login_url",
]);

/** @type {Record<string, { label: string, description: string, mergeFields: string[], defaultSubject: string, defaultBodyText: string, defaultBodyHtml: string }>} */
const TEMPLATE_DEFINITIONS = {
  welcome_administrator: {
    label: "Welcome administrator",
    description: "Sent when a branch or HQ administrator account is provisioned.",
    mergeFields: [...COMMON_FIELDS, "temporary_access_hint"],
    defaultSubject: "Welcome to BlessBoard for {{organisation_name}}",
    defaultBodyText:
      "Hello {{admin_name}},\n\nYour administrator access for {{organisation_name}} is ready.\nSign in at {{login_url}}.\n\n{{temporary_access_hint}}\n\nBlessBoard Support",
    defaultBodyHtml:
      "<p>Hello <strong>{{admin_name}}</strong>,</p><p>Your administrator access for <strong>{{organisation_name}}</strong> is ready.</p><p><a href=\"{{login_url}}\">Sign in</a></p><p>{{temporary_access_hint}}</p><p>BlessBoard Support</p>",
  },
  member_registration_received: {
    label: "Member registration received",
    description: "Confirms a member registration was received and is awaiting review.",
    mergeFields: [...COMMON_FIELDS],
    defaultSubject: "We received your registration with {{organisation_name}}",
    defaultBodyText:
      "Hello {{member_name}},\n\nThank you for registering with {{branch_name}} ({{organisation_name}}).\nA church administrator will review your request.\n\nBlessBoard",
    defaultBodyHtml:
      "<p>Hello <strong>{{member_name}}</strong>,</p><p>Thank you for registering with <strong>{{branch_name}}</strong> ({{organisation_name}}).</p><p>A church administrator will review your request.</p>",
  },
  member_approved: {
    label: "Member approved",
    description: "Notifies a member that their registration was approved.",
    mergeFields: [...COMMON_FIELDS],
    defaultSubject: "Your membership with {{organisation_name}} was approved",
    defaultBodyText:
      "Hello {{member_name}},\n\nYour membership with {{branch_name}} has been approved.\nYou can sign in at {{login_url}}.\n\nBlessBoard",
    defaultBodyHtml:
      "<p>Hello <strong>{{member_name}}</strong>,</p><p>Your membership with <strong>{{branch_name}}</strong> has been approved.</p><p><a href=\"{{login_url}}\">Sign in</a></p>",
  },
  member_rejected: {
    label: "Member rejected",
    description: "Notifies a member that their registration was not approved.",
    mergeFields: [...COMMON_FIELDS, "decision_note"],
    defaultSubject: "Update on your registration with {{organisation_name}}",
    defaultBodyText:
      "Hello {{member_name}},\n\nYour registration with {{branch_name}} was not approved at this time.\n{{decision_note}}\n\nIf you have questions, contact your church administrators.\n\nBlessBoard",
    defaultBodyHtml:
      "<p>Hello <strong>{{member_name}}</strong>,</p><p>Your registration with <strong>{{branch_name}}</strong> was not approved at this time.</p><p>{{decision_note}}</p>",
  },
  growth_trial_reminder: {
    label: "Growth trial reminder",
    description: "Reminds organisations that a Growth trial is ending soon.",
    mergeFields: [...COMMON_FIELDS, "trial_ends_on", "days_remaining"],
    defaultSubject: "Growth trial for {{organisation_name}} ends in {{days_remaining}} day(s)",
    defaultBodyText:
      "Hello {{admin_name}},\n\nYour Growth trial for {{organisation_name}} ends on {{trial_ends_on}} ({{days_remaining}} day(s) remaining).\nReview your package settings while you still have Growth access.\n\nBlessBoard",
    defaultBodyHtml:
      "<p>Hello <strong>{{admin_name}}</strong>,</p><p>Your Growth trial for <strong>{{organisation_name}}</strong> ends on <strong>{{trial_ends_on}}</strong> ({{days_remaining}} day(s) remaining).</p>",
  },
  growth_trial_expiry: {
    label: "Growth trial expiry",
    description: "Sent when a Growth trial ends and Foundation entitlements are restored.",
    mergeFields: [...COMMON_FIELDS, "trial_ended_on", "previous_package"],
    defaultSubject: "Growth trial ended for {{organisation_name}}",
    defaultBodyText:
      "Hello {{admin_name}},\n\nThe Growth trial for {{organisation_name}} ended on {{trial_ended_on}}.\nYour organisation is back on {{previous_package}} limits. Growth-only actions are unavailable.\n\nBlessBoard",
    defaultBodyHtml:
      "<p>Hello <strong>{{admin_name}}</strong>,</p><p>The Growth trial for <strong>{{organisation_name}}</strong> ended on <strong>{{trial_ended_on}}</strong>.</p><p>Your organisation is back on <strong>{{previous_package}}</strong> limits.</p>",
  },
  quota_warning: {
    label: "Quota warning",
    description: "Warns administrators when Foundation package usage approaches a limit.",
    mergeFields: [...COMMON_FIELDS, "meter_label", "usage_display", "warning_band"],
    defaultSubject: "{{meter_label}} usage notice for {{organisation_name}}",
    defaultBodyText:
      "Hello {{admin_name}},\n\n{{meter_label}} for {{organisation_name}} is at {{warning_band}}% of the package limit ({{usage_display}}).\nReview usage or archive unused records.\n\nBlessBoard",
    defaultBodyHtml:
      "<p>Hello <strong>{{admin_name}}</strong>,</p><p><strong>{{meter_label}}</strong> for <strong>{{organisation_name}}</strong> is at <strong>{{warning_band}}%</strong> of the package limit ({{usage_display}}).</p>",
  },
  branch_activation: {
    label: "Branch activation",
    description: "Confirms a branch was activated.",
    mergeFields: [...COMMON_FIELDS],
    defaultSubject: "{{branch_name}} is now active",
    defaultBodyText:
      "Hello {{admin_name}},\n\n{{branch_name}} for {{organisation_name}} is now active.\n\nBlessBoard",
    defaultBodyHtml:
      "<p>Hello <strong>{{admin_name}}</strong>,</p><p><strong>{{branch_name}}</strong> for <strong>{{organisation_name}}</strong> is now active.</p>",
  },
  branch_deactivation: {
    label: "Branch deactivation",
    description: "Confirms a branch was deactivated.",
    mergeFields: [...COMMON_FIELDS],
    defaultSubject: "{{branch_name}} was deactivated",
    defaultBodyText:
      "Hello {{admin_name}},\n\n{{branch_name}} for {{organisation_name}} was deactivated.\nExisting data remains available according to your package rules.\n\nBlessBoard",
    defaultBodyHtml:
      "<p>Hello <strong>{{admin_name}}</strong>,</p><p><strong>{{branch_name}}</strong> for <strong>{{organisation_name}}</strong> was deactivated.</p>",
  },
  foundation_dormancy_warning: {
    label: "Foundation dormancy warning",
    description: "Warns Foundation organisations about inactivity before dormancy.",
    mergeFields: [...COMMON_FIELDS, "warning_stage", "activity_deadline"],
    defaultSubject: "Inactivity notice for {{organisation_name}} ({{warning_stage}})",
    defaultBodyText:
      "Hello {{admin_name}},\n\n{{organisation_name}} has had limited activity. This is a {{warning_stage}} notice.\nPlease sign in before {{activity_deadline}} to keep your organisation active.\n\nBlessBoard",
    defaultBodyHtml:
      "<p>Hello <strong>{{admin_name}}</strong>,</p><p><strong>{{organisation_name}}</strong> has had limited activity. This is a <strong>{{warning_stage}}</strong> notice.</p><p>Please sign in before <strong>{{activity_deadline}}</strong> to keep your organisation active.</p>",
  },
  password_reset_support_notice: {
    label: "Password-reset support notice",
    description: "Acknowledges a password-reset support request without sending secrets.",
    mergeFields: [...COMMON_FIELDS, "request_reference"],
    defaultSubject: "Password reset request received ({{request_reference}})",
    defaultBodyText:
      "Hello {{admin_name}},\n\nWe received a password-reset support request ({{request_reference}}) for {{organisation_name}}.\nAn authorised administrator will complete verification. This message never includes passwords or reset tokens.\n\nBlessBoard Support",
    defaultBodyHtml:
      "<p>Hello <strong>{{admin_name}}</strong>,</p><p>We received a password-reset support request (<strong>{{request_reference}}</strong>) for <strong>{{organisation_name}}</strong>.</p><p>This message never includes passwords or reset tokens.</p>",
  },
};

const TEMPLATE_KEYS = Object.freeze(Object.keys(TEMPLATE_DEFINITIONS));

const FORBIDDEN_MERGE_FIELDS = Object.freeze([
  "password",
  "password_hash",
  "temporary_password",
  "token",
  "reset_token",
  "access_token",
  "secret",
  "csrf",
  "session",
  "session_id",
]);

function getTemplateDefinition(templateKey) {
  return TEMPLATE_DEFINITIONS[String(templateKey || "").trim()] || null;
}

function listTemplateDefinitions() {
  return TEMPLATE_KEYS.map((key) => ({
    key,
    ...TEMPLATE_DEFINITIONS[key],
  }));
}

function extractMergeFields(text) {
  const found = new Set();
  const src = String(text || "");
  let m;
  const re = new RegExp(MERGE_FIELD_PATTERN.source, "gi");
  while ((m = re.exec(src))) {
    found.add(m[1].toLowerCase());
  }
  return [...found];
}

function validateTemplatesAgainstAllowlist(templateKey, subject, bodyText, bodyHtml) {
  const def = getTemplateDefinition(templateKey);
  if (!def) {
    return { ok: false, error: "Unknown template key." };
  }
  const allowed = new Set(def.mergeFields.map((f) => f.toLowerCase()));
  const used = [
    ...extractMergeFields(subject),
    ...extractMergeFields(bodyText),
    ...extractMergeFields(bodyHtml),
  ];
  for (const field of used) {
    if (FORBIDDEN_MERGE_FIELDS.includes(field)) {
      return { ok: false, error: `Merge field "{{${field}}}" is not allowed (secrets).` };
    }
    if (!allowed.has(field)) {
      return { ok: false, error: `Merge field "{{${field}}}" is not allowed for this template.` };
    }
  }
  return { ok: true, usedFields: [...new Set(used)] };
}

function sampleVariablesForTemplate(templateKey) {
  const def = getTemplateDefinition(templateKey);
  if (!def) return {};
  const samples = {
    organisation_name: "Example Church",
    organization_name: "Example Church",
    branch_name: "Main Campus",
    admin_name: "Jordan Admin",
    member_name: "Alex Member",
    support_url: `${getBlessBoardPublicUrl()}/contact`,
    login_url: `https://example.${getChurchHostDomain()}/login`,
    temporary_access_hint: "Use the credentials shared during provisioning.",
    decision_note: "Please contact your local administrators for more information.",
    trial_ends_on: "2026-08-01",
    days_remaining: "7",
    trial_ended_on: "2026-07-31",
    previous_package: "Foundation",
    meter_label: "Active members",
    usage_display: "200 / 250",
    warning_band: "80",
    warning_stage: "final",
    activity_deadline: "2026-09-01",
    request_reference: "PR-1001",
  };
  const out = {};
  for (const field of def.mergeFields) {
    out[field] = samples[field] != null ? samples[field] : `[${field}]`;
  }
  return out;
}

module.exports = {
  MERGE_FIELD_PATTERN,
  TEMPLATE_DEFINITIONS,
  TEMPLATE_KEYS,
  FORBIDDEN_MERGE_FIELDS,
  getTemplateDefinition,
  listTemplateDefinitions,
  extractMergeFields,
  validateTemplatesAgainstAllowlist,
  sampleVariablesForTemplate,
};
