"use strict";

/**
 * Confirmed FAQ entries for blessboard.com (apex public).
 * Answers must reflect implemented product behavior only.
 */
const PLATFORM_FAQ_ITEMS = [
  {
    id: "what-is-blessboard",
    question: "What is BlessBoard?",
    answer:
      "BlessBoard is a church engagement platform. Each participating congregation can have a public branch website, a member portal, and administration tools for branch and HQ leaders — connected on one platform.",
  },
  {
    id: "who-can-use",
    question: "Who can use BlessBoard?",
    answer:
      "BlessBoard serves congregations and their branches, registered members, branch and HQ administrators, and BlessBoard platform administrators who provision organizations. Visitors can browse public church pages without signing in.",
  },
  {
    id: "own-website",
    question: "Does each church receive its own website?",
    answer:
      "Yes. Each active branch can have its own public site on a BlessBoard subdomain — for example, yourchurch.blessboard.com — with pages such as about, leadership, ministries, events, sermons, giving information, and contact.",
  },
  {
    id: "multiple-branches",
    question: "Can a church manage multiple branches?",
    answer:
      "Yes on Growth and Network. Foundation includes one HQ and a maximum of one active branch. Growth and Network allow unlimited active branches with HQ tools for branch registry, cross-branch oversight, and advanced attendance and giving reports. Available capacity depends on your organization’s assigned plan.",
  },
  {
    id: "mobile-members",
    question: "Can members use BlessBoard on a phone?",
    answer:
      "Yes. BlessBoard public pages and the member portal are designed to work in a mobile web browser. Members open their church site on a phone the same way they would on a desktop.",
  },
  {
    id: "requires-app",
    question: "Does BlessBoard require an app?",
    answer:
      "No separate BlessBoard mobile app is required. Members and administrators use their church site in a web browser on the device they already have.",
  },
  {
    id: "member-approval",
    question: "Who approves church members?",
    answer:
      "When member registration is enabled on a branch, new registrations are submitted for review. Branch administrators verify and approve members before full portal access is granted.",
  },
  {
    id: "publish-content",
    question: "Can churches publish events, ministries, and sermons?",
    answer:
      "Yes. Branch administrators can publish public events, ministries, and sermons on their branch site when those features are in use for that congregation. What appears on your church site depends on what your team publishes.",
  },
  {
    id: "member-forms",
    question: "Can members submit forms and requests?",
    answer:
      "Yes. Signed-in members can submit forms and requests available in their portal — including prayer and care categories when enabled — according to what that church has configured. Public contact pages show published phone, email, and address details; an online contact message form is not available in the current product.",
  },
  {
    id: "custom-domain",
    question: "Can a church connect its own domain?",
    answer:
      "Branches publish on a BlessBoard subdomain such as yourchurch.blessboard.com. A custom organization domain is available on the Network package through assisted onboarding with manual DNS and TLS setup — BlessBoard does not automate DNS or certificate issuance today.",
  },
  {
    id: "request-access",
    question: "How can a church request access?",
    answer:
      "Submit the Register Your Church form on blessboard.com. BlessBoard platform administrators review requests and coordinate onboarding. Checkout is not available on the public site.",
  },
  {
    id: "login-help",
    question: "How can members get login help?",
    answer:
      "Start at Find a Church on blessboard.com, open your congregation’s site, and use Member Login or Register as a Member. For password help, contact your church administrators or see Support on blessboard.com for step-by-step paths for members and administrators.",
  },
  {
    id: "pricing",
    question: "How does BlessBoard pricing work?",
    answer:
      "BlessBoard offers Foundation (USD 0), Growth (USD 14.99 per active branch/month), and Network (USD 29.99 per active branch/month). HQ is not billed as a branch. Church members are not billed individually. Network adds assisted custom domains and live executive/governance tools; hosted mailboxes, API, webhooks, and integrations remain by arrangement until implemented. Checkout is not available on the public site — currently onboarding selected churches; contact the BlessBoard team to discuss access.",
  },
  {
    id: "who-can-view",
    question: "Who can view church information?",
    answer:
      "Public branch pages — such as about, events, ministries, and sermons — can be viewed by anyone visiting that church site. Member portal content requires a signed-in member account approved by the church. Administration areas require authorized branch, HQ, or platform administrator credentials.",
  },
];

module.exports = {
  PLATFORM_FAQ_ITEMS,
};
