"use strict";

/**
 * Configure the V5 testing Demo Church tenant:
 * rename automated-test-church → demo-church, ensure Demo Church Lusaka + Ndola
 * branches with autonomous websites, and publish independently.
 *
 * Testing identity database only. Idempotent where practical.
 */

const { checkDatabaseIdentity } = require("../../../db/scripts/lib/databaseIdentity");
const {
  renameBlessBoardOrganizationKey,
  EXPECTED_IDENTITY_KEY,
} = require("./renameBlessBoardOrganizationKey");
const {
  renameBlessBoardBranchKey,
} = require("./renameBlessBoardBranchKey");
const { createBlessBoardBranch } = require("./createBlessBoardBranch");
const { deactivateBlessBoardBranch } = require("./deactivateBlessBoardBranch");
const {
  initializeBranchWebsiteFromChurch,
} = require("./initializeBranchWebsiteFromChurch");
const {
  updatePublicPage,
  updatePageSection,
  createPageSection,
  updateMinistry,
  createMinistry,
} = require("./publicContentAdminService");
const contentRepo = require("../repositories/publicContentRepository");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const scopeSettingsRepo = require("../repositories/websiteScopeSettingsRepository");
const registry = require("./websiteSettingKeyRegistry");
const { saveHomeServiceTimes } = require("./homeServiceTimesService");
const { publishChurchWebsite } = require("./churchWebsitePublishService");
const { updateChurchSettings } = require("./blessBoardSettingsService");

const STATUS = Object.freeze({
  OK: "ok",
  REFUSED_ENVIRONMENT: "refused_environment",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  FAILED: "failed",
});

const FROM_KEY = "automated-test-church";
const TO_KEY = "demo-church";
const DISPLAY_NAME = "Demo Church";
const HOSTNAME = "demo-church.blessboard.test";

const MEDIA = Object.freeze({
  hqHero: "/church/images/homepage/apex-feature-multibranch.jpg",
  lusakaHero: "/church/images/homepage/desktop-hero-auditorium.jpg",
  ndolaHero: "/church/images/homepage/mobile-hero-sanctuary.jpg",
  hqAbout: "/church/images/tenant-public/about-hero-building.jpg",
  lusakaAbout: "/church/images/homepage/mobile-ministry-worship.jpg",
  ndolaAbout: "/church/images/homepage/mobile-ministry-children.jpg",
});

const LUSAKA = Object.freeze({
  branchKey: "demo-church-lusaka",
  legacyKeys: Object.freeze(["lusaka"]),
  displayName: "Demo Church Lusaka",
  publicName: "Demo Church Lusaka",
  city: "Lusaka",
  countryCode: "ZM",
  timezone: "Africa/Lusaka",
  tagline: "Faith, community and service in Zambia's capital.",
  addressLine1: "12 Independence Demo Avenue",
  addressLine2: "Ridgeway Demo District",
  phone: "+260-211-010001",
  email: "lusaka@demo-church.example.test",
  heroTitle: "Welcome to Demo Church Lusaka",
  heroSubtitle: "Faith, community and service in Zambia's capital.",
  aboutHeading: "Growing together in Lusaka",
  aboutText:
    "Demo Church Lusaka brings families, students and professionals together for worship, discipleship and community service.",
  ministryName: "Lusaka Community Outreach",
  ministryDescription:
    "Serving local families through mentoring, practical support and neighborhood partnerships.",
  contactHeading: "Visit us in Lusaka",
  websiteName: "Demo Church Lusaka",
  heroMedia: MEDIA.lusakaHero,
  aboutMedia: MEDIA.lusakaAbout,
  serviceTimes: [
    {
      id: "lusaka-sunday",
      name: "Sunday Celebration",
      day: "sunday",
      startTime: "09:00",
      endTime: "10:30",
      location: "Lusaka Main Hall (demo)",
      note: "Fictional demo service",
      enabled: true,
      sortOrder: 10,
    },
    {
      id: "lusaka-wed",
      name: "Wednesday Bible Study",
      day: "wednesday",
      startTime: "18:00",
      endTime: "19:15",
      location: "Lusaka Fellowship Room (demo)",
      note: "Fictional demo study",
      enabled: true,
      sortOrder: 20,
    },
    {
      id: "lusaka-fri",
      name: "Friday Youth Gathering",
      day: "friday",
      startTime: "17:30",
      endTime: "19:00",
      location: "Lusaka Youth Hall (demo)",
      note: "Fictional demo youth",
      enabled: true,
      sortOrder: 30,
    },
  ],
});

const NDOLA = Object.freeze({
  branchKey: "demo-church-ndola",
  legacyKeys: Object.freeze(["kitwe"]),
  displayName: "Demo Church Ndola",
  publicName: "Demo Church Ndola",
  city: "Ndola",
  countryCode: "ZM",
  timezone: "Africa/Lusaka",
  tagline: "Building faith and strengthening families on the Copperbelt.",
  addressLine1: "88 Independence Demo Crescent",
  addressLine2: "Northrise Demo Area",
  phone: "+260-212-030003",
  email: "ndola@demo-church.example.test",
  heroTitle: "Welcome to Demo Church Ndola",
  heroSubtitle: "Building faith and strengthening families on the Copperbelt.",
  aboutHeading: "Serving the Ndola community",
  aboutText:
    "Demo Church Ndola is a welcoming community focused on spiritual growth, family life and practical service across the Copperbelt.",
  ministryName: "Ndola Family Ministry",
  ministryDescription:
    "Supporting children, young people and families through teaching, fellowship and local outreach.",
  contactHeading: "Visit us in Ndola",
  websiteName: "Demo Church Ndola",
  heroMedia: MEDIA.ndolaHero,
  aboutMedia: MEDIA.ndolaAbout,
  serviceTimes: [
    {
      id: "ndola-sunday",
      name: "Sunday Worship",
      day: "sunday",
      startTime: "10:00",
      endTime: "11:30",
      location: "Ndola Sanctuary (demo)",
      note: "Fictional demo service",
      enabled: true,
      sortOrder: 10,
    },
    {
      id: "ndola-tue",
      name: "Tuesday Prayer Meeting",
      day: "tuesday",
      startTime: "18:00",
      endTime: "19:00",
      location: "Ndola Prayer Room (demo)",
      note: "Fictional demo prayer",
      enabled: true,
      sortOrder: 20,
    },
    {
      id: "ndola-sat",
      name: "Saturday Family Fellowship",
      day: "saturday",
      startTime: "10:00",
      endTime: "11:30",
      location: "Ndola Family Hall (demo)",
      note: "Fictional demo fellowship",
      enabled: true,
      sortOrder: 30,
    },
  ],
});

const HQ_CONTENT = Object.freeze({
  websiteName: "Demo Church",
  heroTitle: "Welcome to Demo Church",
  heroSubtitle: "One church serving communities across Zambia.",
  aboutHeading: "A church for every generation",
  aboutText:
    "Demo Church is a growing community committed to worship, discipleship and practical service.",
  locationsHeading: "Our locations",
  locationsText:
    "Join us in Lusaka and Ndola — two distinct congregations, one Demo Church family.",
  heroMedia: MEDIA.hqHero,
  aboutMedia: MEDIA.hqAbout,
});

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   actorUserId?: string|null,
 *   publish?: boolean,
 *   expectedIdentityKey?: string,
 * }} [input]
 */
async function assertTestingIdentity(db) {
  const identity = await checkDatabaseIdentity(db, {
    identityKey: EXPECTED_IDENTITY_KEY,
  });
  if (!identity.ok || !identity.row) {
    return {
      ok: false,
      status: STATUS.REFUSED_ENVIRONMENT,
      reason: identity.code || "identity_check_failed",
    };
  }
  if (String(identity.row.environment_code || "").toLowerCase() !== "testing") {
    return {
      ok: false,
      status: STATUS.REFUSED_ENVIRONMENT,
      reason: "environment_not_testing",
    };
  }
  return { ok: true, identity: identity.row };
}

async function findOrgByKeys(db, keys) {
  const { rows } = await db.query(
    `SELECT id, organization_key, display_name, status, data_environment
       FROM platform.organizations
      WHERE organization_key = ANY($1::text[])
      ORDER BY CASE organization_key WHEN $2 THEN 0 ELSE 1 END
      LIMIT 1`,
    [keys, TO_KEY]
  );
  return rows[0] || null;
}

async function loadChurch(db, organizationId) {
  const { rows } = await db.query(
    `SELECT id, organization_id, church_key, display_name, status, data_environment
       FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`,
    [organizationId]
  );
  return rows[0] || null;
}

async function listBranches(db, churchId) {
  const { rows } = await db.query(
    `SELECT id, church_id, branch_key, display_name, branch_type, status, is_primary
       FROM blessboard.branches
      WHERE church_id = $1
      ORDER BY is_primary DESC, branch_key`,
    [churchId]
  );
  return rows;
}

async function ensureBranch(db, { organizationId, churchId, actorUserId, spec }) {
  const lookupKeys = [spec.branchKey, ...((spec.legacyKeys && [...spec.legacyKeys]) || [])];
  const existing = await db.query(
    `SELECT id, church_id, branch_key, display_name, branch_type, status, is_primary
       FROM blessboard.branches
      WHERE church_id = $1 AND branch_key = ANY($2::text[])
      ORDER BY CASE branch_key WHEN $3 THEN 0 ELSE 1 END
      LIMIT 1`,
    [churchId, lookupKeys, spec.branchKey]
  );
  if (existing.rows[0]) {
    let branch = existing.rows[0];
    let renameResult = null;
    if (String(branch.branch_key) !== spec.branchKey) {
      renameResult = await renameBlessBoardBranchKey(db, {
        organizationId,
        churchId,
        branchId: branch.id,
        fromKey: branch.branch_key,
        toKey: spec.branchKey,
        displayName: spec.displayName,
        actorUserId,
      });
      if (!renameResult.ok) {
        return { ok: false, created: renameResult, branch: null, reason: "branch_rename_failed" };
      }
      branch = {
        ...branch,
        branch_key: spec.branchKey,
        display_name: spec.displayName,
      };
    }

    if (String(branch.status) !== "active") {
      await db.query(
        `UPDATE blessboard.branches
            SET status = 'active',
                display_name = $3,
                country_code = $4,
                timezone = $5,
                updated_at = now()
          WHERE id = $1 AND church_id = $2`,
        [branch.id, churchId, spec.displayName, spec.countryCode, spec.timezone]
      );
    } else if (String(branch.display_name) !== spec.displayName) {
      await db.query(
        `UPDATE blessboard.branches
            SET display_name = $3, country_code = $4, timezone = $5, updated_at = now()
          WHERE id = $1 AND church_id = $2`,
        [branch.id, churchId, spec.displayName, spec.countryCode, spec.timezone]
      );
    }
    await settingsRepo.upsertBranchSettings(db, branch.id, {
      publicName: spec.publicName,
      email: spec.email,
      phone: spec.phone,
      timezone: spec.timezone,
      countryCode: spec.countryCode,
      addressLine1: spec.addressLine1,
      addressLine2: spec.addressLine2,
      city: spec.city,
      provinceState: null,
      postalCode: null,
      latitude: null,
      longitude: null,
    });
    let init = await initializeBranchWebsiteFromChurch(db, {
      organizationId,
      churchId,
      branchId: branch.id,
      actorUserId,
    });
    return {
      ok: true,
      branch: { ...branch, display_name: spec.displayName, status: "active", branch_key: spec.branchKey },
      created: false,
      renamed: Boolean(renameResult && !renameResult.alreadyRenamed),
      rename: renameResult,
      init,
    };
  }

  const created = await createBlessBoardBranch(db, {
    organizationId,
    churchId,
    actorUserId,
    displayName: spec.displayName,
    branchKey: spec.branchKey,
    email: spec.email,
    phone: spec.phone,
    timezone: spec.timezone,
    countryCode: spec.countryCode,
    addressLine1: spec.addressLine1,
    addressLine2: spec.addressLine2,
    city: spec.city,
  });
  if (!created.ok) {
    return { ok: false, created, branch: null };
  }
  return {
    ok: true,
    branch: created.branch,
    created: true,
    init: created.websiteInitialization || null,
  };
}

async function patchSectionMedia(db, sectionId, mediaUrl) {
  if (!sectionId || !mediaUrl) return;
  await contentRepo.updateSection(db, sectionId, { mediaUrl });
}

async function ensureHomeHero(db, { churchId, branchId, heading, bodyText, mediaUrl }) {
  const page = await contentRepo.findPageByScope(db, {
    churchId,
    branchId: branchId || null,
    pageKey: "home",
  });
  if (!page) return { ok: false, reason: "home_page_missing" };
  const sections = await contentRepo.listSectionsForPage(db, page.id);
  let hero = (sections || []).find((s) => s.sectionKey === "hero" || s.sectionType === "hero");
  if (!hero) {
    const created = await createPageSection(db, {
      pageId: page.id,
      sectionKey: "hero",
      sectionType: "hero",
      heading,
      bodyText,
      sortOrder: 1,
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      allowPublishedWrite: true,
    });
    if (!created.ok || !created.section) return { ok: false, reason: "hero_create_failed" };
    hero = created.section;
  } else {
    await updatePageSection(db, hero.id, {
      heading,
      bodyText,
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      allowPublishedWrite: true,
    });
  }
  await patchSectionMedia(db, hero.id, mediaUrl);
  await updatePublicPage(db, page.id, {
    title: heading,
    status: "published",
    confirmPublish: true,
    enforcePublishConfirm: true,
    allowPublishedWrite: true,
  });
  return { ok: true, pageId: page.id, sectionId: hero.id };
}

async function ensureAboutSection(db, { churchId, branchId, heading, bodyText, mediaUrl }) {
  const page = await contentRepo.findPageByScope(db, {
    churchId,
    branchId: branchId || null,
    pageKey: "about",
  });
  if (!page) return { ok: false, reason: "about_page_missing" };
  const sections = await contentRepo.listSectionsForPage(db, page.id);
  let about =
    (sections || []).find((s) => s.sectionKey === "mission" || s.sectionKey === "about") ||
    (sections || [])[0];
  if (!about) {
    const created = await createPageSection(db, {
      pageId: page.id,
      sectionKey: "mission",
      sectionType: "text",
      heading,
      bodyText,
      sortOrder: 1,
      status: "draft",
    });
    if (!created.ok || !created.section) return { ok: false, reason: "about_create_failed" };
    about = created.section;
  } else {
    await updatePageSection(db, about.id, {
      heading,
      bodyText,
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      allowPublishedWrite: true,
    });
  }
  if (mediaUrl) await patchSectionMedia(db, about.id, mediaUrl);
  return { ok: true, pageId: page.id, sectionId: about.id };
}

async function ensureContactHeading(db, { churchId, branchId, heading }) {
  const page = await contentRepo.findPageByScope(db, {
    churchId,
    branchId: branchId || null,
    pageKey: "contact",
  });
  if (!page) return { ok: false, reason: "contact_page_missing" };
  await updatePublicPage(db, page.id, {
    title: heading,
    status: "draft",
    allowPublishedWrite: true,
  });
  const sections = await contentRepo.listSectionsForPage(db, page.id);
  const intro = (sections || []).find((s) => s.sectionKey === "intro") || (sections || [])[0];
  if (intro) {
    await updatePageSection(db, intro.id, {
      heading,
      status: "draft",
      allowPublishedWrite: true,
    });
  }
  return { ok: true, pageId: page.id };
}

async function ensureLocationsSection(db, { churchId }) {
  const page = await contentRepo.findPageByScope(db, {
    churchId,
    branchId: null,
    pageKey: "home",
  });
  if (!page) return { ok: false, reason: "home_missing" };
  const sections = await contentRepo.listSectionsForPage(db, page.id);
  let loc = (sections || []).find((s) => s.sectionKey === "our_locations");
  if (!loc) {
    const created = await createPageSection(db, {
      pageId: page.id,
      sectionKey: "our_locations",
      sectionType: "text",
      heading: HQ_CONTENT.locationsHeading,
      bodyText: HQ_CONTENT.locationsText,
      sortOrder: 40,
      status: "draft",
    });
    return { ok: Boolean(created.ok), section: created.section || null };
  }
  await updatePageSection(db, loc.id, {
    heading: HQ_CONTENT.locationsHeading,
    bodyText: HQ_CONTENT.locationsText,
    status: "draft",
    allowPublishedWrite: true,
  });
  return { ok: true, section: loc };
}

async function ensureMinistryHighlight(db, { churchId, branchId, name, description }) {
  const list = await contentRepo.listMinistries(db, {
    churchId,
    branchId: branchId || null,
  });
  const existing = (list || []).find(
    (m) => String(m.name || "").toLowerCase() === String(name).toLowerCase()
  );
  if (existing) {
    await updateMinistry(db, existing.id, {
      name,
      summary: description,
      description,
      status: "draft",
      allowPublishedWrite: true,
    });
    return { ok: true, id: existing.id, created: false };
  }
  const created = await createMinistry(db, {
    churchId,
    branchId: branchId || null,
    name,
    summary: description,
    description,
    status: "draft",
  });
  return { ok: Boolean(created.ok), id: created.item && created.item.id, created: true };
}

/**
 * Keep branch website_scope_settings in sync after renames.
 * Init seeds these once and skips existing rows, so rename alone can leave
 * stale identity/SEO/contact values (e.g. Kitwe → Ndola).
 */
async function syncBranchScopeIdentity(db, { organizationId, churchId, branchId, actorUserId, spec }) {
  const seed = {
    "identity.branch_display_name": spec.publicName,
    "presentation.branch_display_label": spec.publicName,
    "seo.title": spec.publicName,
    "seo.og_title": spec.publicName,
    "contact.city": spec.city,
    "contact.email": spec.email,
    "contact.phone": spec.phone,
    "contact.address_line_1": spec.addressLine1,
    "contact.address_line_2": spec.addressLine2,
    "contact.country": spec.countryCode,
  };
  for (const [settingKey, value] of Object.entries(seed)) {
    if (value == null || value === "") continue;
    if (!registry.normalizeSettingKey(settingKey)) continue;
    await scopeSettingsRepo.upsertActive(db, {
      organizationId,
      churchId,
      branchId,
      settingKey,
      inheritanceState: "override",
      valueJson: registry.toValueJson(value),
      updatedBy: actorUserId || null,
    });
  }
}

async function applyBranchWebsiteContent(db, { organizationId, churchId, branchId, actorUserId, spec }) {
  await ensureHomeHero(db, {
    churchId,
    branchId,
    heading: spec.heroTitle,
    bodyText: spec.heroSubtitle,
    mediaUrl: spec.heroMedia,
  });
  await ensureAboutSection(db, {
    churchId,
    branchId,
    heading: spec.aboutHeading,
    bodyText: spec.aboutText,
    mediaUrl: spec.aboutMedia,
  });
  await ensureContactHeading(db, {
    churchId,
    branchId,
    heading: spec.contactHeading,
  });
  await ensureMinistryHighlight(db, {
    churchId,
    branchId,
    name: spec.ministryName,
    description: spec.ministryDescription,
  });
  await saveHomeServiceTimes(db, {
    organizationId,
    churchId,
    branchId,
    actorUserId,
    entries: spec.serviceTimes,
    action: "save_publish",
    confirmPublish: true,
  });
  await syncBranchScopeIdentity(db, {
    organizationId,
    churchId,
    branchId,
    actorUserId,
    spec,
  });
  return { ok: true };
}

async function applyHqWebsiteContent(db, { organizationId, churchId, actorUserId }) {
  await updateChurchSettings(db, churchId, {
    publicName: HQ_CONTENT.websiteName,
    primaryEmail: "office@demo-church.example.test",
    primaryPhone: "+260-211-000000",
    defaultTimezone: "Africa/Lusaka",
    defaultCountryCode: "ZM",
    websiteStatus: "published",
    denomination: "Protestant",
  });
  await ensureHomeHero(db, {
    churchId,
    branchId: null,
    heading: HQ_CONTENT.heroTitle,
    bodyText: HQ_CONTENT.heroSubtitle,
    mediaUrl: HQ_CONTENT.heroMedia,
  });
  await ensureAboutSection(db, {
    churchId,
    branchId: null,
    heading: HQ_CONTENT.aboutHeading,
    bodyText: HQ_CONTENT.aboutText,
    mediaUrl: HQ_CONTENT.aboutMedia,
  });
  await ensureLocationsSection(db, { churchId });
  return { ok: true, organizationId, actorUserId: actorUserId || null };
}

async function publishScope(db, { organizationId, churchId, branchId, actorUserId }) {
  return publishChurchWebsite(db, {
    organizationId,
    churchId,
    branchId: branchId || null,
    actorUserId,
    confirmPublish: true,
    relaxPreviewRequirement: true,
    forcePublishVersion: true,
    deferServiceTimes: true,
    mobilePreviewConfirmed: true,
  });
}

async function reassignBranchAdmin(db, { organizationId, fromBranchId, toBranchId }) {
  if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) return { ok: true, updated: 0 };
  const { rowCount } = await db.query(
    `UPDATE blessboard.user_roles
        SET branch_id = $3, updated_at = now()
      WHERE organization_id = $1
        AND branch_id = $2
        AND role_key = 'branch_admin'
        AND status = 'active'`,
    [organizationId, fromBranchId, toBranchId]
  );
  return { ok: true, updated: rowCount || 0 };
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   actorUserId?: string|null,
 *   publish?: boolean,
 *   expectedIdentityKey?: string,
 * }} [input]
 */
async function configureDemoChurch(db, input) {
  const publish = input && input.publish === false ? false : true;
  const actorUserId =
    input && input.actorUserId != null && String(input.actorUserId).trim()
      ? String(input.actorUserId).trim()
      : null;

  const identityGate = await assertTestingIdentity(db);
  if (!identityGate.ok) return identityGate;

  const report = {
    ok: false,
    status: STATUS.FAILED,
    identity: {
      identityKey: identityGate.identity.identity_key,
      environmentCode: identityGate.identity.environment_code,
    },
    rename: null,
    branches: {},
    deactivated: [],
    websites: {},
    publish: {},
    extras: [],
  };

  try {
    // Use the pool (not a borrowed client) so nested services can connect safely.
    let org = await findOrgByKeys(db, [TO_KEY, FROM_KEY]);
    if (!org) {
      report.status = STATUS.NOT_FOUND;
      report.reason = "organization_not_found";
      return report;
    }

    if (String(org.organization_key) === FROM_KEY) {
      const renamed = await renameBlessBoardOrganizationKey(db, {
        organizationId: org.id,
        fromKey: FROM_KEY,
        toKey: TO_KEY,
        displayName: DISPLAY_NAME,
        hostname: HOSTNAME,
        actorUserId,
      });
      report.rename = renamed;
      if (!renamed.ok) {
        report.status = renamed.status || STATUS.FAILED;
        report.reason = renamed.reason;
        return report;
      }
      org = await findOrgByKeys(db, [TO_KEY]);
    } else {
      report.rename = {
        ok: true,
        alreadyRenamed: true,
        organizationId: org.id,
        organizationKey: org.organization_key,
      };
      if (String(org.display_name) !== DISPLAY_NAME) {
        await db.query(
          `UPDATE platform.organizations
              SET display_name = $2, updated_at = now()
            WHERE id = $1`,
          [org.id, DISPLAY_NAME]
        );
      }
    }

    const church = await loadChurch(db, org.id);
    if (!church) {
      report.status = STATUS.NOT_FOUND;
      report.reason = "church_not_found";
      return report;
    }
    if (String(church.display_name) !== DISPLAY_NAME) {
      await db.query(
        `UPDATE blessboard.churches
            SET display_name = $2, updated_at = now()
          WHERE id = $1`,
        [church.id, DISPLAY_NAME]
      );
    }

    const beforeBranches = await listBranches(db, church.id);
    const testMain = beforeBranches.find((b) => b.branch_key === "test-main");

    const lusaka = await ensureBranch(db, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId,
      spec: LUSAKA,
    });
    if (lusaka.ok === false) {
      report.status = STATUS.FAILED;
      report.reason = "lusaka_branch_failed";
      report.branches.lusaka = lusaka.created;
      return report;
    }
    report.branches.lusaka = {
      id: lusaka.branch.id,
      key: LUSAKA.branchKey,
      created: lusaka.created,
      renamed: lusaka.renamed || false,
      init: lusaka.init,
    };

    const ndola = await ensureBranch(db, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId,
      spec: NDOLA,
    });
    if (ndola.ok === false) {
      report.status = STATUS.FAILED;
      report.reason = "ndola_branch_failed";
      report.branches.ndola = ndola.created;
      return report;
    }
    report.branches.ndola = {
      id: ndola.branch.id,
      key: NDOLA.branchKey,
      created: ndola.created,
      renamed: ndola.renamed || false,
      init: ndola.init,
    };

    // Re-init if create skipped init or previous status was not completed.
    for (const [label, branchId] of [
      ["lusaka", lusaka.branch.id],
      ["ndola", ndola.branch.id],
    ]) {
      const gov = await db.query(
        `SELECT website_initialization_status FROM blessboard.branch_website_governance WHERE branch_id = $1`,
        [branchId]
      );
      const st = gov.rows[0] && gov.rows[0].website_initialization_status;
      if (st !== "completed") {
        const init = await initializeBranchWebsiteFromChurch(db, {
          organizationId: org.id,
          churchId: church.id,
          branchId,
          actorUserId,
          forceRetry: st === "failed",
        });
        report.branches[label].init = init;
      }
    }

    if (testMain && String(testMain.status) === "active") {
      const deactivated = await deactivateBlessBoardBranch(db, {
        organizationId: org.id,
        churchId: church.id,
        branchId: testMain.id,
        actorUserId,
      });
      report.deactivated.push({
        branchKey: "test-main",
        branchId: testMain.id,
        result: deactivated,
      });
      if (deactivated.ok) {
        await reassignBranchAdmin(db, {
          organizationId: org.id,
          fromBranchId: testMain.id,
          toBranchId: lusaka.branch.id,
        });
      }
    } else if (testMain) {
      report.extras.push({
        branchKey: "test-main",
        branchId: testMain.id,
        status: testMain.status,
        note: "Already inactive; preserved. No redirect — location not proven as Lusaka/Ndola.",
      });
    }

    const remaining = await listBranches(db, church.id);
    const allowedOps = new Set([LUSAKA.branchKey, NDOLA.branchKey]);
    for (const b of remaining) {
      if (b.branch_type === "branch" && b.status === "active" && !allowedOps.has(b.branch_key)) {
        report.extras.push({
          branchKey: b.branch_key,
          branchId: b.id,
          status: b.status,
          note: "Extra active operational branch reported; not auto-deactivated.",
        });
      }
    }

    report.websites.hq = await applyHqWebsiteContent(db, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId,
    });
    report.websites.lusaka = await applyBranchWebsiteContent(db, {
      organizationId: org.id,
      churchId: church.id,
      branchId: lusaka.branch.id,
      actorUserId,
      spec: LUSAKA,
    });
    report.websites.ndola = await applyBranchWebsiteContent(db, {
      organizationId: org.id,
      churchId: church.id,
      branchId: ndola.branch.id,
      actorUserId,
      spec: NDOLA,
    });

    if (publish) {
      report.publish.hq = await publishScope(db, {
        organizationId: org.id,
        churchId: church.id,
        branchId: null,
        actorUserId,
      });
      report.publish.lusaka = await publishScope(db, {
        organizationId: org.id,
        churchId: church.id,
        branchId: lusaka.branch.id,
        actorUserId,
      });
      report.publish.ndola = await publishScope(db, {
        organizationId: org.id,
        churchId: church.id,
        branchId: ndola.branch.id,
        actorUserId,
      });
    }

    report.ok = true;
    report.status = STATUS.OK;
    report.organizationId = org.id;
    report.organizationKey = TO_KEY;
    report.churchId = church.id;
    report.displayName = DISPLAY_NAME;
    return report;
  } catch (err) {
    report.ok = false;
    report.status = STATUS.FAILED;
    report.reason = err && err.message ? String(err.message).slice(0, 300) : "error";
    return report;
  }
}

module.exports = {
  STATUS,
  FROM_KEY,
  TO_KEY,
  DISPLAY_NAME,
  HOSTNAME,
  MEDIA,
  LUSAKA,
  NDOLA,
  HQ_CONTENT,
  configureDemoChurch,
  assertTestingIdentity,
};
