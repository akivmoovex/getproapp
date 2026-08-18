"use strict";

/**
 * Clone BlessBoard demo/template copy into tenant-owned public_pages sections.
 * Source: tenantPublicDemoContent (public Demo Centre pack), not demo-church DB rows.
 * Never overwrites existing customized sections. Does not share rows with demo-church.
 */

const publicContentRepo = require("../repositories/publicContentRepository");
const { PAGE_KEY_TITLES, PUBLIC_PAGE_KEYS } = require("./publicContentConstants");
const {
  buildPublicDemoPack,
  interpolateDemoValue,
  SERVICE_TIMES,
} = require("./tenantPublicDemoContent");

const PLACEHOLDER_LABEL = "Template example — replace with your church’s information.";

function churchName(raw) {
  const name = String(raw || "").trim();
  return name || "Church";
}

async function ensureSection(client, page, spec) {
  if (!page || !page.id || !spec || !spec.sectionKey) return { created: false };
  const existing = await publicContentRepo.findSectionByPageAndKeyForProvision(
    client,
    page.id,
    spec.sectionKey
  );
  if (existing) return { created: false, section: existing };
  const section = await publicContentRepo.insertSection(client, {
    pageId: page.id,
    sectionKey: spec.sectionKey,
    sectionType: spec.sectionType || "text",
    heading: spec.heading || null,
    bodyText: spec.bodyText || null,
    mediaUrl: spec.mediaUrl || null,
    sortOrder: spec.sortOrder != null ? spec.sortOrder : 0,
    status: spec.status || "draft",
    layoutMetadata: spec.layoutMetadata || null,
  });
  return { created: true, section };
}

function contactBody(packBody, extras) {
  const parts = [packBody];
  const phone = extras && extras.primaryPhone ? String(extras.primaryPhone).trim() : "";
  const email = extras && extras.primaryEmail ? String(extras.primaryEmail).trim() : "";
  const address = extras && extras.address ? String(extras.address).trim() : "";
  const city = extras && extras.city ? String(extras.city).trim() : "";
  const location = address || city;
  if (phone || email || location) {
    parts.push(
      ["Reach us using the details from registration:", phone, email, location]
        .filter(Boolean)
        .join(" ")
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

function locationLine(extras) {
  const address = extras && extras.address ? String(extras.address).trim() : "";
  const city = extras && extras.city ? String(extras.city).trim() : "";
  return address || city || "";
}

function heroMeta(eyebrow, primaryLabel, primaryUrl) {
  const meta = { templateExample: true };
  if (eyebrow) meta.eyebrow = eyebrow;
  if (primaryLabel) meta.buttonText = primaryLabel;
  if (primaryUrl) meta.buttonUrl = primaryUrl;
  return meta;
}

/**
 * Tenant-owned CMS section specs cloned from the public demo pack.
 * @param {object} pack
 * @param {object} fields
 */
function buildBlessBoardWebsiteTemplateSpecs(pack, fields) {
  const location = locationLine(fields);
  const email = String((fields && fields.primaryEmail) || "").trim();
  const phone = String((fields && fields.primaryPhone) || "").trim();
  const placeholderNote = `${PLACEHOLDER_LABEL} Sample listings from the BlessBoard church website template — not this congregation’s published people, events, or ministries.`;

  return [
    {
      pageKey: "home",
      spec: {
        sectionKey: "hero",
        sectionType: "hero",
        heading: pack.home.heroHeading,
        bodyText: pack.home.heroBody,
        mediaUrl: pack.home.heroMediaUrl || null,
        sortOrder: 0,
        layoutMetadata: heroMeta(pack.home.heroEyebrow, "Plan a visit", "/contact"),
      },
    },
    {
      pageKey: "home",
      spec: {
        sectionKey: "welcome",
        sectionType: "text",
        heading: pack.home.welcomeHeading,
        bodyText: pack.home.welcomeBody,
        mediaUrl: pack.home.heroMediaUrl || null,
        sortOrder: 1,
      },
    },
    {
      pageKey: "home",
      spec: {
        sectionKey: "ministries_intro",
        sectionType: "text",
        heading: pack.home.ministriesIntroHeading,
        bodyText: `${pack.home.ministriesIntroBody}\n\n${placeholderNote}`,
        mediaUrl: pack.media.ministriesIntro || null,
        sortOrder: 2,
      },
    },
    {
      pageKey: "home",
      spec: {
        sectionKey: "events_intro",
        sectionType: "text",
        heading: pack.home.eventsIntroHeading,
        bodyText: `${pack.home.eventsIntroBody}\n\n${placeholderNote}`,
        mediaUrl: pack.media.eventsIntro || null,
        sortOrder: 3,
      },
    },
    {
      pageKey: "home",
      spec: {
        sectionKey: "sermons_intro",
        sectionType: "text",
        heading: pack.home.sermonIntroHeading,
        bodyText: `${pack.home.sermonIntroBody}\n\n${placeholderNote}`,
        mediaUrl: pack.media.sermonsIntro || null,
        sortOrder: 4,
      },
    },
    {
      pageKey: "home",
      spec: {
        sectionKey: "leadership_intro",
        sectionType: "text",
        heading: pack.home.leadershipIntroHeading,
        bodyText: `${pack.home.leadershipIntroBody}\n\n${placeholderNote}`,
        mediaUrl: pack.media.leadershipIntro || null,
        sortOrder: 5,
      },
    },
    {
      pageKey: "home",
      spec: {
        sectionKey: "giving_cta",
        sectionType: "text",
        heading: pack.home.givingHeading,
        bodyText: pack.home.givingBody,
        sortOrder: 6,
        layoutMetadata: { buttonText: "Ways to give", buttonUrl: "/giving" },
      },
    },
    {
      pageKey: "home",
      spec: {
        sectionKey: "contact_intro",
        sectionType: "text",
        heading: pack.home.contactHeading,
        bodyText: pack.home.contactBody,
        sortOrder: 7,
        layoutMetadata: { buttonText: "Contact us", buttonUrl: "/contact" },
      },
    },
    {
      pageKey: "home",
      spec: {
        sectionKey: "footer",
        sectionType: "footer",
        heading: null,
        bodyText: pack.footer.description,
        sortOrder: 90,
        layoutMetadata: {
          tagline: `${pack.churchName} · A community of faith, welcome, and hope.`,
        },
      },
    },
    {
      pageKey: "about",
      spec: {
        sectionKey: "hero",
        sectionType: "hero",
        heading: pack.about.heroHeading,
        bodyText: pack.about.heroBody,
        mediaUrl: pack.about.heroMediaUrl || null,
        sortOrder: 0,
        layoutMetadata: heroMeta(null, "Visit on Sunday", "/contact"),
      },
    },
    {
      pageKey: "about",
      spec: {
        sectionKey: "story",
        sectionType: "story",
        heading: pack.about.story.heading,
        bodyText: pack.about.story.bodyText,
        mediaUrl: pack.about.story.mediaUrl || null,
        sortOrder: 1,
      },
    },
    {
      pageKey: "about",
      spec: {
        sectionKey: "mission",
        sectionType: "mission",
        heading: pack.about.mission.heading,
        bodyText: pack.about.mission.bodyText,
        sortOrder: 2,
      },
    },
    {
      pageKey: "about",
      spec: {
        sectionKey: "vision",
        sectionType: "vision",
        heading: pack.about.vision.heading,
        bodyText: pack.about.vision.bodyText,
        sortOrder: 3,
      },
    },
    {
      pageKey: "about",
      spec: {
        sectionKey: "values",
        sectionType: "values",
        heading: "Our Values",
        bodyText: PLACEHOLDER_LABEL,
        sortOrder: 4,
      },
    },
    ...pack.about.values.map((value, index) => ({
      pageKey: "about",
      spec: {
        sectionKey: value.sectionKey,
        sectionType: value.sectionType || "values",
        heading: value.heading,
        bodyText: value.bodyText,
        sortOrder: 5 + index,
      },
    })),
    {
      pageKey: "about",
      spec: {
        sectionKey: "beliefs",
        sectionType: "beliefs",
        heading: pack.about.beliefs.heading,
        bodyText: pack.about.beliefs.bodyText,
        sortOrder: 10,
      },
    },
    {
      pageKey: "about",
      spec: {
        sectionKey: "community",
        sectionType: "community",
        heading: pack.about.community.heading,
        bodyText: pack.about.community.bodyText,
        sortOrder: 11,
      },
    },
    {
      pageKey: "about",
      spec: {
        sectionKey: "gallery",
        sectionType: "gallery",
        heading: "Life Together",
        bodyText: PLACEHOLDER_LABEL,
        sortOrder: 12,
      },
    },
    ...pack.about.gallery.map((src, index) => ({
      pageKey: "about",
      spec: {
        sectionKey: `gallery_${index + 1}`,
        sectionType: "image",
        heading: "Template photo",
        mediaUrl: src,
        sortOrder: 13 + index,
        layoutMetadata: { templateExample: true },
      },
    })),
    {
      pageKey: "about",
      spec: {
        sectionKey: "visitor_cta",
        sectionType: "cta",
        heading: pack.about.visitorCtaHeading,
        bodyText: pack.about.visitorCtaBody,
        sortOrder: 20,
        layoutMetadata: {
          buttonText: "Plan a visit",
          buttonUrl: "/contact",
          secondaryButtonText: "Contact us",
          secondaryButtonUrl: "/contact",
        },
      },
    },
    {
      pageKey: "leadership",
      spec: {
        sectionKey: "hero",
        sectionType: "hero",
        heading: pack.leadership.introHeading,
        bodyText: `${pack.leadership.introBody}\n\n${placeholderNote}`,
        mediaUrl: pack.leadership.introMediaUrl || null,
        sortOrder: 0,
        layoutMetadata: heroMeta(null, "Talk with a pastor", "/contact"),
      },
    },
    {
      pageKey: "ministries",
      spec: {
        sectionKey: "hero",
        sectionType: "hero",
        heading: pack.ministriesPage.introHeading,
        bodyText: `${pack.ministriesPage.introBody}\n\n${placeholderNote}`,
        mediaUrl: pack.ministriesPage.introMediaUrl || null,
        sortOrder: 0,
        layoutMetadata: heroMeta(null, "Find a group", "/contact"),
      },
    },
    {
      pageKey: "events",
      spec: {
        sectionKey: "hero",
        sectionType: "hero",
        heading: pack.eventsPage.introHeading,
        bodyText: `${pack.eventsPage.introBody}\n\n${placeholderNote}`,
        mediaUrl: pack.eventsPage.introMediaUrl || null,
        sortOrder: 0,
        layoutMetadata: heroMeta(null, "See gatherings", "/contact"),
      },
    },
    {
      pageKey: "sermons",
      spec: {
        sectionKey: "hero",
        sectionType: "hero",
        heading: pack.sermonsPage.introHeading,
        bodyText: `${pack.sermonsPage.introBody}\n\n${placeholderNote}`,
        mediaUrl: pack.sermonsPage.introMediaUrl || null,
        sortOrder: 0,
        layoutMetadata: heroMeta(null, "Recent teachings", "/sermons"),
      },
    },
    {
      pageKey: "contact",
      spec: {
        sectionKey: "hero",
        sectionType: "hero",
        heading: pack.contactPage.introHeading,
        bodyText: pack.contactPage.introBody,
        sortOrder: 0,
        layoutMetadata: heroMeta(null, "Send a message", "/contact"),
      },
    },
    {
      pageKey: "contact",
      spec: {
        sectionKey: "contact",
        sectionType: "text",
        heading: pack.home.contactHeading,
        bodyText: contactBody(pack.home.contactBody, fields),
        sortOrder: 1,
      },
    },
    {
      pageKey: "contact",
      spec: {
        sectionKey: "details",
        sectionType: "contact",
        heading: "Church contact",
        bodyText: contactBody(pack.contactPage.introBody, fields),
        sortOrder: 2,
        layoutMetadata: {
          email: email || null,
          phone: phone || null,
          address: location || null,
        },
      },
    },
    {
      pageKey: "contact",
      spec: {
        sectionKey: "visitor_guidance",
        sectionType: "text",
        heading: "First-time visitors",
        bodyText: pack.contactPage.visitorGuidance,
        sortOrder: 3,
      },
    },
    {
      pageKey: "contact",
      spec: {
        sectionKey: "directions",
        sectionType: "text",
        heading: pack.contactPage.directionsHeading,
        bodyText: location
          ? `${pack.contactPage.directionsBody}\n\n${location}`
          : pack.contactPage.directionsBody,
        sortOrder: 4,
      },
    },
    {
      pageKey: "contact",
      spec: {
        sectionKey: "office_hours",
        sectionType: "text",
        heading: pack.contactPage.officeHoursHeading,
        bodyText: `${pack.contactPage.officeHoursBody}\n\n${PLACEHOLDER_LABEL} Example office hours until this church publishes its own.`,
        sortOrder: 5,
        layoutMetadata: { templateExample: true },
      },
    },
    {
      pageKey: "contact",
      spec: {
        sectionKey: "service_reminder",
        sectionType: "text",
        heading: pack.contactPage.serviceReminderHeading,
        bodyText: pack.contactPage.serviceReminderBody,
        sortOrder: 6,
      },
    },
    {
      pageKey: "giving",
      spec: {
        sectionKey: "hero",
        sectionType: "hero",
        heading: pack.givingPage.introHeading,
        bodyText: pack.givingPage.introBody,
        sortOrder: 0,
        layoutMetadata: heroMeta(null, "Contact the office", "/contact"),
      },
    },
    {
      pageKey: "giving",
      spec: {
        sectionKey: "why",
        sectionType: "text",
        heading: pack.givingPage.whyHeading,
        bodyText: PLACEHOLDER_LABEL,
        sortOrder: 1,
      },
    },
    ...pack.givingPage.whyItems.map((item, index) => ({
      pageKey: "giving",
      spec: {
        sectionKey: item.sectionKey,
        sectionType: "text",
        heading: item.title,
        bodyText: item.body,
        sortOrder: 2 + index,
        layoutMetadata: { icon: item.icon || null },
      },
    })),
    {
      pageKey: "giving",
      spec: {
        sectionKey: "stewardship",
        sectionType: "text",
        heading: pack.givingPage.stewardshipHeading,
        bodyText: pack.givingPage.stewardshipBody,
        sortOrder: 10,
      },
    },
    {
      pageKey: "giving",
      spec: {
        sectionKey: "ways",
        sectionType: "text",
        heading: pack.givingPage.waysHeading,
        bodyText: pack.givingMethods.map((method) => `${method.label}: ${method.instructions}`).join("\n\n"),
        sortOrder: 11,
      },
    },
    {
      pageKey: "giving",
      spec: {
        sectionKey: "accountability",
        sectionType: "text",
        heading: "Accountable care",
        bodyText: pack.givingPage.accountability,
        sortOrder: 12,
      },
    },
    {
      pageKey: "giving",
      spec: {
        sectionKey: "assistance",
        sectionType: "text",
        heading: "Need help?",
        bodyText: pack.givingPage.assistanceContact,
        sortOrder: 13,
        layoutMetadata: { buttonText: "Contact the office", buttonUrl: "/contact" },
      },
    },
  ];
}

async function seedServiceTimesIfEmpty(client, homePage, pack) {
  if (!homePage || !homePage.id) return { created: false };
  const existing = await publicContentRepo.findSectionByPageAndKeyForProvision(
    client,
    homePage.id,
    "service_times"
  );
  const meta =
    existing && existing.layoutMetadata && typeof existing.layoutMetadata === "object"
      ? existing.layoutMetadata
      : {};
  const current = Array.isArray(meta.entries) ? meta.entries : [];
  if (current.length) return { created: false, section: existing };

  const entries = (pack.serviceTimes || SERVICE_TIMES).map((entry, index) => ({
    name: entry.name,
    day: entry.day,
    startTime: entry.startTime,
    endTime: entry.endTime || null,
    location: entry.location || null,
    note: `${PLACEHOLDER_LABEL} Example gathering time from the BlessBoard church website template.`,
    enabled: entry.enabled !== false,
    sortOrder: entry.sortOrder != null ? entry.sortOrder : index,
  }));
  const bodyText = entries
    .map((entry) => `${entry.name} · ${entry.day} ${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ""}`)
    .join("\n");
  const layoutMetadata = { schema: "service_times_v1", entries, templateExample: true };

  if (!existing) {
    const section = await publicContentRepo.insertSection(client, {
      pageId: homePage.id,
      sectionKey: "service_times",
      sectionType: "service_times",
      heading: pack.home.serviceTimesHeading || "When We Gather",
      bodyText,
      sortOrder: 10,
      status: "draft",
      layoutMetadata,
    });
    return { created: true, section };
  }

  await publicContentRepo.updateSection(client, existing.id, {
    heading: pack.home.serviceTimesHeading || "When We Gather",
    bodyText,
    layoutMetadata,
  });
  return { created: true, filled: true, section: existing };
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   churchId: string,
 *   publicName?: string|null,
 *   primaryEmail?: string|null,
 *   primaryPhone?: string|null,
 *   address?: string|null,
 *   city?: string|null,
 * }} fields
 */
async function seedTenantOwnedWebsiteTemplateContent(client, fields) {
  const churchId = String((fields && fields.churchId) || "").trim();
  const publicName = churchName(fields && fields.publicName);
  if (!churchId) return { ok: false, created: 0 };

  const pack = interpolateDemoValue(buildPublicDemoPack({ publicName }), publicName);
  const created = [];
  const pagesByKey = {};

  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const pageResult = await publicContentRepo.ensureDraftPage(client, {
      churchId,
      branchId: null,
      pageKey,
      title: PAGE_KEY_TITLES[pageKey] || pageKey,
    });
    pagesByKey[pageKey] = pageResult && pageResult.page;
  }

  const specs = buildBlessBoardWebsiteTemplateSpecs(pack, fields);
  for (const row of specs) {
    const result = await ensureSection(client, pagesByKey[row.pageKey], row.spec);
    if (result.created) created.push(`${row.pageKey}.${row.spec.sectionKey}`);
  }

  const times = await seedServiceTimesIfEmpty(client, pagesByKey.home, pack);
  if (times.created) created.push("home.service_times");

  return { ok: true, created: created.length, keys: created };
}

module.exports = {
  PLACEHOLDER_LABEL,
  seedTenantOwnedWebsiteTemplateContent,
  buildBlessBoardWebsiteTemplateSpecs,
};
