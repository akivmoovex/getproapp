"use strict";

/**
 * Rich BlessBoard V5 testing website demo content (Stitch-shaped).
 * Fictional only — [Demo] markers, example.test contacts, no real banking/PII.
 */

const DEMO_TAG = "[Demo]";
const DEMO_TOOL = "testing-website-demo";
const DEMO_REFERENCE_PREFIX = "bb-testing-demo:";

const DEFAULT_ORGANIZATION_KEY = "automated-test-church";
const DEFAULT_CHURCH_KEY = "automated-test-church";
const DEFAULT_DISPLAY_NAME = "BlessBoard Automated Test Church";
const DEFAULT_ACTOR_EMAIL = "church-hq-admin@example.test";

/** Safe static assets already in the repo (public renderer allows same-site paths). */
const MEDIA = Object.freeze({
  homeHero: "/church/images/tenant-public/home-desktop-hero.jpg",
  aboutHero: "/church/images/tenant-public/about-hero-building.jpg",
  aboutStory: "/church/images/tenant-public/home-mobile-hero.jpg",
  pastor: "/church/images/leadership/pastor-desktop.jpg",
  associate: "/church/images/leadership/assistant-desktop.jpg",
  ministryLeader: "/church/images/leadership/elder-1.jpg",
  ministryChildren: "/church/images/leadership/ministry-1.jpg",
  ministryYouth: "/church/images/leadership/ministry-2.jpg",
  ministryWomen: "/church/images/leadership/ministry-3.jpg",
  ministryMen: "/church/images/leadership/ministry-m1.jpg",
  eventFeatured: "/church/images/events/event-1.jpg",
  event2: "/church/images/events/event-2.jpg",
  event3: "/church/images/events/event-3.jpg",
  sermonFeatured: "/church/images/sermons/sermon-featured-desktop.jpg",
  sermon1: "/church/images/sermons/sermon-1.jpg",
  sermon2: "/church/images/sermons/sermon-2.jpg",
  sermon3: "/church/images/sermons/sermon-3.jpg",
  sermonThumb1: "/church/images/sermons/sermon-thumb-1.jpg",
  sermonThumb2: "/church/images/sermons/sermon-thumb-2.jpg",
  leadershipIntro: "/church/images/leadership/pastor-desktop.jpg",
  ministriesIntro: "/church/images/leadership/ministry-1.jpg",
  eventsIntro: "/church/images/events/event-1.jpg",
  sermonsIntro: "/church/images/sermons/sermon-featured-desktop.jpg",
});

const IDENTITY = Object.freeze({
  displayName: DEFAULT_DISPLAY_NAME,
  tagline: "A welcoming testing congregation for BlessBoard demos",
  welcomeMessage:
    "Welcome to our digital home. This is a fictional testing congregation used only for BlessBoard product demos.",
  mission:
    "To gather, grow, and serve together as a fictional demo community for BlessBoard testing.",
  vision:
    "A clear, trustworthy church website experience that helps visitors find worship, people, and next steps.",
  values:
    "Welcome · Scripture · Service · Integrity — fictional values for Stitch-parity demos only.",
});

const HERO = Object.freeze({
  sectionKey: "hero",
  sectionType: "hero",
  heading: "A Place for Spiritual Growth & Community",
  bodyText:
    "Join us for worship, connection, and practical next steps in our digital sanctuary. This hero copy is demo-only for Stitch visual testing.",
  mediaUrl: MEDIA.homeHero,
  primaryCta: { label: "Join a Service", path: "/events" },
  secondaryCta: { label: "Giving", path: "/giving" },
});

const SERVICE_TIMES = Object.freeze([
  {
    id: "demo-sunday",
    name: "Sunday Worship [Demo]",
    day: "sunday",
    startTime: "10:00",
    endTime: "11:30",
    location: "Main sanctuary (demo)",
    note: "Fictional testing service",
    enabled: true,
    sortOrder: 10,
  },
  {
    id: "demo-midweek",
    name: "Midweek Gathering [Demo]",
    day: "wednesday",
    startTime: "19:00",
    endTime: "20:15",
    location: "Fellowship hall (demo)",
    note: null,
    enabled: true,
    sortOrder: 20,
  },
  {
    id: "demo-prayer",
    name: "Prayer Meeting [Demo]",
    day: "friday",
    startTime: "06:30",
    endTime: "07:15",
    location: "Prayer room (demo)",
    note: null,
    enabled: true,
    sortOrder: 30,
  },
]);

const HQ_CONTACT = Object.freeze({
  email: "office@automated-test.example.test",
  phone: "+1-555-0100",
  addressLine1: "100 Demo Sanctuary Way",
  addressLine2: "Suite Testing",
  city: "Demo City",
  provinceState: "DC",
  postalCode: "00000",
  // Neutral ocean coords — map embed only; not a real church address.
  latitude: -8.7832,
  longitude: -124.5085,
  officeHours: "Tue–Fri 9:00–16:00 (demo office hours — fictional)",
});

/** Home page announcement band (public website highlight — not member portal announcements). */
const HOME_ANNOUNCEMENT = Object.freeze({
  heading: "[Demo] This Week at Church",
  bodyText:
    "Join Sunday worship and the midweek gathering. This highlight is fictional demo copy for Stitch home parity.",
});

const ABOUT_SECTIONS = Object.freeze([
  {
    sectionKey: "about_hero",
    sectionType: "hero",
    heading: "About Our Church",
    bodyText: IDENTITY.welcomeMessage,
    mediaUrl: MEDIA.aboutHero,
    sortOrder: 5,
  },
  {
    sectionKey: "mission",
    sectionType: "mission",
    heading: "Our Mission",
    bodyText: IDENTITY.mission,
    mediaUrl: null,
    sortOrder: 20,
  },
  {
    sectionKey: "vision",
    sectionType: "vision",
    heading: "Our Vision",
    bodyText: IDENTITY.vision,
    mediaUrl: null,
    sortOrder: 30,
  },
  {
    sectionKey: "values",
    sectionType: "values",
    heading: "Our Values",
    bodyText: IDENTITY.values,
    mediaUrl: null,
    sortOrder: 40,
  },
  {
    sectionKey: "story",
    sectionType: "story",
    heading: "How We Gather",
    bodyText:
      "We are a fictional testing congregation. This story section exists so About layouts can show collage media during Stitch parity checks.",
    mediaUrl: MEDIA.aboutStory,
    sortOrder: 50,
  },
]);

const LEADERS = Object.freeze([
  {
    demoKey: "leader:senior-pastor",
    displayName: "Jordan Hale (Demo)",
    roleTitle: "Senior Pastor",
    biography:
      "Fictional senior pastor profile for BlessBoard testing. No real person is represented.",
    imageUrl: MEDIA.pastor,
    sortOrder: 10,
  },
  {
    demoKey: "leader:associate-pastor",
    displayName: "Sam Okonkwo (Demo)",
    roleTitle: "Associate Pastor",
    biography: "Fictional associate pastor supporting teaching and pastoral care demos.",
    imageUrl: MEDIA.associate,
    sortOrder: 20,
  },
  {
    demoKey: "leader:ministry-leader",
    displayName: "Riley Chen (Demo)",
    roleTitle: "Ministry Leader",
    biography: "Fictional ministry leader coordinating volunteer and outreach demos.",
    imageUrl: MEDIA.ministryLeader,
    sortOrder: 30,
  },
]);

const MINISTRIES = Object.freeze([
  {
    demoKey: "ministry:children",
    name: "[Demo] Children's Ministry",
    summary: "Age-appropriate teaching and welcome for kids during Sunday gatherings.",
    description: "Fictional children's ministry card for Stitch ministries grid testing.",
    meetingDay: "Sunday",
    imageUrl: MEDIA.ministryChildren,
    sortOrder: 10,
  },
  {
    demoKey: "ministry:youth",
    name: "[Demo] Youth Ministry",
    summary: "Midweek connection and Sunday huddles for teens (demo only).",
    description: "Fictional youth ministry for directory layout checks.",
    meetingDay: "Wednesday",
    imageUrl: MEDIA.ministryYouth,
    sortOrder: 20,
  },
  {
    demoKey: "ministry:women",
    name: "[Demo] Women's Ministry",
    summary: "Small groups and prayer gatherings for women in the congregation.",
    description: "Fictional women's ministry entry.",
    meetingDay: "Thursday",
    imageUrl: MEDIA.ministryWomen,
    sortOrder: 30,
  },
  {
    demoKey: "ministry:men",
    name: "[Demo] Men's / Community Outreach",
    summary: "Service projects and neighbourhood welcome teams (demo outreach).",
    description: "Fictional men / community outreach ministry.",
    meetingDay: "Saturday",
    imageUrl: MEDIA.ministryMen,
    sortOrder: 40,
  },
]);

/** Relative day offsets from seed d0 (UTC midnight). */
const EVENTS = Object.freeze([
  {
    demoKey: "event:sunday-worship",
    title: "[Demo] Sunday Worship Gathering",
    summary: "Main weekly worship service for public events list testing.",
    daysFromD0: 2,
    hourUtc: 10,
    timezone: "UTC",
    imageUrl: MEDIA.eventFeatured,
  },
  {
    demoKey: "event:community-meal",
    title: "[Demo] Community Welcome Meal",
    summary: "Casual meal and visitor welcome — fictional testing event.",
    daysFromD0: 9,
    hourUtc: 17,
    timezone: "UTC",
    imageUrl: MEDIA.event2,
  },
  {
    demoKey: "event:youth-night",
    title: "[Demo] Youth Night",
    summary: "Games, discussion, and prayer for youth (demo only).",
    daysFromD0: 16,
    hourUtc: 18,
    timezone: "UTC",
    imageUrl: MEDIA.event3,
  },
]);

const SERMONS = Object.freeze([
  {
    demoKey: "sermon:welcome",
    title: "[Demo] Welcome Home",
    speakerName: "Jordan Hale (Demo)",
    daysBeforeD0: 7,
    category: "Welcome",
    summary: "An introduction to gathering as a community. Fictional testing sermon.",
    imageUrl: MEDIA.sermonFeatured,
  },
  {
    demoKey: "sermon:faith",
    title: "[Demo] Walking in Faith",
    speakerName: "Sam Okonkwo (Demo)",
    daysBeforeD0: 14,
    category: "Teaching",
    summary: "Practical encouragement for daily faith. Demo content only.",
    imageUrl: MEDIA.sermon1,
  },
  {
    demoKey: "sermon:service",
    title: "[Demo] Serving Our Neighbours",
    speakerName: "Riley Chen (Demo)",
    daysBeforeD0: 21,
    category: "Outreach",
    summary: "Why service matters in community life. Fictional resource entry.",
    imageUrl: MEDIA.sermon2,
  },
  {
    demoKey: "sermon:prayer",
    title: "[Demo] A Life of Prayer",
    speakerName: "Jordan Hale (Demo)",
    daysBeforeD0: 28,
    category: "Prayer",
    summary: "Habits of prayer for households and teams. Demo-only summary.",
    imageUrl: MEDIA.sermon3,
  },
]);

const ANNOUNCEMENTS = Object.freeze([
  {
    demoKey: "announcement:general",
    title: "[Demo] General Welcome This Week",
    body: "Fictional general announcement for member portal smoke tests.",
    audiences: ["members"],
  },
  {
    demoKey: "announcement:prayer",
    title: "[Demo] Prayer Focus",
    body: "This week we are praying for visitors and volunteers (demo prayer note).",
    audiences: ["members"],
  },
  {
    demoKey: "announcement:event",
    title: "[Demo] Event Reminder: Community Meal",
    body: "Reminder: join the fictional community meal listed on the public Events page.",
    audiences: ["members"],
  },
]);

const GIVING = Object.freeze({
  introHeading: "Give with clarity [Demo]",
  introBody:
    "BlessBoard does not process payments on this page. The instructions below are fictional testing copy only.",
  method: {
    demoKey: "giving:bank-info",
    methodType: "bank_transfer",
    label: "[Demo] Bank transfer instructions",
    instructions:
      "TEST ONLY — Do not send money. Account name: DEMO TESTING CONGREGATION. Account: DEMO-00-0000. Reference: YOUR NAME. This is not a real bank account.",
  },
});

const CONTACT = Object.freeze({
  introHeading: "We would love to connect [Demo]",
  introBody:
    "Reach the fictional office using the channels below. No real phone numbers or inboxes are monitored.",
  officeHoursHeading: "Office hours",
  officeHoursBody: HQ_CONTACT.officeHours,
  channels: [
    {
      demoKey: "contact:email",
      channelType: "email",
      label: "Office email (Demo)",
      value: HQ_CONTACT.email,
      sortOrder: 10,
    },
    {
      demoKey: "contact:phone",
      channelType: "phone",
      label: "Office phone (Demo)",
      value: HQ_CONTACT.phone,
      sortOrder: 20,
    },
    {
      demoKey: "contact:facebook",
      channelType: "facebook",
      label: "Facebook (Demo placeholder)",
      value: "https://example.test/demo-church-facebook",
      sortOrder: 30,
    },
    {
      demoKey: "contact:instagram",
      channelType: "instagram",
      label: "Instagram (Demo placeholder)",
      value: "https://example.test/demo-church-instagram",
      sortOrder: 40,
    },
    {
      demoKey: "contact:youtube",
      channelType: "youtube",
      label: "YouTube (Demo placeholder)",
      value: "https://example.test/demo-church-youtube",
      sortOrder: 50,
    },
  ],
});

const PAGE_TITLES = Object.freeze({
  home: `${DEFAULT_DISPLAY_NAME} — Home`,
  about: `About — ${DEMO_TAG}`,
  leadership: `Leadership — ${DEMO_TAG}`,
  ministries: `Ministries — ${DEMO_TAG}`,
  events: `Events — ${DEMO_TAG}`,
  sermons: `Sermons — ${DEMO_TAG}`,
  contact: `Contact — ${DEMO_TAG}`,
  giving: `Giving — ${DEMO_TAG}`,
});

const FORBIDDEN_FINANCIAL_PATTERNS = Object.freeze([
  /\b\d{8,17}\b/, // long numeric account-like strings that are not DEMO-
  /\bIBAN\b/i,
  /\bSWIFT\b/i,
  /\brouting\s*#?\s*\d{9}\b/i,
]);

function isDemoMarkedText(text) {
  return String(text || "").includes(DEMO_TAG);
}

function isDemoMetadata(meta) {
  return Boolean(
    meta &&
      typeof meta === "object" &&
      meta.bb_demo === true &&
      String(meta.bb_demo_tool || "") === DEMO_TOOL
  );
}

function demoLayoutMetadata(demoKey, extra) {
  return {
    bb_demo: true,
    bb_demo_tool: DEMO_TOOL,
    bb_demo_key: String(demoKey || ""),
    ...(extra && typeof extra === "object" ? extra : {}),
  };
}

function sermonSummaryWithCategory(sermon) {
  return `Category: ${sermon.category}. ${sermon.summary}`;
}

/**
 * @param {Date} [d0]
 */
function relativeDates(d0) {
  const base = d0 instanceof Date && !Number.isNaN(d0.getTime()) ? new Date(d0) : new Date();
  const utcDay = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());

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
      summary: sermonSummaryWithCategory(s),
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

function assertNoRealFinancialDetails(text) {
  const s = String(text || "");
  if (/DEMO-00-0000/.test(s)) return true;
  for (const re of FORBIDDEN_FINANCIAL_PATTERNS) {
    if (re.test(s) && !/DEMO-/i.test(s)) return false;
  }
  if (/\b(?:visa|mastercard|amex)\b/i.test(s)) return false;
  return true;
}

module.exports = {
  DEMO_TAG,
  DEMO_TOOL,
  DEMO_REFERENCE_PREFIX,
  DEFAULT_ORGANIZATION_KEY,
  DEFAULT_CHURCH_KEY,
  DEFAULT_DISPLAY_NAME,
  DEFAULT_ACTOR_EMAIL,
  MEDIA,
  IDENTITY,
  HERO,
  HOME_ANNOUNCEMENT,
  SERVICE_TIMES,
  HQ_CONTACT,
  ABOUT_SECTIONS,
  LEADERS,
  MINISTRIES,
  EVENTS,
  SERMONS,
  ANNOUNCEMENTS,
  GIVING,
  CONTACT,
  PAGE_TITLES,
  FORBIDDEN_FINANCIAL_PATTERNS,
  isDemoMarkedText,
  isDemoMetadata,
  demoLayoutMetadata,
  sermonSummaryWithCategory,
  relativeDates,
  assertNoRealFinancialDetails,
};
