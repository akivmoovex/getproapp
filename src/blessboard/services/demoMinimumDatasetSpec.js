"use strict";

/**
 * Deterministic BlessBoard V5 minimum demo content specification.
 * Titles/names include [Demo] for conflict detection and cleanup identification.
 * No passwords, no real PII, no legacy public.church_* rows.
 */

const DEMO_TAG = "[Demo]";
const DEMO_TOOL = "demo:v5";
const SECTION_KEY = "demo_body";
const DEMO_REFERENCE_PREFIX = "bb-demo-v5:";

/** @type {ReadonlyArray<{ pageKey: string, title: string, sectionHeading: string, sectionBody: string }>} */
const PAGES = Object.freeze([
  {
    pageKey: "home",
    title: "Welcome — [Demo] Testing Congregation",
    sectionHeading: "Welcome",
    sectionBody: "This is a [Demo] testing congregation homepage for BlessBoard V5 smoke checks.",
  },
  {
    pageKey: "about",
    title: "About — [Demo]",
    sectionHeading: "About us",
    sectionBody:
      "We are a fictional testing congregation used only for product demos. No real ministry claims.",
  },
  {
    pageKey: "leadership",
    title: "Leadership — [Demo]",
    sectionHeading: "Leadership",
    sectionBody: "Meet our [Demo] leadership listing used for V5 smoke tests.",
  },
  {
    pageKey: "ministries",
    title: "Ministries — [Demo]",
    sectionHeading: "Ministries",
    sectionBody: "Published [Demo] ministries appear for member and public smoke paths.",
  },
  {
    pageKey: "events",
    title: "Events — [Demo]",
    sectionHeading: "Events",
    sectionBody: "Upcoming [Demo] events for public and member lists.",
  },
  {
    pageKey: "sermons",
    title: "Sermons — [Demo]",
    sectionHeading: "Sermons",
    sectionBody: "Recent [Demo] sermon listing for public smoke.",
  },
  {
    pageKey: "contact",
    title: "Contact — [Demo]",
    sectionHeading: "Contact",
    sectionBody: "Use the [Demo] contact channel below. No real phone numbers.",
  },
  {
    pageKey: "giving",
    title: "Giving — [Demo]",
    sectionHeading: "Giving",
    sectionBody: "Instructional [Demo] giving information only — no live payment processor.",
  },
]);

const LEADER = Object.freeze({
  displayName: "Alex Rivera (Demo)",
  roleTitle: "Pastor (Demo)",
  biography: "Fictional [Demo] leader for BlessBoard V5 testing.",
});

const MINISTRY = Object.freeze({
  name: "[Demo] Welcome Team",
  summary: "Greets visitors during [Demo] testing services.",
  joinPolicy: "request",
});

const EVENT = Object.freeze({
  title: "[Demo] Midweek Gathering",
  summary: "Small fictional midweek gathering for V5 smoke.",
  timezone: "UTC",
  daysFromD0: 3,
  hourUtc: 18,
});

const SERMON = Object.freeze({
  title: "[Demo] Introduction",
  speakerName: "Alex Rivera (Demo)",
  summary: "Short fictional introduction message for demos.",
  daysBeforeD0: 7,
});

const CONTACT_CHANNEL = Object.freeze({
  channelType: "email",
  label: "General (Demo)",
  value: "demo.contact@example.test",
});

const GIVING_METHOD = Object.freeze({
  methodType: "bank_transfer",
  label: "[Demo] Bank transfer info",
  instructions: "Fictional instructional text only. Account DEMO-00-0000 — not a real bank.",
});

const ANNOUNCEMENT = Object.freeze({
  title: "[Demo] This week",
  body: "Short [Demo] announcement for member portal smoke. Fictional testing content.",
  audiences: ["members"],
});

const RESOURCE = Object.freeze({
  title: "[Demo] Welcome leaflet",
  description: "Fictional [Demo] resource for member portal smoke.",
  audience: "members",
});

const FORM = Object.freeze({
  title: "[Demo] Feedback",
  description: "One-field [Demo] feedback form for smoke tests.",
  schema: {
    version: 1,
    fields: [{ key: "notes", type: "text", label: "Notes", required: false }],
  },
});

const ATTENDANCE = Object.freeze({
  title: "[Demo] Sunday service",
  eventType: "sunday_service",
  daysBeforeD0: 1,
  category: "adults",
  count: 8,
});

const GIVING_ENTRY = Object.freeze({
  categoryKey: "offerings",
  amount: "12.50",
  currency: "USD",
  daysBeforeD0: 2,
  reference: `${DEMO_REFERENCE_PREFIX}giving-entry`,
  notes: "[Demo] cash count — fictional",
});

function isDemoMarkedText(text) {
  return String(text || "").includes(DEMO_TAG);
}

function isDemoMetadata(meta) {
  return Boolean(meta && typeof meta === "object" && meta.bb_demo === true);
}

function demoLayoutMetadata(demoKey) {
  return {
    bb_demo: true,
    bb_demo_tool: DEMO_TOOL,
    bb_demo_key: String(demoKey || ""),
  };
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

  const eventStart = addDays(EVENT.daysFromD0);
  eventStart.setUTCHours(EVENT.hourUtc, 0, 0, 0);

  const sermonDate = addDays(-SERMON.daysBeforeD0);
  const attendanceDate = addDays(-ATTENDANCE.daysBeforeD0);
  const givingDate = addDays(-GIVING_ENTRY.daysBeforeD0);

  return {
    d0: new Date(utcDay),
    eventStartsAt: eventStart.toISOString(),
    sermonPreachedAt: sermonDate.toISOString().slice(0, 10),
    attendanceEventDate: attendanceDate.toISOString().slice(0, 10),
    givingDate: givingDate.toISOString().slice(0, 10),
  };
}

module.exports = {
  DEMO_TAG,
  DEMO_TOOL,
  SECTION_KEY,
  DEMO_REFERENCE_PREFIX,
  PAGES,
  LEADER,
  MINISTRY,
  EVENT,
  SERMON,
  CONTACT_CHANNEL,
  GIVING_METHOD,
  ANNOUNCEMENT,
  RESOURCE,
  FORM,
  ATTENDANCE,
  GIVING_ENTRY,
  isDemoMarkedText,
  isDemoMetadata,
  demoLayoutMetadata,
  relativeDates,
};
