"use strict";

/**
 * Clinic website public availability (HCO.website_published).
 * Distinct from content publication (website_versions status=published).
 * Approving a content version must not silently make the clinic public.
 */

const instanceRepo = require("../../platform/website/instanceRepository");
const versionService = require("../../platform/website/versionService");
const resolver = require("../../platform/website/resolver");
const { getWebsiteTemplate } = require("../../platform/website/templateRegistry");
const { evaluatePublicationReadiness } = require("../../platform/website/checklistService");
const { recordWebsiteAudit, listWebsiteAudit } = require("../../platform/website/auditService");
const { applyLifecycle } = require("../../platform/website/lifecycleService");
const { LIFECYCLE_STATUS } = require("../../platform/website/lifecycleStatus");
const { organizationHasActiveProduct } = require("../../platform/services/organizationProductService");
const {
  getDeploymentProfile,
  CODE_ACTIVECLINIC_ORG_PRODUCTION,
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ACTIVECLINIC_PRONLINE_TESTING,
} = require("../../platform/config/deploymentProfiles");
const { registerActiveClinicWebsiteTemplate } = require("../website/activeClinicWebsiteTemplate");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "clinic_not_found",
  INSTANCE_MISSING: "website_instance_not_found",
  NO_APPROVED_VERSION: "approved_version_required",
  PRODUCT_NOT_ACTIVE: "product_not_active",
  TENANT_INVALID: "tenant_not_valid",
  NOT_READY: "publication_not_ready",
  ALREADY_PUBLIC: "already_public",
  ALREADY_UNPUBLISHED: "already_unpublished",
});

const ACTION = Object.freeze({
  PUBLISH: "website.availability.publish",
  UNPUBLISH: "website.availability.unpublish",
  OVERRIDE: "website.availability.publish.override",
});

async function loadClinicWebsiteOperational(db, organizationId) {
  const hco = await db.query(
    `SELECT public_name, public_phone_display, public_email_display, public_booking_enabled
       FROM activeclinic.healthcare_organizations
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );
  if (!hco.rows[0]) return {};
  const fac = await db.query(
    `SELECT address_line_1, city, province, country_code, public_hours_json
       FROM activeclinic.facilities
      WHERE organization_id = $1 AND is_primary = true
      LIMIT 1`,
    [organizationId]
  );
  const f = fac.rows[0] || {};
  const address = [f.address_line_1, f.city, f.province, f.country_code].filter(Boolean).join(", ");
  return {
    clinic_name: hco.rows[0].public_name,
    phone: hco.rows[0].public_phone_display,
    email: hco.rows[0].public_email_display,
    booking: hco.rows[0].public_booking_enabled === true,
    address: address || null,
    hours: f.public_hours_json || null,
  };
}

function publicOriginForEnv(env) {
  const source = env || process.env;
  const mode = String(source.DEPLOYMENT_ENV || source.DATABASE_IDENTITY_ENV || "").toLowerCase();
  const code =
    mode === "production"
      ? CODE_ACTIVECLINIC_ORG_PRODUCTION
      : String(source.PLATFORM_DEPLOYMENT_CODE || "").includes("pronline")
        ? CODE_ACTIVECLINIC_PRONLINE_TESTING
        : CODE_ACTIVECLINIC_ORG_V6;
  try {
    const profile = getDeploymentProfile({ ...source, PLATFORM_DEPLOYMENT_CODE: code });
    return profile && profile.publicOrigin ? String(profile.publicOrigin) : "";
  } catch {
    return "";
  }
}

function publicClinicPath(slug) {
  const key = String(slug || "").trim();
  return key ? `/clinics/${encodeURIComponent(key)}` : null;
}

async function loadOrganizationByKey(db, organizationKey) {
  const key = String(organizationKey || "").trim().toLowerCase();
  if (!key) return null;
  const rows = await db.query(
    `SELECT id, organization_key, display_name, status
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [key]
  );
  return rows.rows[0] || null;
}

async function loadHco(db, organizationId) {
  const rows = await db.query(
    `SELECT id, organization_id, public_name, status, website_published
       FROM activeclinic.healthcare_organizations
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );
  return rows.rows[0] || null;
}

async function latestPublishedVersion(db, instance) {
  const listed = await versionService.listWebsiteVersions(db, {
    instanceId: instance.id,
    organizationId: instance.organizationId,
  });
  return (listed.versions || []).find((v) => v.status === "published") || null;
}

async function evaluateClinicWebsiteReadiness(db, instance, operational) {
  registerActiveClinicWebsiteTemplate();
  const resolved = await resolver.resolveWebsiteContent(db, {
    organizationId: instance.organizationId,
    instance,
    mode: resolver.MODE.LIVE,
  });
  const template =
    resolved.template || getWebsiteTemplate(instance.templateId, instance.templateVersion);
  return evaluatePublicationReadiness({
    template,
    resolved,
    operational: operational || {},
    hasPublishedVersion: true,
    firstPublication: false,
  });
}

async function lastAvailabilityEvent(db, organizationId, instanceId) {
  const audit = await listWebsiteAudit(db, {
    organizationId,
    instanceId,
    limit: 80,
  });
  const events = (audit.events || []).filter(
    (e) => e.actionKey === ACTION.PUBLISH || e.actionKey === ACTION.UNPUBLISH
  );
  return events[0] || null;
}

async function getClinicWebsiteAvailability(db, input) {
  const org = await loadOrganizationByKey(db, input && input.organizationKey);
  if (!org) return { ok: false, code: RESULT.NOT_FOUND };
  const hco = await loadHco(db, org.id);
  const instances = await instanceRepo.listWebsiteInstancesForOrganization(
    db,
    org.id,
    "activeclinic"
  );
  const instance = instances[0] || null;
  const version = instance ? await latestPublishedVersion(db, instance) : null;
  const operational = instance ? await loadClinicWebsiteOperational(db, org.id) : {};
  const readiness = instance
    ? await evaluateClinicWebsiteReadiness(db, instance, operational)
    : null;
  const lastEvent = instance ? await lastAvailabilityEvent(db, org.id, instance.id) : null;
  const path = instance ? publicClinicPath(instance.slug) : null;
  const origin = publicOriginForEnv(input && input.env);
  return {
    ok: true,
    organization: org,
    healthcareOrganization: hco
      ? {
          id: hco.id,
          publicName: hco.public_name,
          status: hco.status,
          websitePublished: hco.website_published === true,
        }
      : null,
    instance,
    latestApprovedVersion: version,
    readiness,
    lastToggle: lastEvent
      ? {
          actorIdentityId: lastEvent.actorIdentityId,
          actionKey: lastEvent.actionKey,
          at: lastEvent.createdAt,
          metadata: lastEvent.metadata,
        }
      : null,
    publicPath: path,
    publicUrl: origin && path ? `${origin}${path}` : path,
    availabilityLabel: hco && hco.website_published === true ? "Public" : "Not public",
  };
}

async function setClinicWebsiteAvailability(db, input) {
  const wantPublic = Boolean(input && input.public);
  const org = await loadOrganizationByKey(db, input && input.organizationKey);
  if (!org) return { ok: false, code: RESULT.NOT_FOUND };
  if (String(org.status) !== "active") {
    return { ok: false, code: RESULT.TENANT_INVALID };
  }
  const enabled = await organizationHasActiveProduct(db, {
    organizationId: org.id,
    applicationCode: "activeclinic",
  });
  if (!enabled) return { ok: false, code: RESULT.PRODUCT_NOT_ACTIVE };

  const hco = await loadHco(db, org.id);
  if (!hco) return { ok: false, code: RESULT.NOT_FOUND };
  if (String(hco.status) !== "active") {
    return { ok: false, code: RESULT.TENANT_INVALID };
  }

  const instances = await instanceRepo.listWebsiteInstancesForOrganization(
    db,
    org.id,
    "activeclinic"
  );
  const instance = instances[0] || null;
  if (!instance) return { ok: false, code: RESULT.INSTANCE_MISSING };

  const currentlyPublic = hco.website_published === true;
  if (wantPublic && currentlyPublic) {
    return { ok: true, code: RESULT.ALREADY_PUBLIC, websitePublished: true, organizationKey: org.organization_key };
  }
  if (!wantPublic && !currentlyPublic) {
    return { ok: true, code: RESULT.ALREADY_UNPUBLISHED, websitePublished: false, organizationKey: org.organization_key };
  }

  const version = await latestPublishedVersion(db, instance);
  const operational = await loadClinicWebsiteOperational(db, org.id);
  const readiness = await evaluateClinicWebsiteReadiness(db, instance, operational);

  if (wantPublic) {
    if (!version) return { ok: false, code: RESULT.NO_APPROVED_VERSION, readiness };
    if (!UUID_RE.test(String(hco.id))) return { ok: false, code: RESULT.INVALID_INPUT };
    if (readiness.readyToPublish !== true && input.overrideReadiness !== true) {
      return { ok: false, code: RESULT.NOT_READY, readiness };
    }
  }

  await db.query(
    `UPDATE activeclinic.healthcare_organizations
        SET website_published = $2, updated_at = now()
      WHERE id = $1 AND organization_id = $3`,
    [hco.id, wantPublic, org.id]
  );
  await applyLifecycle(db, {
    organizationId: org.id,
    instanceId: instance.id,
    lifecycleStatus: wantPublic ? LIFECYCLE_STATUS.PUBLIC : LIFECYCLE_STATUS.PROVISIONAL,
    actorIdentityId: input.actorIdentityId || null,
    reason: wantPublic ? "Platform Admin published website" : "Platform Admin unpublished website",
    notePublic: wantPublic ? null : "Website is not public.",
    notesTenantVisible: !wantPublic,
    syncProductAvailability: false,
    auditActionKey: wantPublic ? "website.lifecycle.public" : "website.lifecycle.provisional",
    moderationActionKey: wantPublic
      ? "website.lifecycle.public"
      : "website.lifecycle.provisional",
    force: true,
  });

  if (wantPublic && input.overrideReadiness === true && readiness.readyToPublish !== true) {
    await recordWebsiteAudit(db, {
      organizationId: org.id,
      instanceId: instance.id,
      actorIdentityId: input.actorIdentityId || null,
      actionKey: ACTION.OVERRIDE,
      versionId: version ? version.id : null,
      metadata: {
        codes: readiness.codes || [],
        reason: String(input.reason || "").slice(0, 500) || null,
      },
    });
  }

  await recordWebsiteAudit(db, {
    organizationId: org.id,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: wantPublic ? ACTION.PUBLISH : ACTION.UNPUBLISH,
    versionId: version ? version.id : null,
    metadata: {
      previous: currentlyPublic,
      next: wantPublic,
      version_number: version ? version.versionNumber : null,
      ready: readiness.readyToPublish === true,
      codes: readiness.codes || [],
      reason: String(input.reason || "").slice(0, 500) || null,
    },
  });

  const path = publicClinicPath(instance.slug);
  const origin = publicOriginForEnv(input.env);
  return {
    ok: true,
    code: RESULT.OK,
    websitePublished: wantPublic,
    organizationKey: org.organization_key,
    publicPath: path,
    publicUrl: origin && path ? `${origin}${path}` : path,
    latestApprovedVersion: version,
    readiness,
  };
}

module.exports = {
  RESULT,
  ACTION,
  loadClinicWebsiteOperational,
  getClinicWebsiteAvailability,
  setClinicWebsiteAvailability,
  publicClinicPath,
};
