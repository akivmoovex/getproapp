
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const ejs = require("ejs");
const registrationQueue = require("../src/blessboard/services/registrationQueuePresentation");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs/phase5/screenshots");
const PARTIALS = path.join(ROOT, "views/blessboard/v5/partials");
const CSS = fs.readFileSync(path.join(ROOT, "public/blessboard/v5/platform-admin.css"), "utf8");
const WIDTHS = [390, 1440];

function wrap(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>${CSS}</style></head><body class="bb-pa-body"><main class="bb-pa-page">${body}</main></body></html>`;
}

async function shot(name, html) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1100 });
    await page.setContent(html, { waitUntil: "load" });
    const file = `phase5-${name}-${width}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log(file);
  }
  await browser.close();
}

(async () => {
  const approved = ejs.render(fs.readFileSync(path.join(PARTIALS, "pa-registration-approved-success.ejs"), "utf8"), {
    org: { organizationKey: "grace-community", displayName: "Grace Community Chapel", organizationStatus: "active", planLabel: "Foundation", firstBranchName: "Main Branch" },
    branches: [{ displayName: "Main Branch", isPrimary: true }],
    notice: "organization_provisioned",
    inviteOnceLink: "https://blessboard.org/invite/accept?token=demo",
    pendingInvitations: [{ emailDisplay: "pat@example.com", displayName: "Pat Applicant", roleKey: "church_hq_admin" }],
    onboardingSummary: { publicWebsitePath: "/c/grace-community", publicWebsiteAvailable: true },
    statusChip: () => "bb-pa-chip--ok",
    statusLabel: (s) => s || "active",
  }, { filename: path.join(PARTIALS, "pa-registration-approved-success.ejs") });
  await shot("11-church-approved", wrap(approved));

  const needs = ejs.render(fs.readFileSync(path.join(PARTIALS, "pa-registration-needs-information.ejs"), "utf8"), {
    app: { churchName: "Grace Community Chapel", contactName: "Pat", applicationStatus: "submitted", followUpStatus: "awaiting_customer", rejectActionsAvailable: true },
    phase5Status: { key: "needs_information", label: "Needs Information", chipClass: "bb-pa-chip--warn" },
    needsInformationState: { hasRequest: true, waiting: true, reasonLabels: ["Proof of registration"], messageSummary: "Please send documents", requestedAt: "2026-07-25T10:00:00.000Z" },
    phoneDisplay: "+260971000001",
    emailDisplay: "pat@example.com",
    appIdEnc: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    canPhase5Approve: false,
    decisionApproveHref: "#",
    decisionRejectHref: "#",
    registrationQueue,
  }, { filename: path.join(PARTIALS, "pa-registration-needs-information.ejs") });
  await shot("16-needs-information", wrap(needs));
})();
