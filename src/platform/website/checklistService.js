"use strict";

const { getWebsiteTemplate } = require("./templateRegistry");
const resolver = require("./resolver");

const DEFAULT_ITEMS = Object.freeze([
  { key: "clinic_identity", label: "Clinic identity", sources: ["operational.clinic_name"], mandatory: true },
  { key: "contact_method", label: "Public contact method", sources: ["contact.phone", "contact.email", "operational.phone", "operational.email"], mandatory: true },
  { key: "address", label: "Location / address", sources: ["location.address", "operational.address"], mandatory: true },
  { key: "opening_hours", label: "Opening hours", sources: ["location.hours", "operational.hours", "operational.hoursUnavailable"], mandatory: true },
  { key: "homepage", label: "Homepage identity / content", sources: ["home.hero.title", "home.hero.subtitle", "about.story.body"], mandatory: true },
  { key: "booking", label: "Booking configuration", sources: ["operational.booking"], mandatoryWhenBooking: true },
  { key: "logo", label: "Logo", sources: ["home.logo"], mandatory: false },
  { key: "homepage_image", label: "Homepage image", sources: ["home.hero.image"], mandatory: false },
  { key: "services", label: "Services", sources: ["operational.services"], mandatory: false },
  { key: "doctors", label: "Doctors / providers", sources: ["operational.doctors"], mandatory: false },
]);

function isFilled(value) {
  if (value == null) return false;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return false;
    if (/^add your /i.test(t) || /^add (services|doctors|opening hours)/i.test(t)) return false;
    return true;
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.length > 0;
    if (value.src) return Boolean(String(value.src).trim());
    return Object.keys(value).length > 0;
  }
  if (typeof value === "boolean") return value === true;
  return true;
}

function lookupSource(source, values, operational) {
  if (source.startsWith("operational.")) {
    return (operational || {})[source.slice("operational.".length)];
  }
  return values[source];
}

function evaluateChecklist(template, resolved, operational) {
  const items = (template && template.checklistItems) || DEFAULT_ITEMS;
  const values = resolved.values || {};
  const bookingEnabled = operational && operational.booking === true;
  const results = items.map((item) => {
    const sources = item.sources || [];
    let complete = false;
    for (const source of sources) {
      if (isFilled(lookupSource(source, values, operational))) {
        complete = true;
        break;
      }
    }
    const mandatory =
      item.mandatory === true || (item.mandatoryWhenBooking === true && bookingEnabled);
    return {
      key: item.key,
      label: item.label,
      complete,
      mandatory,
      recommended: mandatory !== true,
    };
  });
  const completeCount = results.filter((r) => r.complete).length;
  const percent = results.length ? Math.round((completeCount / results.length) * 100) : 0;
  const missingRequired = results.filter((r) => r.mandatory && !r.complete).map((r) => ({
    key: r.key,
    label: r.label,
    code: `missing_${r.key}`,
  }));
  const templateRequired = (template && template.requiredPublishKeys) || [];
  for (const key of templateRequired) {
    const filled = isFilled(lookupSource(key, values, operational));
    if (!filled && !missingRequired.some((m) => m.key === key)) {
      missingRequired.push({
        key,
        label: key,
        code: `missing_${key.replace(/\./g, "_")}`,
      });
    }
  }
  return {
    items: results,
    percent,
    completeCount,
    total: results.length,
    missingRequired,
    readyToPublish: missingRequired.length === 0,
  };
}

function evaluatePublicationReadiness(input) {
  const template = input.template || (input.resolved && input.resolved.template) || null;
  const resolved = input.resolved || { values: {} };
  const operational = input.operational || {};
  const checklist = evaluateChecklist(template, resolved, operational);
  const firstPublication = input.firstPublication !== false && input.hasPublishedVersion !== true;
  return {
    ok: true,
    firstPublication,
    checklistPercent: checklist.percent,
    mandatory: checklist.missingRequired,
    recommended: checklist.items.filter((i) => !i.mandatory && !i.complete).map((i) => ({
      key: i.key,
      label: i.label,
      code: `recommended_${i.key}`,
    })),
    readyToPublish: checklist.readyToPublish,
    blocksFirstPublication: firstPublication && !checklist.readyToPublish,
    userMessages: checklist.missingRequired.map((m) => m.label),
    codes: checklist.missingRequired.map((m) => m.code),
    checklist,
  };
}

async function upsertChecklistState(db, instance, checklist) {
  await db.query(
    `INSERT INTO platform.website_checklist_state (
       instance_id, organization_id, items_json, percent_complete, updated_at
     ) VALUES ($1,$2,$3::jsonb,$4, now())
     ON CONFLICT (instance_id)
     DO UPDATE SET items_json = EXCLUDED.items_json, percent_complete = EXCLUDED.percent_complete, updated_at = now()`,
    [instance.id, instance.organizationId, JSON.stringify(checklist.items || []), checklist.percent || 0]
  );
}

async function getWebsiteChecklist(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = input.instance;
  if (!instance || instance.organizationId !== organizationId) {
    return { ok: false, code: "website_instance_not_found" };
  }
  const resolved = await resolver.resolveWebsiteContent(db, {
    organizationId,
    instance,
    mode: resolver.MODE.DRAFT,
  });
  const template = resolved.template || getWebsiteTemplate(instance.templateId, instance.templateVersion);
  const checklist = evaluateChecklist(template, resolved, input.operational || {});
  await upsertChecklistState(db, instance, checklist);
  return { ok: true, checklist, readiness: evaluatePublicationReadiness({
    template,
    resolved,
    operational: input.operational || {},
    hasPublishedVersion: Boolean(instance.publishedAt || instance.lastPublishedAt),
  }) };
}

module.exports = {
  DEFAULT_ITEMS,
  isFilled,
  evaluateChecklist,
  evaluatePublicationReadiness,
  getWebsiteChecklist,
  upsertChecklistState,
};
