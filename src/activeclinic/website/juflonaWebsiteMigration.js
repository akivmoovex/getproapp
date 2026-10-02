"use strict";

const { JULFLONA_CLINIC_KEY } = require("../services/activeClinicDemoClinicSpec");
const { DEMO_CLINIC_HEROES } = require("../services/activeClinicPublicMediaService");
const { provisionActiveClinicWebsite } = require("./provisionActiveClinicWebsite");
const contentService = require("../../platform/website/contentService");
const instanceRepo = require("../../platform/website/instanceRepository");
const resolver = require("../../platform/website/resolver");
const { registerActiveClinicWebsiteTemplate } = require("./activeClinicWebsiteTemplate");

function juflonaContentOverrides(hco, clinicKey) {
  const key = String(clinicKey || "").trim();
  const hero = DEMO_CLINIC_HEROES[key];
  return {
    "home.hero.title": hco.publicName ? `Welcome to ${hco.publicName}` : null,
    "home.hero.subtitle": hco.websiteAbout || hco.website_about || null,
    "home.hero.eyebrow": hco.websiteTagline || hco.website_tagline || null,
    "home.hero.image": hero && hero.src ? { src: hero.src, alt: hco.publicName || "Clinic" } : null,
    "about.story.body": hco.websiteAbout || hco.website_about || null,
    "about.story.heading": "About our clinic",
    "contact.phone": hco.publicPhoneDisplay || hco.public_phone_display || null,
    "contact.email": hco.publicEmailDisplay || hco.public_email_display || null,
    "footer.legal":
      "This website does not provide emergency medical care. In an emergency call local emergency services.",
  };
}

async function migrateJuflonaWebsite(db, input) {
  registerActiveClinicWebsiteTemplate();
  const organizationId = String((input && input.organizationId) || "");
  const clinicKey = String((input && input.clinicKey) || JULFLONA_CLINIC_KEY);
  const hco = input.healthcareOrganization || {};
  const overrides = {
    ...juflonaContentOverrides(
      {
        publicName: hco.publicName || hco.public_name,
        websiteAbout: hco.websiteAbout || hco.website_about,
        websiteTagline: hco.websiteTagline || hco.website_tagline,
        publicPhoneDisplay: hco.publicPhoneDisplay || hco.public_phone_display,
        publicEmailDisplay: hco.publicEmailDisplay || hco.public_email_display,
      },
      clinicKey
    ),
    ...(input.contentOverrides || {}),
  };

  const provisioned = await provisionActiveClinicWebsite(db, {
    organizationId,
    slug: clinicKey,
    publicName: overrides["home.hero.title"] ? hco.publicName || hco.public_name : clinicKey,
    healthcareOrganizationId: hco.id,
    actorIdentityId: input.actorIdentityId || null,
    status: "published",
    contentOverrides: overrides,
  });
  if (!provisioned.ok) return provisioned;

  const instance =
    provisioned.instance ||
    (await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
      organizationId,
      productCode: "activeclinic",
    }));
  if (instance && !provisioned.created) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value == null) continue;
      await contentService.saveWebsiteDraft(db, {
        organizationId,
        instanceId: instance.id,
        contentKey: key,
        value,
        actorIdentityId: input.actorIdentityId || null,
      });
    }
    const draft = await resolver.resolveWebsiteContent(db, {
      organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    await contentService.applyPublishedSnapshot(
      db,
      instance,
      resolver.snapshotFromResolved(draft),
      input.actorIdentityId || null
    );
  }
  return { ok: true, instance, created: Boolean(provisioned.created), mappedKeys: Object.keys(overrides) };
}

module.exports = {
  JULFLONA_CLINIC_KEY,
  juflonaContentOverrides,
  migrateJuflonaWebsite,
};
