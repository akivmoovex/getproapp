"use strict";

/**
 * Deterministic Phase 7 exact-reference visual fixture.
 * Testing / visual suite only — fictional copy aligned to Phase 7 Stitch HTML
 * (project 17124191473876947591). Never used for production customer data.
 *
 * Media: keeps existing same-site demo assets (Stitch remote media = MEDIA_BLOCKED).
 */

const base = require("./testingWebsiteDemoContentSpec");

const DEMO_TAG = base.DEMO_TAG;

const IDENTITY = Object.freeze({
  ...base.IDENTITY,
  displayName: `Grace Community Church ${DEMO_TAG}`,
  tagline: "Faith, Community and Hope",
  welcomeMessage:
    "We're so glad you're here. At Grace Community Church, we believe faith is a journey best taken together.",
  mission:
    'To cultivate a space of sacred clarity where high-performance lives find divine purpose.',
  vision:
    "A global network of intentional communities operating with composed focus and sacred presence.",
  values:
    "Welcome · Scripture · Service · Integrity — Phase 7 Stitch visual fixture (fictional).",
});

const HERO = Object.freeze({
  ...base.HERO,
  heading: "Grace Community Church",
  bodyText:
    "A place where everyone belongs, purpose is discovered, and lives are transformed through the love of Christ.",
  primaryCta: { label: "Plan Your Visit", path: "/contact" },
  secondaryCta: { label: "Watch Latest Sermon", path: "/sermons" },
});

const SERVICE_TIMES = Object.freeze([
  {
    id: "demo-sunday",
    name: `Sunday Worship ${DEMO_TAG}`,
    day: "sunday",
    startTime: "09:00",
    endTime: "11:00",
    location: "Main sanctuary (demo)",
    note: "9:00 AM & 11:00 AM — fictional Stitch fixture",
    enabled: true,
    sortOrder: 10,
  },
  {
    id: "demo-midweek",
    name: `Wednesday Midweek ${DEMO_TAG}`,
    day: "wednesday",
    startTime: "18:30",
    endTime: "20:00",
    location: "Fellowship hall (demo)",
    note: null,
    enabled: true,
    sortOrder: 20,
  },
]);

const HQ_CONTACT = Object.freeze({
  ...base.HQ_CONTACT,
  email: "hello@grace-community.example.test",
  phone: "+1-555-0123",
  addressLine1: "123 Sacred Way",
  addressLine2: null,
  city: "Modern Heights",
  provinceState: "ST",
  postalCode: "54321",
  officeHours: "Monday - Thursday 9:00 AM - 4:00 PM (demo)",
});

const ABOUT_SECTIONS = Object.freeze(
  base.ABOUT_SECTIONS.map((section) => {
    if (section.sectionKey === "about_hero") {
      return {
        ...section,
        heading: "Our Story",
        bodyText:
          "Founded in 1994, BlessBoard began as a small gathering of families seeking a deeper, more intentional connection with the divine. This is fictional Phase 7 visual fixture copy.",
      };
    }
    if (section.sectionKey === "story") {
      return {
        ...section,
        heading: "Roots of Connection",
        bodyText:
          "We believe spiritual growth shouldn't be noisy—it should be a composed focus. Fictional Phase 7 About story for visual parity checks.",
      };
    }
    if (section.sectionKey === "mission") {
      return { ...section, heading: "Mission", bodyText: IDENTITY.mission };
    }
    if (section.sectionKey === "vision") {
      return { ...section, heading: "Vision", bodyText: IDENTITY.vision };
    }
    return section;
  })
);

const LEADERS = Object.freeze([
  {
    demoKey: "leader:senior-pastor",
    displayName: `Pastor John Banda ${DEMO_TAG}`,
    roleTitle: "Senior Pastor",
    biography:
      "With over two decades of ministry experience, Pastor John leads with compassion and strategic spiritual growth. Fictional Phase 7 fixture — no real person.",
    imageUrl: base.MEDIA.pastor,
    sortOrder: 10,
  },
  {
    demoKey: "leader:associate-pastor",
    displayName: `Sarah Chen ${DEMO_TAG}`,
    roleTitle: "Executive Team",
    biography: "Collaborative vision and operations support — fictional Phase 7 fixture.",
    imageUrl: base.MEDIA.associate,
    sortOrder: 20,
  },
  {
    demoKey: "leader:ministry-leader",
    displayName: `Marcus Thorne ${DEMO_TAG}`,
    roleTitle: "Ministry Leader",
    biography: "Fictional ministry leader for Phase 7 leadership card-count alignment.",
    imageUrl: base.MEDIA.ministryLeader,
    sortOrder: 30,
  },
]);

const MINISTRIES = Object.freeze([
  {
    demoKey: "ministry:worship",
    name: `Sacred Worship ${DEMO_TAG}`,
    summary: "Immersive experiences blending liturgical depth with modern clarity.",
    description: "Fictional Phase 7 ministries card.",
    meetingDay: "Sunday",
    imageUrl: base.MEDIA.ministryChildren,
    sortOrder: 10,
  },
  {
    demoKey: "ministry:children",
    name: `Children's Discovery ${DEMO_TAG}`,
    summary: "A safe, high-engagement environment for young faith explorers.",
    description: "Fictional children's ministry for Phase 7 visual fixture.",
    meetingDay: "Sunday",
    imageUrl: base.MEDIA.ministryYouth,
    sortOrder: 20,
  },
  {
    demoKey: "ministry:outreach",
    name: `Impact Outreach ${DEMO_TAG}`,
    summary: "Leveraging resources to serve our city with precision and love.",
    description: "Fictional outreach ministry.",
    meetingDay: "Saturday",
    imageUrl: base.MEDIA.ministryWomen,
    sortOrder: 30,
  },
  {
    demoKey: "ministry:adults",
    name: `Young Professional Hub ${DEMO_TAG}`,
    summary: "A collaborative community for professionals seeking spiritual roots.",
    description: "Fictional adults ministry card.",
    meetingDay: "Thursday",
    imageUrl: base.MEDIA.ministryMen,
    sortOrder: 40,
  },
]);

const EVENTS = Object.freeze([
  {
    demoKey: "event:summit",
    title: `Grace Leaders Global Summit ${DEMO_TAG}`,
    summary:
      "A three-day immersive experience for ministry leaders — fictional Phase 7 fixture.",
    daysFromD0: 2,
    hourUtc: 10,
    timezone: "UTC",
    imageUrl: base.MEDIA.eventFeatured,
  },
  {
    demoKey: "event:community",
    title: `Sunday Morning Connection ${DEMO_TAG}`,
    summary: "Focused networking hour before service — fictional testing event.",
    daysFromD0: 9,
    hourUtc: 9,
    timezone: "UTC",
    imageUrl: base.MEDIA.event2,
  },
  {
    demoKey: "event:workshop",
    title: `Kingdom Workshop ${DEMO_TAG}`,
    summary: "Intentional fellowship and spiritual growth (demo only).",
    daysFromD0: 16,
    hourUtc: 18,
    timezone: "UTC",
    imageUrl: base.MEDIA.event3,
  },
]);

const SERMONS = Object.freeze([
  {
    demoKey: "sermon:peace",
    title: `Finding Stillness in a High-Performance World ${DEMO_TAG}`,
    speakerName: `Pastor Elias Vance ${DEMO_TAG}`,
    daysBeforeD0: 7,
    category: "The Architecture of Peace",
    summary:
      "Build internal sanctuaries that withstand modern pressures. Fictional Phase 7 sermon.",
    imageUrl: base.MEDIA.sermonFeatured,
  },
  {
    demoKey: "sermon:stewardship",
    title: `Digital Stewardship ${DEMO_TAG}`,
    speakerName: `Dr. Sarah Chen ${DEMO_TAG}`,
    daysBeforeD0: 14,
    category: "Digital Stewardship",
    summary: "Fictional recent sermon for Phase 7 sermons list.",
    imageUrl: base.MEDIA.sermon1,
  },
  {
    demoKey: "sermon:focus",
    title: `Foundations of Focus ${DEMO_TAG}`,
    speakerName: `Rev. Marcus Thorne ${DEMO_TAG}`,
    daysBeforeD0: 21,
    category: "Foundations of Focus",
    summary: "Fictional third sermon card for count alignment.",
    imageUrl: base.MEDIA.sermon2,
  },
]);

const GIVING = Object.freeze({
  introHeading: "Investing in Sacred Space and Community",
  introBody:
    '"Every man shall give as he is able, according to the blessing of the Lord your God which He has given you." — Deuteronomy 16:17. BlessBoard does not process payments here. Fictional Phase 7 fixture only.',
  method: {
    demoKey: "giving:online-info",
    methodType: "bank_transfer",
    label: `Give Online ${DEMO_TAG}`,
    instructions:
      "TEST ONLY — Do not send money. Use the fictional online giving instructions shown for Phase 7 visual parity. Account: DEMO-00-0000.",
  },
});

const CONTACT = Object.freeze({
  introHeading: "We'd Love to Hear From You",
  introBody:
    "Whether you have a prayer request, a question about our ministries, or just want to say hello — fictional Phase 7 contact copy. No real inboxes are monitored.",
  officeHoursHeading: "Office hours",
  officeHoursBody: HQ_CONTACT.officeHours,
  channels: [
    {
      demoKey: "contact:email",
      channelType: "email",
      label: `Office email ${DEMO_TAG}`,
      value: HQ_CONTACT.email,
      sortOrder: 10,
    },
    {
      demoKey: "contact:phone",
      channelType: "phone",
      label: `Office phone ${DEMO_TAG}`,
      value: HQ_CONTACT.phone,
      sortOrder: 20,
    },
    {
      demoKey: "contact:facebook",
      channelType: "facebook",
      label: `Facebook ${DEMO_TAG}`,
      value: "https://example.test/grace-community-facebook",
      sortOrder: 30,
    },
    {
      demoKey: "contact:instagram",
      channelType: "instagram",
      label: `Instagram ${DEMO_TAG}`,
      value: "https://example.test/grace-community-instagram",
      sortOrder: 40,
    },
    {
      demoKey: "contact:youtube",
      channelType: "youtube",
      label: `YouTube ${DEMO_TAG}`,
      value: "https://example.test/grace-community-youtube",
      sortOrder: 50,
    },
  ],
});

const PAGE_TITLES = Object.freeze({
  ...base.PAGE_TITLES,
  home: `${IDENTITY.displayName} — Home`,
  about: `Our Story — ${DEMO_TAG}`,
});

function relativeDates(d0) {
  const day =
    d0 instanceof Date && !Number.isNaN(d0.getTime()) ? new Date(d0) : new Date();
  const utcDay = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());

  function addDays(n) {
    return new Date(utcDay + n * 86400000);
  }

  const events = EVENTS.map((ev) => {
    const start = addDays(ev.daysFromD0);
    start.setUTCHours(ev.hourUtc, 0, 0, 0);
    return {
      demoKey: ev.demoKey,
      title: ev.title,
      summary: ev.summary,
      timezone: ev.timezone,
      startsAt: start.toISOString(),
      imageUrl: ev.imageUrl || null,
    };
  });

  const sermons = SERMONS.map((s) => {
    const when = addDays(-s.daysBeforeD0);
    return {
      demoKey: s.demoKey,
      title: s.title,
      speakerName: s.speakerName,
      category: s.category,
      summary: base.sermonSummaryWithCategory
        ? base.sermonSummaryWithCategory(s)
        : `Category: ${s.category}. ${s.summary}`,
      preachedAt: when.toISOString(),
      imageUrl: s.imageUrl || null,
    };
  });

  return {
    d0: new Date(utcDay),
    events,
    sermons,
  };
}

module.exports = {
  ...base,
  IDENTITY,
  HERO,
  SERVICE_TIMES,
  HQ_CONTACT,
  ABOUT_SECTIONS,
  LEADERS,
  MINISTRIES,
  EVENTS,
  SERMONS,
  GIVING,
  CONTACT,
  PAGE_TITLES,
  relativeDates,
  PHASE7_EXACT_VISUAL: true,
  MEDIA_NOTE:
    "Stitch remote hero/card photography is MEDIA_BLOCKED; layout uses deterministic same-site demo media.",
};
