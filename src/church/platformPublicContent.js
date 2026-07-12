"use strict";

const { churchPublicUrl } = require("./platformProvisioningValidation");

/** Public demo tenant — seeded idempotently; safe to link without credentials. */
const BLESSBOARD_DEMO_HOST_SLUG = "demo";
const BLESSBOARD_DEMO_PUBLIC_URL = churchPublicUrl(BLESSBOARD_DEMO_HOST_SLUG, "/");

/** Public pages visitors may explore on the demo church site (no sign-in). */
const BLESSBOARD_DEMO_PUBLIC_PAGES = [
  {
    id: "homepage",
    label: "Public homepage",
    path: "/",
    description: "Welcome message, service times, and entry points for visitors.",
  },
  {
    id: "leadership",
    label: "Leadership",
    path: "/leadership",
    description: "Sample leadership and pastoral information published by the demo church.",
  },
  {
    id: "ministries",
    label: "Ministries",
    path: "/ministries",
    description: "How ministries are listed on a branch public site.",
  },
  {
    id: "events",
    label: "Events",
    path: "/events",
    description: "Published events open to visitors.",
  },
  {
    id: "sermons",
    label: "Sermons",
    path: "/sermons",
    description: "Published sermons and teaching resources on the public site.",
  },
];

function buildDemoExploreLinks() {
  return BLESSBOARD_DEMO_PUBLIC_PAGES.map((page) => ({
    ...page,
    href: churchPublicUrl(BLESSBOARD_DEMO_HOST_SLUG, page.path),
  })).filter((page) => page.href);
}

/** Apex path for church onboarding interest (not member self-registration). */
const BLESSBOARD_REGISTER_CHURCH_PATH = "/register-church";

/** Approved launch-market positioning — not Zambia-only. */
const BLESSBOARD_ZAMBIA_LAUNCH_POSITIONING =
  "BlessBoard is being developed and introduced with churches in Zambia, with a platform designed to support church communities across multiple locations and countries.";

/** Approved onboarding wording — contact-led; no free-plan claims. */
const BLESSBOARD_ONBOARDING_POSITIONING =
  "BlessBoard is currently onboarding selected churches. Plans and available services may vary according to church size, branch structure and setup requirements. Contact the BlessBoard team to discuss access.";

module.exports = {
  BLESSBOARD_DEMO_HOST_SLUG,
  BLESSBOARD_DEMO_PUBLIC_URL,
  BLESSBOARD_DEMO_PUBLIC_PAGES,
  buildDemoExploreLinks,
  BLESSBOARD_REGISTER_CHURCH_PATH,
  BLESSBOARD_ZAMBIA_LAUNCH_POSITIONING,
  BLESSBOARD_ONBOARDING_POSITIONING,
};
