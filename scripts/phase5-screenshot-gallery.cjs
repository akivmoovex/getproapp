/**
 * Phase 5 local rendered screenshot gallery (fixture HTML + Playwright).
 * Does not hit live blessboard.org. Evidence: docs/phase5/screenshots/
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const ejs = require("ejs");

const registrationQueue = require("../src/blessboard/services/registrationQueuePresentation");
const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs/phase5/screenshots");
const VIEWS = path.join(ROOT, "views/blessboard/v5");
const PARTIALS = path.join(VIEWS, "partials");
const CSS = fs.readFileSync(path.join(ROOT, "public/blessboard/v5/platform-admin.css"), "utf8");

const WIDTHS = [320, 375, 390, 768, 1024, 1280, 1440];

function render(rel, locals) {
  const view = path.join(VIEWS, rel);
  let source = fs.readFileSync(view, "utf8");
  source = source
    .replace(
      "<%- include('../partials/platform-admin-shell-start') %>",
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Phase5 shot</title><style>${CSS}</style></head><body class="bb-pa-body"><main class="bb-pa-page">`
    )
    .replace(
      "<%- include('../partials/platform-admin-shell-end') %>",
      `</main></body></html>`
    );
  return ejs.render(
    source,
    {
      registrationQueue,
      registrationStatus,
      csrfField: "_csrf",
      csrfToken: "shot",
      notice: null,
      error: null,
      ...locals,
    },
    { filename: view, root: PARTIALS, views: [PARTIALS] }
  );
}

const APP = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  churchName: "Grace Community Chapel With Extremely Long Overflow Name",
  contactName: "Pat Applicant Long Name",
  contactEmail: "very.long.email.for.overflow.testing@example.org",
  contactPhoneNormalized: "+260971000001",
  selectedPlan: "foundation",
  selectedPlanLabel: "Foundation",
  applicationStatus: "submitted",
  provisioningStatus: "not_started",
  followUpStatus: "new",
  riskReviewActionsAvailable: true,
  rejectActionsAvailable: true,
  city: "Kafue",
  country: "Zambia",
  branchName: "Main Branch",
  reviewNotes: "Long reviewer notes ".repeat(12),
};

const fixtures = [
  {
    id: "01-church-registrations",
    file: "platform-admin/registration-applications.ejs",
    locals: {
      applications: [
        {
          ...APP,
          id: APP.id,
          operatorQueue: "needs_review",
          createdAt: "2026-07-20T10:00:00.000Z",
        },
      ],
      filters: {},
      queueFilters: [
        { key: "", label: "All" },
        { key: "needs_review", label: "Needs review" },
      ],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
      rangeFrom: 1,
      rangeTo: 1,
      allowedLimits: [25],
      allowedPlans: ["foundation", "growth", "network"],
      applicationStatuses: [],
      provisioningStatuses: [],
      followUpStatuses: [],
      linkedFilters: ["all"],
      listError: false,
      visibleStatus: "",
    },
  },
  {
    id: "02-church-registrations-empty",
    file: "platform-admin/registration-applications.ejs",
    locals: {
      applications: [],
      filters: {},
      queueFilters: [{ key: "", label: "All" }],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 0,
      rangeFrom: 0,
      rangeTo: 0,
      allowedLimits: [25],
      allowedPlans: ["foundation"],
      applicationStatuses: [],
      provisioningStatuses: [],
      followUpStatuses: [],
      linkedFilters: ["all"],
      listError: false,
      visibleStatus: "",
    },
  },
  {
    id: "08-approve-confirmation",
    file: "platform-admin/registration-application-approve-confirm.ejs",
    locals: {
      application: APP,
      duplicateWarning: { show: false },
      suggestedOrganizationKey:
        registrationQueue.presentSuggestedOrganizationKeyPreview(APP.churchName),
    },
  },
  {
    id: "10-approval-processing",
    file: "platform-admin/registration-application-approve-confirm.ejs",
    locals: {
      application: APP,
      duplicateWarning: { show: false },
      suggestedOrganizationKey:
        registrationQueue.presentSuggestedOrganizationKeyPreview(APP.churchName),
    },
    afterLoad: async (page) => {
      await page.evaluate(() => {
        const p = document.querySelector('[data-bb-pa-reg-approve-processing="1"]');
        if (p) {
          p.hidden = false;
          p.setAttribute("aria-hidden", "false");
          document.documentElement.classList.add("bb-pa-reg-approve-processing-active");
        }
      });
    },
  },
  {
    id: "13-request-information",
    file: "platform-admin/registration-application-request-information.ejs",
    locals: {
      application: APP,
      infoRequestReasons: registrationQueue.PHASE5_INFO_REQUEST_REASONS,
      duplicateWarning: { show: false },
    },
  },
  {
    id: "15-information-requested",
    file: "platform-admin/registration-application-information-requested.ejs",
    locals: {
      application: { ...APP, followUpStatus: "awaiting_customer" },
      needsInformationState: {
        hasRequest: true,
        waiting: true,
        reasonLabels: ["Proof of church registration"],
        messageSummary: "Please provide documents. ".repeat(8),
        requestedAt: "2026-07-25T10:00:00.000Z",
        recipient: APP.contactEmail,
        latestEvent: { actor_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        delivery: { key: "recorded", label: "Information request recorded" },
      },
      deliverySummary: { key: "recorded", label: "Information request recorded" },
    },
  },
  {
    id: "18-reject-confirmation",
    file: "platform-admin/registration-application-reject.ejs",
    locals: {
      application: APP,
      rejectReasons: registrationQueue.PHASE5_REJECT_REASONS,
      rejectBlocked: false,
      duplicateWarning: { show: false },
    },
  },
  {
    id: "20-rejected-result",
    file: "platform-admin/registration-application-rejected.ejs",
    locals: {
      application: { ...APP, applicationStatus: "rejected" },
      rejectionSummary: {
        category: "incomplete_application",
        categoryLabel: "Incomplete application",
        canReopen: true,
        rejectedAt: "2026-07-25T12:00:00.000Z",
        actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        deliveryKey: "recorded",
        deliveryLabel: "Rejection recorded",
        applicantMessage: "Long rejection reason for overflow testing. ".repeat(10),
        internalNote: "Internal note overflow. ".repeat(8),
      },
      duplicateWarning: { show: false },
    },
  },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const report = [];

  for (const fixture of fixtures) {
    const html = render(fixture.file, fixture.locals);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width <= 430 ? 844 : 1100 });
      await page.setContent(html, { waitUntil: "load" });
      if (fixture.afterLoad) await fixture.afterLoad(page);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          overflow: doc.scrollWidth > doc.clientWidth + 2,
        };
      });
      const file = `phase5-${fixture.id}-${width}.png`;
      await page.screenshot({
        path: path.join(OUT, file),
        fullPage: true,
      });
      report.push({ file, width, overflow: overflow.overflow, scrollWidth: overflow.scrollWidth });
      console.log(file, overflow.overflow ? "OVERFLOW" : "ok");
    }
  }

  fs.writeFileSync(path.join(OUT, "responsive-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  const bad = report.filter((r) => r.overflow);
  console.log("screenshots", report.length, "overflow", bad.length);
  if (bad.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
