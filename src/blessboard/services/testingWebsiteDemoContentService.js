"use strict";

/**
 * Seed rich Stitch-shaped website demo content for BlessBoard V5 testing orgs.
 * Testing deployment only. Idempotent fill-empty by default; optional demo refresh.
 * Never deletes. Never touches V4 public.tenants / public.session.
 */

const content = require("./publicContentAdminService");
const contentRepo = require("../repositories/publicContentRepository");
const catalogueRepo = require("../repositories/blessBoardCatalogueRepository");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const authRepo = require("../repositories/blessBoardAuthRepository");
const announcements = require("./announcementsService");
const announcementsRepo = require("../repositories/announcementsRepository");
const {
  saveHomeServiceTimes,
  ensureCanonicalServiceTimesSection,
} = require("./homeServiceTimesService");
const { resolveAnnouncementProductPolicy } = require("./announcementProductPolicy");
const spec = require("./testingWebsiteDemoContentSpec");

const STATUS = Object.freeze({
  APPLIED: "applied",
  ALREADY_PRESENT: "already_present",
  SKIPPED: "skipped",
  PLANNED: "planned",
  REFRESHED: "refreshed",
  CONFLICT: "conflict",
  BLOCKED: "blocked",
  ERROR: "error",
  REFUSED_PRODUCTION: "refused_production",
  REFUSED_ENVIRONMENT: "refused_environment",
});

const ALLOW_ENV = "BLESSBOARD_ALLOW_TESTING_DEMO_CONTENT";

function act(record, status, detail, extra) {
  return {
    record,
    status,
    detail: detail || null,
    ...(extra || {}),
  };
}

function evaluateTestingDemoContentEnvironment(env) {
  const e = env && typeof env === "object" ? env : process.env;
  const nodeEnv = String(e.NODE_ENV || "")
    .trim()
    .toLowerCase();
  const deploymentEnv = String(e.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  const allow =
    String(e[ALLOW_ENV] || "")
      .trim()
      .toLowerCase() === "true";

  if (deploymentEnv === "production") {
    return {
      ok: false,
      status: STATUS.REFUSED_PRODUCTION,
      message: "refused_production",
      detail: "DEPLOYMENT_ENV=production cannot run testing website demo content seed.",
    };
  }

  if (deploymentEnv === "testing") {
    return { ok: true, nodeEnv, deploymentEnv, allow };
  }

  if (nodeEnv === "test") {
    return { ok: true, nodeEnv, deploymentEnv, allow };
  }

  if (allow && nodeEnv !== "production") {
    return { ok: true, nodeEnv, deploymentEnv, allow };
  }

  if (nodeEnv === "production") {
    return {
      ok: false,
      status: STATUS.REFUSED_PRODUCTION,
      message: "refused_production",
      detail: "NODE_ENV=production requires DEPLOYMENT_ENV=testing for this seed.",
    };
  }

  return {
    ok: false,
    status: STATUS.REFUSED_ENVIRONMENT,
    message: "refused_environment",
    detail: `Require DEPLOYMENT_ENV=testing, NODE_ENV=test, or ${ALLOW_ENV}=true.`,
  };
}

async function withClient(db, fn) {
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

function isEmptyText(value) {
  return !String(value == null ? "" : value).trim();
}

function sectionIsDemoOwned(section) {
  return Boolean(
    section &&
      (spec.isDemoMetadata(section.layoutMetadata) ||
        spec.isDemoMarkedText(section.heading) ||
        spec.isDemoMarkedText(section.bodyText))
  );
}

function pageIsDemoOwned(page) {
  return Boolean(
    page && (spec.isDemoMetadata(page.layoutMetadata) || spec.isDemoMarkedText(page.title))
  );
}

function defaultPageTitle(title) {
  const t = String(title || "").trim();
  return (
    !t ||
    t === "Home" ||
    t === "About" ||
    t === "Leadership" ||
    t === "Ministries" ||
    t === "Events" ||
    t === "Sermons" ||
    t === "Contact" ||
    t === "Giving"
  );
}

function findByExact(items, field, value) {
  const v = String(value || "");
  return (items || []).find((it) => String(it[field] || "") === v) || null;
}

function isDemoPlaceholderContact(settings) {
  if (!settings) return true;
  const email = String(settings.primaryEmail || settings.email || "").toLowerCase();
  const phone = String(settings.primaryPhone || settings.phone || "");
  if (!email && !phone) return true;
  if (email.endsWith("@example.test") || email.includes("automated-test.example.test")) return true;
  if (phone === spec.HQ_CONTACT.phone || phone.startsWith("+1-555-")) return true;
  return false;
}

/**
 * Admin HTTPS validator rejects /church/images/* — patch via repository after create.
 */
async function patchEntityImage(db, kind, id, imageUrl) {
  if (!id || !imageUrl) return;
  await withClient(db, async (client) => {
    if (kind === "leader") {
      await contentRepo.updateLeader(client, id, { imageUrl });
    } else if (kind === "ministry") {
      await contentRepo.updateMinistry(client, id, { imageUrl });
    } else if (kind === "section") {
      await contentRepo.updateSection(client, id, { mediaUrl: imageUrl });
    }
  });
}

async function ensurePagePublished(db, { churchId, pageKey, title, dryRun, refresh, actions }) {
  const bundle = await content.getAdminPageBundle(db, {
    churchId,
    branchId: null,
    pageKey,
  });
  let page = bundle.page;

  if (page && !pageIsDemoOwned(page) && !defaultPageTitle(page.title) && page.status === "published") {
    // User-owned published page — do not change title; still allow missing sections.
    actions.push(act(`page.${pageKey}`, STATUS.SKIPPED, "user_owned_page_preserved", {
      title: page.title,
    }));
    return { ok: true, page, skipTitle: true };
  }

  if (dryRun) {
    actions.push(
      act(
        `page.${pageKey}`,
        page && page.status === "published" ? STATUS.ALREADY_PRESENT : STATUS.PLANNED,
        title
      )
    );
    return { ok: true, page, skipTitle: false };
  }

  if (!page) {
    const ensured = await withClient(db, (c) =>
      contentRepo.ensureDraftPage(c, {
        churchId,
        branchId: null,
        pageKey,
        title,
      })
    );
    page = ensured.page;
  }

  const shouldSetTitle =
    refresh ||
    !page.title ||
    defaultPageTitle(page.title) ||
    pageIsDemoOwned(page) ||
    spec.isDemoMarkedText(page.title);

  const updated = await content.updatePublicPage(db, page.id, {
    title: shouldSetTitle ? title : page.title,
    status: "published",
    confirmPublish: true,
  });
  if (!updated.ok) {
    actions.push(act(`page.${pageKey}`, STATUS.ERROR, updated.reason || updated.status));
    return { ok: false, page: null };
  }

  await withClient(db, (c) =>
    contentRepo.updatePage(c, page.id, {
      layoutMetadata: spec.demoLayoutMetadata(`page:${pageKey}`),
    })
  );

  actions.push(
    act(
      `page.${pageKey}`,
      page.status === "published" && pageIsDemoOwned(page) ? STATUS.ALREADY_PRESENT : STATUS.APPLIED,
      title
    )
  );
  const refreshed = await content.getAdminPageBundle(db, { churchId, branchId: null, pageKey });
  return { ok: true, page: refreshed.page, skipTitle: false };
}

async function ensureSection(db, ctx) {
  const {
    pageId,
    pageKey,
    sectionKey,
    sectionType,
    heading,
    bodyText,
    mediaUrl,
    sortOrder,
    dryRun,
    refresh,
    actions,
  } = ctx;

  const existing = await withClient(db, (c) =>
    contentRepo.findSectionByPageAndKey(c, pageId, sectionKey)
  );

  const demoKey = `section:${pageKey}:${sectionKey}`;

  if (existing) {
    const owned = sectionIsDemoOwned(existing);
    const empty =
      isEmptyText(existing.heading) &&
      isEmptyText(existing.bodyText) &&
      isEmptyText(existing.mediaUrl);

    if (!owned && !empty) {
      actions.push(
        act(`section.${pageKey}.${sectionKey}`, STATUS.SKIPPED, "user_owned_section_preserved")
      );
      return { ok: true };
    }

    const shouldWrite = refresh || empty || owned;
    if (!shouldWrite) {
      actions.push(
        act(`section.${pageKey}.${sectionKey}`, STATUS.ALREADY_PRESENT, heading)
      );
      return { ok: true };
    }

    if (dryRun) {
      actions.push(
        act(
          `section.${pageKey}.${sectionKey}`,
          refresh ? STATUS.PLANNED : empty ? STATUS.PLANNED : STATUS.ALREADY_PRESENT,
          heading
        )
      );
      return { ok: true };
    }

    const updated = await content.updatePageSection(db, existing.id, {
      heading,
      bodyText,
      sectionType,
      status: "published",
      confirmPublish: true,
      sortOrder: sortOrder != null ? sortOrder : existing.sortOrder,
    });
    if (!updated.ok) {
      actions.push(
        act(`section.${pageKey}.${sectionKey}`, STATUS.ERROR, updated.reason || updated.status)
      );
      return { ok: false };
    }
    await withClient(db, (c) =>
      contentRepo.updateSection(c, existing.id, {
        layoutMetadata: spec.demoLayoutMetadata(demoKey),
        mediaUrl: mediaUrl || null,
      })
    );
    actions.push(
      act(
        `section.${pageKey}.${sectionKey}`,
        refresh ? STATUS.REFRESHED : STATUS.APPLIED,
        heading
      )
    );
    return { ok: true };
  }

  if (dryRun) {
    actions.push(act(`section.${pageKey}.${sectionKey}`, STATUS.PLANNED, heading));
    return { ok: true };
  }

  const created = await content.createPageSection(db, {
    pageId,
    sectionKey,
    sectionType,
    heading,
    bodyText,
    status: "published",
    confirmPublish: true,
    sortOrder: sortOrder != null ? sortOrder : 10,
  });
  if (!created.ok) {
    actions.push(
      act(`section.${pageKey}.${sectionKey}`, STATUS.ERROR, created.reason || created.status)
    );
    return { ok: false };
  }
  if (created.section && created.section.id) {
    await withClient(db, (c) =>
      contentRepo.updateSection(c, created.section.id, {
        layoutMetadata: spec.demoLayoutMetadata(demoKey),
        mediaUrl: mediaUrl || null,
      })
    );
  }
  actions.push(act(`section.${pageKey}.${sectionKey}`, STATUS.APPLIED, heading));
  return { ok: true };
}

async function ensureNamedEntity(db, opts) {
  const {
    record,
    listFn,
    matchField,
    matchValue,
    createFn,
    updateFn,
    imageUrl,
    imageKind,
    dryRun,
    refresh,
    actions,
    isDemoEntity,
  } = opts;

  const listed = await listFn();
  const items = listed.items || [];
  const existing = findByExact(items, matchField, matchValue);

  if (existing) {
    const demoOwned = isDemoEntity ? isDemoEntity(existing) : spec.isDemoMarkedText(existing[matchField]);
    if (!demoOwned) {
      actions.push(act(record, STATUS.SKIPPED, "user_owned_entity_preserved", { id: existing.id }));
      return { ok: true, id: existing.id };
    }
    if (!refresh) {
      actions.push(act(record, STATUS.ALREADY_PRESENT, matchValue, { id: existing.id }));
      return { ok: true, id: existing.id };
    }
    if (dryRun) {
      actions.push(act(record, STATUS.PLANNED, matchValue, { id: existing.id }));
      return { ok: true, id: existing.id };
    }
    const updated = await updateFn(existing.id);
    if (!updated.ok) {
      actions.push(act(record, STATUS.ERROR, updated.reason || updated.status));
      return { ok: false };
    }
    if (imageUrl && imageKind) {
      await patchEntityImage(db, imageKind, existing.id, imageUrl);
    }
    actions.push(act(record, STATUS.REFRESHED, matchValue, { id: existing.id }));
    return { ok: true, id: existing.id };
  }

  if (dryRun) {
    actions.push(act(record, STATUS.PLANNED, matchValue));
    return { ok: true };
  }

  const created = await createFn();
  if (!created.ok) {
    actions.push(act(record, STATUS.ERROR, created.reason || created.status));
    return { ok: false };
  }
  const id = created.item && created.item.id;
  if (imageUrl && imageKind && id) {
    await patchEntityImage(db, imageKind, id, imageUrl);
  }
  actions.push(act(record, STATUS.APPLIED, matchValue, { id }));
  return { ok: true, id };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} input
 */
async function seedTestingWebsiteDemoContent(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const dryRun = Boolean(raw.dryRun);
  const refresh = Boolean(raw.refreshDemoContent);
  const diagnose = Boolean(raw.diagnose);
  const organizationKey = String(
    raw.organizationKey || spec.DEFAULT_ORGANIZATION_KEY
  )
    .trim()
    .toLowerCase();
  const churchKey = String(raw.churchKey || organizationKey || spec.DEFAULT_CHURCH_KEY)
    .trim()
    .toLowerCase();
  const actorEmail = String(raw.actorEmail || spec.DEFAULT_ACTOR_EMAIL)
    .trim()
    .toLowerCase();
  const actions = [];
  const dates = spec.relativeDates(raw.d0 ? new Date(raw.d0) : undefined);

  const envCheck = evaluateTestingDemoContentEnvironment(raw.env || process.env);
  if (!envCheck.ok) {
    return {
      ok: false,
      status: envCheck.status,
      message: envCheck.message,
      detail: envCheck.detail,
      dryRun: true,
      actions: [act("environment", envCheck.status, envCheck.detail)],
      dates,
      keys: { organization_key: organizationKey, church_key: churchKey },
    };
  }

  // Financial safety on seed copy
  const givingOk = spec.assertNoRealFinancialDetails(spec.GIVING.method.instructions);
  if (!givingOk) {
    return {
      ok: false,
      status: STATUS.BLOCKED,
      message: "unsafe_financial_copy",
      dryRun: true,
      actions: [act("giving", STATUS.BLOCKED, "forbidden_financial_pattern")],
      dates,
    };
  }

  try {
    const organization = await withClient(db, (c) =>
      catalogueRepo.findOrganizationByKey(c, organizationKey)
    );
    if (!organization) {
      return {
        ok: false,
        status: STATUS.BLOCKED,
        message: "organization_not_found",
        detail: `Provision org ${organizationKey} first (test-users seed).`,
        dryRun: true,
        actions: [act("catalogue.organization", STATUS.BLOCKED, organizationKey)],
        dates,
        keys: { organization_key: organizationKey },
      };
    }

    const church = await withClient(db, (c) => catalogueRepo.findChurchByKey(c, churchKey));
    if (!church || String(church.organization_id) !== String(organization.id)) {
      return {
        ok: false,
        status: STATUS.BLOCKED,
        message: "church_not_found",
        dryRun: true,
        actions: [act("catalogue.church", STATUS.BLOCKED, churchKey)],
        dates,
        keys: { organization_key: organizationKey, church_key: churchKey },
      };
    }

    const hqBranch =
      (await withClient(db, (c) => catalogueRepo.findHqBranch(c, church.id))) ||
      (await withClient(db, (c) => catalogueRepo.findBranchByChurchAndKey(c, church.id, "hq")));
    if (!hqBranch) {
      return {
        ok: false,
        status: STATUS.BLOCKED,
        message: "hq_branch_missing",
        dryRun: true,
        actions: [act("catalogue.hq_branch", STATUS.BLOCKED, "hq")],
        dates,
      };
    }

    const churchId = church.id;
    const branchId = hqBranch.id;
    actions.push(act("catalogue.organization", STATUS.ALREADY_PRESENT, organizationKey));
    actions.push(act("catalogue.church", STATUS.ALREADY_PRESENT, churchKey));
    actions.push(act("catalogue.hq_branch", STATUS.ALREADY_PRESENT, hqBranch.branch_key || "hq"));

    if (!dryRun) {
      await content.provisionEmptyPublicPages(db, { churchId, branchId: null });
    }

    // —— Settings / identity / address ——
    const churchSettings = await withClient(db, (c) =>
      settingsRepo.findChurchSettings(c, churchId)
    );
    const branchSettings = await withClient(db, (c) =>
      settingsRepo.findBranchSettings(c, branchId)
    );

    const canFillChurchContact =
      refresh || isDemoPlaceholderContact(churchSettings) || !churchSettings;
    const canFillBranchAddress =
      refresh ||
      isDemoPlaceholderContact(branchSettings) ||
      !branchSettings ||
      isEmptyText(branchSettings.addressLine1);

    if (dryRun) {
      actions.push(
        act(
          "settings.church_contact",
          canFillChurchContact ? STATUS.PLANNED : STATUS.SKIPPED,
          spec.HQ_CONTACT.email
        )
      );
      actions.push(
        act(
          "settings.branch_address",
          canFillBranchAddress ? STATUS.PLANNED : STATUS.SKIPPED,
          spec.HQ_CONTACT.addressLine1
        )
      );
    } else if (canFillChurchContact) {
      const nextWebsite =
        churchSettings && churchSettings.websiteStatus === "suspended"
          ? "suspended"
          : churchSettings && churchSettings.websiteStatus === "published"
            ? "published"
            : "published";
      await withClient(db, (c) =>
        settingsRepo.upsertChurchSettings(c, churchId, {
          publicName: spec.IDENTITY.displayName,
          denomination: (churchSettings && churchSettings.denomination) || null,
          primaryEmail: spec.HQ_CONTACT.email,
          primaryPhone: spec.HQ_CONTACT.phone,
          defaultTimezone: (churchSettings && churchSettings.defaultTimezone) || "UTC",
          defaultCountryCode: (churchSettings && churchSettings.defaultCountryCode) || "US",
          websiteStatus: nextWebsite,
        })
      );
      await withClient(db, (c) =>
        settingsRepo.updateChurchCatalogueNames(c, churchId, {
          displayName: spec.IDENTITY.displayName,
        })
      );
      actions.push(
        act(
          "settings.church_contact",
          refresh ? STATUS.REFRESHED : STATUS.APPLIED,
          spec.HQ_CONTACT.email
        )
      );
    } else {
      actions.push(act("settings.church_contact", STATUS.SKIPPED, "user_contact_preserved"));
    }

    if (!dryRun && canFillBranchAddress) {
      await withClient(db, (c) =>
        settingsRepo.upsertBranchSettings(c, branchId, {
          publicName:
            (branchSettings && branchSettings.publicName) || "Headquarters",
          email: spec.HQ_CONTACT.email,
          phone: spec.HQ_CONTACT.phone,
          timezone: (branchSettings && branchSettings.timezone) || "UTC",
          countryCode: (branchSettings && branchSettings.countryCode) || "US",
          addressLine1: spec.HQ_CONTACT.addressLine1,
          addressLine2: spec.HQ_CONTACT.addressLine2,
          city: spec.HQ_CONTACT.city,
          provinceState: spec.HQ_CONTACT.provinceState,
          postalCode: spec.HQ_CONTACT.postalCode,
          latitude: spec.HQ_CONTACT.latitude,
          longitude: spec.HQ_CONTACT.longitude,
        })
      );
      actions.push(
        act(
          "settings.branch_address",
          refresh ? STATUS.REFRESHED : STATUS.APPLIED,
          spec.HQ_CONTACT.addressLine1
        )
      );
    } else if (!canFillBranchAddress) {
      actions.push(act("settings.branch_address", STATUS.SKIPPED, "user_address_preserved"));
    }

    // —— Pages + sections ——
    const homePage = await ensurePagePublished(db, {
      churchId,
      pageKey: "home",
      title: spec.PAGE_TITLES.home,
      dryRun,
      refresh,
      actions,
    });
    if (!homePage.ok) {
      return fail(STATUS.ERROR, "home_page_failed", { dryRun, actions, dates, organizationKey, churchKey });
    }

    if (homePage.page) {
      let r = await ensureSection(db, {
        pageId: homePage.page.id,
        pageKey: "home",
        sectionKey: spec.HERO.sectionKey,
        sectionType: spec.HERO.sectionType,
        heading: spec.HERO.heading,
        bodyText: spec.HERO.bodyText,
        mediaUrl: spec.HERO.mediaUrl,
        sortOrder: 1,
        dryRun,
        refresh,
        actions,
      });
      if (!r.ok) {
        return fail(STATUS.ERROR, "hero_failed", { dryRun, actions, dates, organizationKey, churchKey });
      }

      r = await ensureSection(db, {
        pageId: homePage.page.id,
        pageKey: "home",
        sectionKey: "welcome",
        sectionType: "body",
        heading: "Welcome",
        bodyText: `${spec.IDENTITY.welcomeMessage} ${spec.IDENTITY.tagline}`,
        mediaUrl: null,
        sortOrder: 20,
        dryRun,
        refresh,
        actions,
      });
      if (!r.ok) {
        return fail(STATUS.ERROR, "welcome_failed", { dryRun, actions, dates, organizationKey, churchKey });
      }

      r = await ensureSection(db, {
        pageId: homePage.page.id,
        pageKey: "home",
        sectionKey: "announcement_highlight",
        sectionType: "announcement",
        heading: spec.HOME_ANNOUNCEMENT.heading,
        bodyText: spec.HOME_ANNOUNCEMENT.bodyText,
        mediaUrl: null,
        sortOrder: 15,
        dryRun,
        refresh,
        actions,
      });
      if (!r.ok) {
        return fail(STATUS.ERROR, "announcement_highlight_failed", {
          dryRun,
          actions,
          dates,
          organizationKey,
          churchKey,
        });
      }
    }

    // Service times
    if (dryRun) {
      actions.push(act("service_times", STATUS.PLANNED, `${spec.SERVICE_TIMES.length} entries`));
    } else {
      await withClient(db, (c) =>
        ensureCanonicalServiceTimesSection(c, { churchId, branchId: null })
      );
      const existingSt = homePage.page
        ? await withClient(db, (c) =>
            contentRepo.findSectionByPageAndKey(c, homePage.page.id, "service_times")
          )
        : null;
      const stMeta = existingSt && existingSt.layoutMetadata;
      const stEntries =
        stMeta && Array.isArray(stMeta.entries) ? stMeta.entries.filter((e) => e && e.enabled !== false) : [];
      const stEmpty = !stEntries.length;
      const stDemo =
        existingSt &&
        (spec.isDemoMetadata(stMeta) ||
          (stEntries.length &&
            stEntries.every((e) => String(e.name || "").includes(spec.DEMO_TAG))));

      if (!stEmpty && !stDemo && !refresh) {
        actions.push(act("service_times", STATUS.SKIPPED, "user_service_times_preserved"));
      } else if (!stEmpty && stDemo && !refresh) {
        actions.push(act("service_times", STATUS.ALREADY_PRESENT, `${stEntries.length} entries`));
      } else {
        const saved = await saveHomeServiceTimes(db, {
          churchId,
          branchId: null,
          entries: spec.SERVICE_TIMES,
          confirmPublish: true,
        });
        if (!saved.ok) {
          actions.push(act("service_times", STATUS.ERROR, saved.reason || saved.status));
          return fail(STATUS.ERROR, "service_times_failed", {
            dryRun,
            actions,
            dates,
            organizationKey,
            churchKey,
          });
        }
        if (saved.section && saved.section.id) {
          await withClient(db, (c) =>
            contentRepo.updateSection(c, saved.section.id, {
              layoutMetadata: {
                ...((saved.section.layoutMetadata && typeof saved.section.layoutMetadata === "object"
                  ? saved.section.layoutMetadata
                  : {}) || {}),
                schema: "service_times_v1",
                entries: spec.SERVICE_TIMES,
                ...spec.demoLayoutMetadata("section:home:service_times"),
              },
            })
          );
        }
        actions.push(
          act(
            "service_times",
            refresh ? STATUS.REFRESHED : STATUS.APPLIED,
            `${spec.SERVICE_TIMES.length} entries`
          )
        );
      }
    }

    const aboutPage = await ensurePagePublished(db, {
      churchId,
      pageKey: "about",
      title: spec.PAGE_TITLES.about,
      dryRun,
      refresh,
      actions,
    });
    if (!aboutPage.ok) {
      return fail(STATUS.ERROR, "about_page_failed", { dryRun, actions, dates, organizationKey, churchKey });
    }
    if (aboutPage.page) {
      for (const sec of spec.ABOUT_SECTIONS) {
        const r = await ensureSection(db, {
          pageId: aboutPage.page.id,
          pageKey: "about",
          sectionKey: sec.sectionKey,
          sectionType: sec.sectionType,
          heading: sec.heading,
          bodyText: sec.bodyText,
          mediaUrl: sec.mediaUrl,
          sortOrder: sec.sortOrder,
          dryRun,
          refresh,
          actions,
        });
        if (!r.ok) {
          return fail(STATUS.ERROR, `about_section_failed:${sec.sectionKey}`, {
            dryRun,
            actions,
            dates,
            organizationKey,
            churchKey,
          });
        }
      }
    }

    for (const pageKey of ["leadership", "ministries", "events", "sermons", "contact", "giving"]) {
      const pg = await ensurePagePublished(db, {
        churchId,
        pageKey,
        title: spec.PAGE_TITLES[pageKey],
        dryRun,
        refresh,
        actions,
      });
      if (!pg.ok) {
        return fail(STATUS.ERROR, `${pageKey}_page_failed`, {
          dryRun,
          actions,
          dates,
          organizationKey,
          churchKey,
        });
      }
    }

    // Contact intro + office hours
    const contactBundle = await content.getAdminPageBundle(db, {
      churchId,
      branchId: null,
      pageKey: "contact",
    });
    if (contactBundle.page) {
      for (const sec of [
        {
          sectionKey: "contact_intro",
          sectionType: "body",
          heading: spec.CONTACT.introHeading,
          bodyText: spec.CONTACT.introBody,
          sortOrder: 5,
        },
        {
          sectionKey: "office_hours",
          sectionType: "body",
          heading: spec.CONTACT.officeHoursHeading,
          bodyText: spec.CONTACT.officeHoursBody,
          sortOrder: 15,
        },
      ]) {
        const r = await ensureSection(db, {
          pageId: contactBundle.page.id,
          pageKey: "contact",
          ...sec,
          mediaUrl: null,
          dryRun,
          refresh,
          actions,
        });
        if (!r.ok) {
          return fail(STATUS.ERROR, "contact_section_failed", {
            dryRun,
            actions,
            dates,
            organizationKey,
            churchKey,
          });
        }
      }
    }

    const givingBundle = await content.getAdminPageBundle(db, {
      churchId,
      branchId: null,
      pageKey: "giving",
    });
    if (givingBundle.page) {
      const r = await ensureSection(db, {
        pageId: givingBundle.page.id,
        pageKey: "giving",
        sectionKey: "giving_intro",
        sectionType: "body",
        heading: spec.GIVING.introHeading,
        bodyText: spec.GIVING.introBody,
        mediaUrl: null,
        sortOrder: 5,
        dryRun,
        refresh,
        actions,
      });
      if (!r.ok) {
        return fail(STATUS.ERROR, "giving_intro_failed", {
          dryRun,
          actions,
          dates,
          organizationKey,
          churchKey,
        });
      }
    }

    // —— Leaders ——
    for (const leader of spec.LEADERS) {
      const r = await ensureNamedEntity(db, {
        record: `leader.${leader.demoKey}`,
        listFn: () => content.listAdminLeaders(db, { churchId }),
        matchField: "displayName",
        matchValue: leader.displayName,
        imageUrl: leader.imageUrl,
        imageKind: "leader",
        dryRun,
        refresh,
        actions,
        createFn: () =>
          content.createLeader(db, {
            churchId,
            branchId: null,
            displayName: leader.displayName,
            roleTitle: leader.roleTitle,
            biography: leader.biography,
            sortOrder: leader.sortOrder,
            status: "published",
            confirmPublish: true,
          }),
        updateFn: (id) =>
          content.updateLeader(db, id, {
            displayName: leader.displayName,
            roleTitle: leader.roleTitle,
            biography: leader.biography,
            sortOrder: leader.sortOrder,
            status: "published",
            confirmPublish: true,
          }),
      });
      if (!r.ok) {
        return fail(STATUS.ERROR, "leader_failed", { dryRun, actions, dates, organizationKey, churchKey });
      }
    }

    // —— Ministries ——
    for (const ministry of spec.MINISTRIES) {
      const r = await ensureNamedEntity(db, {
        record: `ministry.${ministry.demoKey}`,
        listFn: () => content.listAdminMinistries(db, { churchId, branchId }),
        matchField: "name",
        matchValue: ministry.name,
        imageUrl: ministry.imageUrl,
        imageKind: "ministry",
        dryRun,
        refresh,
        actions,
        createFn: () =>
          content.createMinistry(db, {
            churchId,
            branchId,
            name: ministry.name,
            summary: ministry.summary,
            description: ministry.description,
            meetingDay: ministry.meetingDay,
            sortOrder: ministry.sortOrder,
            joinPolicy: "request",
            status: "published",
            confirmPublish: true,
          }),
        updateFn: (id) =>
          content.updateMinistry(db, id, {
            name: ministry.name,
            summary: ministry.summary,
            description: ministry.description,
            meetingDay: ministry.meetingDay,
            sortOrder: ministry.sortOrder,
            status: "published",
            confirmPublish: true,
          }),
      });
      if (!r.ok) {
        return fail(STATUS.ERROR, "ministry_failed", { dryRun, actions, dates, organizationKey, churchKey });
      }
    }

    // —— Events ——
    for (const ev of dates.events) {
      const r = await ensureNamedEntity(db, {
        record: `event.${ev.demoKey}`,
        listFn: () => content.listAdminEvents(db, { churchId, branchId }),
        matchField: "title",
        matchValue: ev.title,
        dryRun,
        refresh,
        actions,
        createFn: () =>
          content.createEvent(db, {
            churchId,
            branchId,
            title: ev.title,
            summary: ev.summary,
            startsAt: ev.startsAt,
            timezone: ev.timezone,
            status: "published",
            confirmPublish: true,
          }),
        updateFn: (id) =>
          content.updateEvent(db, id, {
            title: ev.title,
            summary: ev.summary,
            startsAt: ev.startsAt,
            timezone: ev.timezone,
            status: "published",
            confirmPublish: true,
          }),
      });
      if (!r.ok) {
        return fail(STATUS.ERROR, "event_failed", { dryRun, actions, dates, organizationKey, churchKey });
      }
    }

    // —— Sermons ——
    for (const sermon of dates.sermons) {
      const r = await ensureNamedEntity(db, {
        record: `sermon.${sermon.demoKey}`,
        listFn: () => content.listAdminSermons(db, { churchId }),
        matchField: "title",
        matchValue: sermon.title,
        dryRun,
        refresh,
        actions,
        createFn: () =>
          content.createSermon(db, {
            churchId,
            branchId: null,
            title: sermon.title,
            speakerName: sermon.speakerName,
            preachedAt: sermon.preachedAt,
            summary: sermon.summary,
            status: "published",
            confirmPublish: true,
          }),
        updateFn: (id) =>
          content.updateSermon(db, id, {
            title: sermon.title,
            speakerName: sermon.speakerName,
            preachedAt: sermon.preachedAt,
            summary: sermon.summary,
            status: "published",
            confirmPublish: true,
          }),
      });
      if (!r.ok) {
        return fail(STATUS.ERROR, "sermon_failed", { dryRun, actions, dates, organizationKey, churchKey });
      }
    }

    // —— Contact channels (incl. social placeholders) ——
    for (const ch of spec.CONTACT.channels) {
      const listed = await content.listAdminContactChannels(db, { churchId });
      const existing = (listed.items || []).find(
        (it) => String(it.label) === ch.label || String(it.value) === ch.value
      );
      if (existing) {
        const owned =
          spec.isDemoMarkedText(existing.label) || String(existing.value || "").includes("example.test");
        if (!owned) {
          actions.push(act(`contact.${ch.demoKey}`, STATUS.SKIPPED, "user_channel_preserved"));
        } else if (!refresh) {
          actions.push(act(`contact.${ch.demoKey}`, STATUS.ALREADY_PRESENT, ch.label, { id: existing.id }));
        } else if (dryRun) {
          actions.push(act(`contact.${ch.demoKey}`, STATUS.PLANNED, ch.label));
        } else {
          await content.updateContactChannel(db, existing.id, {
            channelType: ch.channelType,
            label: ch.label,
            value: ch.value,
            sortOrder: ch.sortOrder,
            status: "published",
            confirmPublish: true,
          });
          actions.push(act(`contact.${ch.demoKey}`, STATUS.REFRESHED, ch.label, { id: existing.id }));
        }
      } else if (dryRun) {
        actions.push(act(`contact.${ch.demoKey}`, STATUS.PLANNED, ch.label));
      } else {
        const created = await content.createContactChannel(db, {
          churchId,
          branchId: null,
          channelType: ch.channelType,
          label: ch.label,
          value: ch.value,
          sortOrder: ch.sortOrder,
          status: "published",
          confirmPublish: true,
        });
        if (!created.ok) {
          actions.push(act(`contact.${ch.demoKey}`, STATUS.ERROR, created.reason || created.status));
          return fail(STATUS.ERROR, "contact_channel_failed", {
            dryRun,
            actions,
            dates,
            organizationKey,
            churchKey,
          });
        }
        actions.push(
          act(`contact.${ch.demoKey}`, STATUS.APPLIED, ch.label, {
            id: created.item && created.item.id,
          })
        );
      }
    }

    // —— Giving method ——
    {
      const gm = spec.GIVING.method;
      const r = await ensureNamedEntity(db, {
        record: `giving.${gm.demoKey}`,
        listFn: () => content.listAdminGivingMethods(db, { churchId }),
        matchField: "label",
        matchValue: gm.label,
        dryRun,
        refresh,
        actions,
        createFn: () =>
          content.createGivingMethod(db, {
            churchId,
            branchId: null,
            methodType: gm.methodType,
            label: gm.label,
            instructions: gm.instructions,
            status: "published",
            confirmPublish: true,
          }),
        updateFn: (id) =>
          content.updateGivingMethod(db, id, {
            methodType: gm.methodType,
            label: gm.label,
            instructions: gm.instructions,
            status: "published",
            confirmPublish: true,
          }),
      });
      if (!r.ok) {
        return fail(STATUS.ERROR, "giving_method_failed", {
          dryRun,
          actions,
          dates,
          organizationKey,
          churchKey,
        });
      }
    }

    // —— Announcements (need actor) ——
    let actorUserId = null;
    if (actorEmail) {
      const user = await withClient(db, (c) => authRepo.findUserByEmail(c, actorEmail));
      if (user) {
        actorUserId = user.id;
        actions.push(act("ops.actor", STATUS.ALREADY_PRESENT, actorEmail, { userId: actorUserId }));
      } else {
        actions.push(act("ops.actor", STATUS.SKIPPED, "actor_email_not_found"));
      }
    }

    const productPolicy = resolveAnnouncementProductPolicy(raw.env || process.env);

    for (const ann of spec.ANNOUNCEMENTS) {
      if (!actorUserId) {
        actions.push(
          act(`announcement.${ann.demoKey}`, dryRun ? STATUS.PLANNED : STATUS.SKIPPED, ann.title)
        );
        continue;
      }
      const rows = await withClient(db, (c) =>
        announcementsRepo.listAnnouncements(c, { churchId, branchId: null, limit: 50 })
      );
      const list = Array.isArray(rows) ? rows : rows.items || [];
      const existing = findByExact(list, "title", ann.title);
      if (existing) {
        actions.push(
          act(`announcement.${ann.demoKey}`, STATUS.ALREADY_PRESENT, ann.title, { id: existing.id })
        );
        if (refresh && !dryRun) {
          await announcements.updateAnnouncement(db, existing.id, {
            actorUserId,
            title: ann.title,
            body: ann.body,
            audiences: ann.audiences,
            status: "published",
            confirmPublish: true,
            productPolicy,
          });
          actions.push(act(`announcement.${ann.demoKey}`, STATUS.REFRESHED, ann.title));
        }
        continue;
      }
      if (dryRun) {
        actions.push(act(`announcement.${ann.demoKey}`, STATUS.PLANNED, ann.title));
        continue;
      }
      const created = await announcements.createAnnouncement(db, {
        churchId,
        branchId: null,
        actorUserId,
        title: ann.title,
        body: ann.body,
        audiences: ann.audiences,
        status: "published",
        confirmPublish: true,
        enforcePublishConfirm: true,
        productPolicy,
      });
      if (!created.ok) {
        actions.push(
          act(`announcement.${ann.demoKey}`, STATUS.ERROR, created.reason || created.status)
        );
        // Non-fatal for website visuals — continue
        continue;
      }
      actions.push(
        act(`announcement.${ann.demoKey}`, STATUS.APPLIED, ann.title, {
          id: created.item && created.item.id,
        })
      );
    }

    actions.push(
      act(
        "footer.note",
        STATUS.ALREADY_PRESENT,
        "Quick links + copyright derive from public shell; socials seeded as contact channels"
      )
    );
    actions.push(
      act(
        "cta.note",
        STATUS.ALREADY_PRESENT,
        `Primary CTA ${spec.HERO.primaryCta.label}; secondary ${spec.HERO.secondaryCta.label} (template)`
      )
    );

    const errored = actions.some(
      (a) => a.status === STATUS.ERROR || a.status === STATUS.BLOCKED
    );
    const categories = summarizeCategories(actions);

    return {
      ok: !errored,
      status: dryRun || diagnose ? STATUS.PLANNED : STATUS.APPLIED,
      message: dryRun || diagnose ? "diagnose_complete" : "apply_complete",
      dryRun: dryRun || diagnose,
      refreshDemoContent: refresh,
      actions,
      categories,
      dates: {
        d0: dates.d0.toISOString(),
        eventStartsAt: dates.events.map((e) => e.startsAt),
        sermonPreachedAt: dates.sermons.map((s) => s.preachedAt),
      },
      keys: {
        organization_key: organizationKey,
        church_key: churchKey,
        hq_branch_id: branchId,
      },
      notes: [
        "Fill-empty by default; --refresh-demo-content updates demo-owned rows only.",
        "Never deletes or archives user content.",
        "Static /church/images/* media patched via repository (admin HTTPS validator).",
        "Sermon category is encoded in summary prefix (no category column).",
        "No V4 tables touched.",
      ],
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.ERROR,
      message: "seed_failure",
      detail: err && err.message ? String(err.message).slice(0, 240) : null,
      dryRun,
      actions,
      dates,
      keys: { organization_key: organizationKey, church_key: churchKey },
    };
  }
}

function fail(status, message, ctx) {
  return {
    ok: false,
    status,
    message,
    dryRun: ctx.dryRun,
    actions: ctx.actions,
    dates: ctx.dates,
    keys: {
      organization_key: ctx.organizationKey,
      church_key: ctx.churchKey,
    },
  };
}

function summarizeCategories(actions) {
  const keys = [
    "page",
    "section",
    "service_times",
    "leader",
    "ministry",
    "event",
    "sermon",
    "contact",
    "giving",
    "announcement",
    "settings",
  ];
  const out = {};
  for (const key of keys) {
    out[key] = (actions || []).filter((a) => String(a.record || "").startsWith(key)).length;
  }
  return out;
}

function sourceTouchesV4(relPathFs) {
  const fs = require("fs");
  const text = fs.readFileSync(relPathFs, "utf8");
  return {
    tenants: /\bpublic\.tenants\b/.test(text),
    session: /\bpublic\.session\b/.test(text),
  };
}

module.exports = {
  STATUS,
  ALLOW_ENV,
  evaluateTestingDemoContentEnvironment,
  seedTestingWebsiteDemoContent,
  sourceTouchesV4,
};
