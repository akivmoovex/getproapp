"use strict";

const { withProvisioningTransaction } = require("../../platform/db/provisioningTransaction");
const { provisionWebsiteInstance } = require("../../platform/website/provisionService");
const instanceRepo = require("../../platform/website/instanceRepository");
const { recordWebsiteAudit } = require("../../platform/website/auditService");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("./activeClinicWebsiteTemplate");
const { createHealthcareOrganization, getHealthcareOrganizationByOrganizationId } = require("../services/healthcareOrganizationService");
const { createFacility } = require("../services/facilityService");
const { buildActiveClinicWebsiteTemplateContent } = require("./activeClinicWebsiteTemplateContent");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  HCO_FAILED: "healthcare_organization_failed",
  FACILITY_FAILED: "facility_failed",
  WEBSITE_FAILED: "website_provision_failed",
  SLUG_COLLISION: "slug_collision",
});

function starterOverrides(publicName, extras) {
  const extra = extras && typeof extras === "object" ? extras : {};
  return buildActiveClinicWebsiteTemplateContent({
    publicName,
    phone: extra.phone || extra.contactPhone || "",
    email: extra.email || extra.contactEmail || "",
    address: extra.address || "",
    hours: extra.hours || "",
  });
}

async function provisionActiveClinicWebsite(db, input) {
  registerActiveClinicWebsiteTemplate();
  const organizationId = String((input && input.organizationId) || "");
  const slug = String((input && input.slug) || "").trim().toLowerCase();
  if (!organizationId || !slug) {
    return { ok: false, code: RESULT.INVALID_INPUT, instance: null };
  }

  const existing = await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId,
    productCode: "activeclinic",
  });
  if (existing && input.allowExisting !== false) {
    return { ok: true, code: instanceRepo.RESULT.DUPLICATE, instance: existing, created: false };
  }

  const provisioned = await provisionWebsiteInstance(db, {
    organizationId,
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: input.templateVersion || ACTIVECLINIC_TEMPLATE_VERSION,
    slug,
    status: input.status || "coming_soon",
    scopeKind: "clinic",
    scopeRef: null,
    actorIdentityId: input.actorIdentityId || null,
    contentOverrides: {
      ...starterOverrides(input.publicName, {
        phone: input.phone || input.contactPhone || "",
        email: input.email || input.contactEmail || "",
        address: input.address || "",
        hours: input.hours || "",
      }),
      ...(input.contentOverrides || {}),
    },
    lifecycleStatus: input.lifecycleStatus,
    publishPolicy: input.publishPolicy,
    adapterMode: input.adapterMode,
  });
  if (!provisioned.ok) {
    return {
      ok: false,
      code: provisioned.code === instanceRepo.RESULT.SLUG_COLLISION ? RESULT.SLUG_COLLISION : RESULT.WEBSITE_FAILED,
      instance: null,
    };
  }
  return provisioned;
}

async function provisionActiveClinicClinic(db, input) {
  registerActiveClinicWebsiteTemplate();
  const run = async (client) => {
    const organizationId = String((input && input.organizationId) || "");
    const slug = String((input && input.slug) || "").trim().toLowerCase();
    const publicName = String((input && input.publicName) || "").trim();
    if (!organizationId || !slug || !publicName) {
      return { ok: false, code: RESULT.INVALID_INPUT };
    }

    let hco = null;
    const createdHco = await createHealthcareOrganization(client, {
      organizationId,
      legalName: input.legalName || publicName,
      publicName,
      organizationType: input.organizationType || "independent_facility",
      countryCode: input.countryCode || "ZM",
      timezone: input.timezone || "Africa/Lusaka",
      status: "active",
      actorPlatformIdentityId: input.actorIdentityId || null,
      skipWebsiteProvision: true,
    });
    if (createdHco.ok) {
      hco = createdHco.healthcareOrganization;
    } else if (createdHco.code === "healthcare_organization_exists" && createdHco.healthcareOrganization) {
      hco = createdHco.healthcareOrganization;
    } else {
      const existingHco = await getHealthcareOrganizationByOrganizationId(client, { organizationId });
      if (!existingHco || !existingHco.ok) {
        return { ok: false, code: RESULT.HCO_FAILED, reason: createdHco.code };
      }
      hco = existingHco.healthcareOrganization;
    }

    let facility = null;
    if (input.skipFacility !== true && input.phone) {
      const existingFac = await client.query(
        `SELECT id, facility_key, display_name FROM activeclinic.facilities
          WHERE healthcare_organization_id = $1 AND facility_key = $2
          LIMIT 1`,
        [hco.id, input.facilityKey || "hq"]
      );
      if (existingFac.rows[0]) {
        facility = {
          id: existingFac.rows[0].id,
          facilityKey: existingFac.rows[0].facility_key,
          displayName: existingFac.rows[0].display_name,
        };
      } else {
        const createdFacility = await createFacility(client, {
          organizationId,
          healthcareOrganizationId: hco.id,
          facilityKey: input.facilityKey || "hq",
          displayName: input.facilityDisplayName || `${publicName} – Main`,
          facilityType: input.facilityType || "clinic",
          isPrimary: true,
          countryCode: input.countryCode || "ZM",
          timezone: input.timezone || "Africa/Lusaka",
          status: "active",
          phone: input.phone || null,
          city: input.city || null,
          province: input.province || null,
        });
        if (createdFacility.ok) {
          facility = createdFacility.facility;
        } else if (createdFacility.code === "facility_key_exists") {
          const again = await client.query(
            `SELECT id, facility_key, display_name FROM activeclinic.facilities
              WHERE healthcare_organization_id = $1 AND facility_key = $2
              LIMIT 1`,
            [hco.id, input.facilityKey || "hq"]
          );
          facility = again.rows[0]
            ? {
                id: again.rows[0].id,
                facilityKey: again.rows[0].facility_key,
                displayName: again.rows[0].display_name,
              }
            : null;
        } else {
          return { ok: false, code: RESULT.FACILITY_FAILED, reason: createdFacility.code };
        }
      }
    }

    await client.query("SAVEPOINT ac_clinic_website");
    let website;
    try {
      // LEGACY_COMPATIBILITY: product provisioner may create the website first.
      // Shared registration lifecycle also calls initializeOrganizationWebsite (idempotent).
      website = await provisionActiveClinicWebsite(client, {
        organizationId,
        slug,
        publicName,
        healthcareOrganizationId: hco.id,
        actorIdentityId: input.actorIdentityId || null,
        status: input.websiteStatus || "coming_soon",
        phone: input.phone || "",
        email: input.email || input.contactEmail || "",
        address: input.address || "",
        contentOverrides: input.contentOverrides || null,
        templateVersion: input.templateVersion,
      });
      if (!website.ok) {
        await client.query("ROLLBACK TO SAVEPOINT ac_clinic_website");
        return {
          ok: false,
          code: RESULT.WEBSITE_FAILED,
          reason: website.code,
          healthcareOrganization: hco,
          facility,
          instance: null,
        };
      }
      await client.query("RELEASE SAVEPOINT ac_clinic_website");
    } catch (err) {
      try {
        await client.query("ROLLBACK TO SAVEPOINT ac_clinic_website");
      } catch {
        /* outer TX will abort */
      }
      return {
        ok: false,
        code: RESULT.WEBSITE_FAILED,
        reason: err && err.message ? String(err.message).slice(0, 180) : "website_failed",
        healthcareOrganization: hco,
        facility,
        instance: null,
      };
    }

    await recordWebsiteAudit(client, {
      organizationId,
      instanceId: website.instance.id,
      actorIdentityId: input.actorIdentityId || null,
      actionKey: "website.clinic.provision",
      metadata: { entity_key: slug, facility_key: facility && facility.facilityKey },
    });

    return {
      ok: true,
      code: RESULT.OK,
      healthcareOrganization: hco,
      facility,
      instance: website.instance,
      created: Boolean(website.created),
    };
  };

  if (db && typeof db.connect === "function" && typeof db.release !== "function") {
    return withProvisioningTransaction(db, run);
  }
  return run(db);
}

module.exports = {
  RESULT,
  starterOverrides,
  provisionActiveClinicWebsite,
  provisionActiveClinicClinic,
};
