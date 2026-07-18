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
      "BlessBoard is a church engagement platform. Each participating congregation can have a public branch website, a member portal, and administration tools for branch leaders — connected on one platform.",
  },
  {
    id: "who-can-use",
    question: "Who can use BlessBoard?",
    answer:
      "BlessBoard serves congregations and their branches, registered members, ministry leaders, branch and HQ administrators, and BlessBoard platform administrators who provision organizations. Visitors can browse public church pages without signing in.",
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
      "Yes. Organizations with more than one branch can use BlessBoard HQ tools for branch registry, reporting, and organization-level oversight while each branch keeps its own subdomain and admin team. Available capacity depends on your organization’s plan and setup.",
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
      "Yes. Visitors can send messages through a branch public contact form. Signed-in members can submit requests available in their portal — such as prayer requests and ministry join requests — according to what that church has enabled.",
  },
  {
    id: "custom-domain",
    question: "Can a church connect its own domain?",
    answer:
      "Branches publish on a BlessBoard subdomain such as yourchurch.blessboard.com. A custom organization domain is included on the Network package and is provisioned with assisted onboarding — it is not self-service DNS today.",
  },
  {
    id: "request-access",
    question: "How can a church request access?",
    answer:
      "Submit the Register Your Church form on blessboard.com. BlessBoard platform administrators review requests and coordinate onboarding.",
  },
  {
    id: "login-help",
    question: "How can members get login help?",
    answer:
      "Start at Find a Church on blessboard.com, open your congregation’s site, and use Member Login or Register as a Member. For password help, use the forgot-password link on your church site’s login page. See Support on blessboard.com for step-by-step paths for members and administrators.",
  },
  {
    id: "pricing",
    question: "How does BlessBoard pricing work?",
    answer:
      "BlessBoard offers Foundation (USD 0), Growth (USD 14.99 per active branch/month), and Network (USD 29.99 per active branch/month). HQ is not billed as a branch. Church members are not billed individually. Checkout is not available on the public site — onboarding is contact-led.",
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
