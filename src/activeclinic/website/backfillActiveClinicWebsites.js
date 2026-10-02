"use strict";

/**
 * Idempotent ActiveClinic website backfill for existing HCOs.
 * Never overwrites customized/published content. Dry-run supported.
 */

const instanceRepo = require("../../platform/website/instanceRepository");
const { provisionActiveClinicWebsite } = require("./provisionActiveClinicWebsite");
const { migrateJuflonaWebsite } = require("./juflonaWebsiteMigration");
const { JULFLONA_CLINIC_KEY } = require("../services/activeClinicDemoClinicSpec");
const { getWebsiteChecklist } = require("../../platform/website/checklistService");
const { recordWebsiteAudit } = require("../../platform/website/auditService");
const { registerActiveClinicWebsiteTemplate } = require("./activeClinicWebsiteTemplate");

function classifyInstance(instance, contentCount) {
  if (!instance) return "missing_website";
  if (instance.scopeRef) return "invalid_scope";
  if (contentCount > 0) return "present";
  return "template_assigned";
}

async function auditActiveClinicWebsites(db) {
  registerActiveClinicWebsiteTemplate();
  const hcos = await db.query(
    `SELECT h.id, h.organization_id, h.public_name, h.website_about, h.website_tagline,
            h.public_phone_display, h.public_email_display, h.website_published,
            o.organization_key
       FROM activeclinic.healthcare_organizations h
       JOIN platform.organizations o ON o.id = h.organization_id
      WHERE h.status <> 'archived'
      ORDER BY o.organization_key`
  );
  const rows = [];
  for (const hco of hcos.rows) {
    const instances = await instanceRepo.listWebsiteInstancesForOrganization(
      db,
      hco.organization_id,
      "activeclinic"
    );
    const instance = instances[0] || null;
    let contentCount = 0;
    let publishedCount = 0;
    let draftCount = 0;
    if (instance) {
      const content = await db.query(
        `SELECT
            count(*)::int AS n,
            count(*) FILTER (WHERE published_value IS NOT NULL)::int AS published,
            count(*) FILTER (WHERE draft_value IS NOT NULL)::int AS draft
           FROM platform.website_content
          WHERE instance_id = $1`,
        [instance.id]
      );
      contentCount = content.rows[0].n;
      publishedCount = content.rows[0].published;
      draftCount = content.rows[0].draft;
    }
    const juflona = hco.organization_key === JULFLONA_CLINIC_KEY;
    rows.push({
      organizationId: hco.organization_id,
      organizationKey: hco.organization_key,
      healthcareOrganizationId: hco.id,
      publicName: hco.public_name,
      websitePublished: hco.website_published === true,
      instancePresent: Boolean(instance),
      instanceId: instance && instance.id,
      templateId: instance && instance.templateId,
      templateVersion: instance && instance.templateVersion,
      slug: instance && instance.slug,
      scopeRef: instance && instance.scopeRef,
      duplicateCount: instances.length,
      publishedContentPresent: publishedCount > 0,
      draftPresent: draftCount > 0,
      juflona,
      classification:
        instances.length > 1
          ? "duplicate_website"
          : juflona
            ? "legacy_juflona_mapping"
            : classifyInstance(instance, contentCount),
    });
  }
  return { ok: true, clinics: rows };
}

async function backfillActiveClinicWebsites(db, input) {
  const dryRun = Boolean(input && input.dryRun);
  const audit = await auditActiveClinicWebsites(db);
  const actions = [];
  for (const clinic of audit.clinics) {
    if (clinic.duplicateCount > 1) {
      actions.push({ organizationKey: clinic.organizationKey, action: "skip_duplicate", dryRun });
      continue;
    }
    if (clinic.instancePresent) {
      actions.push({ organizationKey: clinic.organizationKey, action: "unchanged", dryRun });
      continue;
    }
    actions.push({
      organizationKey: clinic.organizationKey,
      action: clinic.juflona ? "map_juflona" : "provision_starter",
      dryRun,
    });
    if (dryRun) continue;
    if (clinic.juflona) {
      await migrateJuflonaWebsite(db, {
        organizationId: clinic.organizationId,
        clinicKey: clinic.organizationKey,
        healthcareOrganization: {
          id: clinic.healthcareOrganizationId,
          publicName: clinic.publicName,
        },
        actorIdentityId: (input && input.actorIdentityId) || null,
      });
    } else {
      await provisionActiveClinicWebsite(db, {
        organizationId: clinic.organizationId,
        slug: clinic.organizationKey,
        publicName: clinic.publicName,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        actorIdentityId: (input && input.actorIdentityId) || null,
        status: "coming_soon",
      });
    }
    await recordWebsiteAudit(db, {
      organizationId: clinic.organizationId,
      actorIdentityId: (input && input.actorIdentityId) || null,
      actionKey: "website.backfill",
      metadata: { entity_key: clinic.organizationKey, juflona: clinic.juflona },
    });
  }
  return { ok: true, dryRun, actions, clinics: audit.clinics };
}

module.exports = {
  auditActiveClinicWebsites,
  backfillActiveClinicWebsites,
  getWebsiteChecklist,
};
