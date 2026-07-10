/**
 * BlessBoard Stitch visual screenshots by batch.
 * Usage:
 *   node scripts/screenshot-blessboard-all-screens.js
 *   node scripts/screenshot-blessboard-all-screens.js --batch=A
 *   node scripts/screenshot-blessboard-all-screens.js --batch=B
 *   node scripts/screenshot-blessboard-all-screens.js --batch=C
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const session = require("express-session");
const { chromium } = require("playwright");

const churchRoutes = require("../src/routes/church");
const { AGE_GROUP_OPTIONS } = require("../src/church/memberRegistration");
const {
  REQUEST_TYPES,
  PRAYER_PRIVACY_LEVELS,
  PRAYER_URGENCY_LEVELS,
  requestStatusLabel,
} = require("../src/church/memberPortalValidation");
const {
  joinRequestStatusLabel,
  memberRelationshipStatusLabel,
} = require("../src/church/ministryJoinRequestValidation");
const { formatDutyDate } = require("../src/church/dutyRosterValidation");

const PORT = 4185;
const ROOT = path.join(__dirname, "../test-results/blessboard-stitch-visual");

const BATCHES = {
  A: {
    outDir: "public-giving",
    pages: [{ path: "/giving", name: "giving" }],
  },
  B: {
    outDir: "auth",
    pages: [
      { path: "/login", name: "login" },
      { path: "/register", name: "register" },
      { path: "/registration-submitted", name: "registration-submitted" },
      { path: "/forgot-password", name: "forgot-password" },
      {
        path: "/waiting-verification",
        name: "waiting-verification",
        pendingMemberSession: true,
      },
    ],
  },
  C: {
    outDir: "member",
    pages: [
      { path: "/member/dashboard", name: "dashboard", verifiedMemberSession: true, fixture: "dashboard" },
      { path: "/member/profile", name: "profile", verifiedMemberSession: true, fixture: "profile" },
      { path: "/member/announcements", name: "announcements", verifiedMemberSession: true, fixture: "announcements" },
      { path: "/member/events", name: "events", verifiedMemberSession: true, fixture: "events" },
      { path: "/member/my-ministries", name: "ministries", verifiedMemberSession: true, fixture: "my_ministries" },
      { path: "/member/resources", name: "resources", verifiedMemberSession: true, fixture: "resources" },
      { path: "/member/forms", name: "forms", verifiedMemberSession: true, fixture: "forms" },
      { path: "/member/requests/new", name: "requests-new", verifiedMemberSession: true, fixture: "request_new" },
      { path: "/member/requests", name: "requests-status", verifiedMemberSession: true, fixture: "requests" },
      { path: "/member/prayer-request", name: "prayer", verifiedMemberSession: true, fixture: "prayer_request" },
      { path: "/member/giving", name: "giving", verifiedMemberSession: true, fixture: "giving" },
    ],
  },
};

function memberFixtureLocals(fixtureKey) {
  const churchName = "Kafue Baptist Church";
  const memberName = "Mary Phiri";
  const base = {
    churchName,
    pageTitle: churchName,
    organization: { id: 1, name: churchName, status: "active" },
    branch: { id: 1, name: churchName, status: "active", host_slug: "demo" },
    member: {
      member_id: 9002,
      organization_id: 1,
      branch_id: 1,
      status: "verified",
      full_name: memberName,
    },
    memberName,
    memberInitials: "MP",
    memberAvatarUrl: "/church/images/member/avatar-member.jpg",
    notice: null,
    error: null,
  };

  const events = [
    {
      title: "Sunday Worship Celebration",
      description: "Join us for a powerful morning of worship.",
      event_date: new Date().toISOString(),
      start_time: "09:00",
      location: "Main Sanctuary",
    },
    {
      title: "Mid-week Bible Study",
      description: "Grow together in the Word.",
      event_date: new Date(Date.now() + 2 * 86400000).toISOString(),
      start_time: "18:30",
      location: "Room 204",
    },
    {
      title: "Youth Outreach Night",
      description: "Community outreach for youth.",
      event_date: new Date(Date.now() + 4 * 86400000).toISOString(),
      start_time: "19:00",
      location: "Community Hall",
    },
  ];

  const announcements = [
    {
      title: "Applications open for Kenya 2025",
      body: "Be part of our international outreach team this summer.",
      category: "Mission Trip",
      source: "branch",
      publish_at: new Date().toISOString(),
    },
    {
      title: "Parking Lot Renovation",
      body: "East entrance will be closed this coming Wednesday.",
      category: "Building Update",
      source: "hq",
      publish_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      title: "Choir Rehearsal Reminder",
      body: "Saturday rehearsal starts at 15:00 in the sanctuary.",
      category: "Worship",
      source: "branch",
      publish_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  ];

  const ministries = [
    {
      id: 1,
      name: "Children's Ministry",
      description: "Helping kids grow in faith through fun activities.",
      member_relationship_label: "Volunteer",
      leader_name: "Sarah Banda",
      meeting_schedule: "Sundays 09:00",
    },
    {
      id: 2,
      name: "Worship Team",
      description: "Lifting spirits through choir and instrumental music.",
      member_relationship_label: "Member",
      leader_name: "David Mwale",
      meeting_schedule: "Saturdays 15:00",
    },
  ];

  const map = {
    dashboard: {
      ...base,
      navActive: "dashboard",
      shellTitle: "Member Dashboard",
      announcements,
      events,
      myMinistries: ministries,
      memberRelationshipStatusLabel,
      ministryInterest: "Worship",
      upcomingDuties: [],
      formatDutyDate,
    },
    profile: {
      ...base,
      navActive: "profile",
      shellTitle: "Member Profile",
      profile: {
        full_name: memberName,
        email: "mary.phiri@example.com",
        phone: "0977123456",
        gender: "female",
        age_group: "Adult (36-60)",
        address_area: "Kafue Central",
        ministry_interest: "Worship",
        emergency_contact_name: "John Phiri",
        emergency_contact_phone: "0977000000",
      },
      ageGroupOptions: AGE_GROUP_OPTIONS,
      ministryInterestOptions: [],
    },
    announcements: {
      ...base,
      navActive: "announcements",
      shellTitle: "Announcements",
      announcements,
    },
    events: {
      ...base,
      navActive: "events",
      shellTitle: "Events",
      events,
    },
    my_ministries: {
      ...base,
      navActive: "ministries",
      shellTitle: "My Ministries",
      activeMinistries: ministries,
      pendingRequests: [],
      closedRequests: [],
      interestMatches: [],
      ministryInterest: "Worship",
      joinRequestStatusLabel,
      memberRelationshipStatusLabel,
    },
    resources: {
      ...base,
      navActive: "resources",
      shellTitle: "Resource Library",
      resources: [
        { title: "Psalm 23 Study Notes", meta: "Study Guide", icon: "menu_book", file_url: "#" },
        { title: "Sunday Sermon Recap", meta: "Sermon Notes", icon: "mic", external_url: "#" },
        { title: "Family Devotional", meta: "Audio", icon: "headphones" },
      ],
    },
    forms: {
      ...base,
      navActive: "forms",
      shellTitle: "Forms & Documents",
      formItems: [
        { title: "Membership Form", meta: "Online Form", icon: "description" },
        { title: "Baptism Application", meta: "PDF Download", icon: "picture_as_pdf", file_url: "#" },
        { title: "Volunteer Application", meta: "Online Form", icon: "assignment" },
      ],
    },
    request_new: {
      ...base,
      navActive: "requests",
      shellTitle: "Requests",
      requestTypes: REQUEST_TYPES,
      form: {},
    },
    requests: {
      ...base,
      navActive: "requests",
      shellTitle: "Requests",
      requests: [
        {
          id: 1,
          subject: "Baptism enquiry",
          request_type: "Baptism",
          status: "submitted",
          created_at: new Date().toISOString(),
        },
      ],
      requestStatusLabel,
    },
    prayer_request: {
      ...base,
      navActive: "requests",
      shellTitle: "Requests",
      privacyLevels: PRAYER_PRIVACY_LEVELS,
      urgencyLevels: PRAYER_URGENCY_LEVELS,
      form: {},
    },
    giving: {
      ...base,
      navActive: "giving",
      shellTitle: "Giving Information",
      givingDisplay: {
        hasPublishedSettings: false,
      },
    },
  };

  return map[fixtureKey] || base;
}

function makeBranchApp(options = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.use(
    session({
      secret: "screenshot-blessboard-auth",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = options.churchContext || {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Kafue Baptist Church", status: "active" },
      branch: {
        id: 1,
        name: "Kafue Baptist Church",
        status: "active",
        host_slug: "demo",
        contact_phone: "+260 211 456 7890",
        contact_email: "info@kafuebaptist.org",
        location_text: "Plot 452, Main Street, Kafue, Zambia",
      },
    };
    if (options.pendingMemberSession) {
      req.session.churchMember = {
        member_id: 9001,
        organization_id: 1,
        branch_id: 1,
        status: "pending",
        full_name: "Demo Pending Member",
      };
    }
    if (options.verifiedMemberSession && options.memberSession) {
      req.session.churchMember = options.memberSession;
    }
    next();
  });

  if (options.useFixtures) {
    app.get("/__fixture/:key", (req, res) => {
      const key = req.params.key;
      const viewMap = {
        dashboard: "church/member/dashboard",
        profile: "church/member/profile",
        announcements: "church/member/announcements",
        events: "church/member/events",
        my_ministries: "church/member/my_ministries",
        resources: "church/member/resources",
        forms: "church/member/forms",
        request_new: "church/member/request_new",
        requests: "church/member/requests",
        prayer_request: "church/member/prayer_request",
        giving: "church/member/giving",
      };
      const view = viewMap[key];
      if (!view) return res.status(404).send("unknown fixture");
      return res.render(view, memberFixtureLocals(key));
    });
  }

  app.use(churchRoutes());
  return app;
}

async function shot(page, url, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, fullPage: true });
  console.log("Wrote", file);
}

async function ensureScreenshotMember() {
  const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
  if (!isPgConfigured()) return null;

  const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
  const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
  const branchesRepo = require("../src/db/pg/church/branchesRepo");
  const membersRepo = require("../src/db/pg/church/membersRepo");
  const { ensureCanonicalTenantsForTests } = require("../tests/helpers/pgTestSeed");
  const { TENANT_ZM } = require("../src/tenants/tenantIds");
  const bcrypt = require("bcryptjs");

  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);

  const slug = "demo-screenshot-member";
  let org = await organizationsRepo.findOrganizationBySlug(pool, slug);
  if (!org) {
    org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug,
      name: "Kafue Baptist Church",
    });
  }

  let branch = await branchesRepo.findBranchBySlug(pool, org.id, "main");
  if (!branch) {
    branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: "Kafue Baptist Church",
      host_slug: "demo",
    });
  }

  const email = "screenshot.member@example.com";
  let member = await membersRepo.findMemberByEmailOrPhoneForBranch(pool, branch.id, email);
  if (!member) {
    const passwordHash = await bcrypt.hash("testpass123456", 12);
    member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email,
      phone: "0977123456",
      full_name: "Mary Phiri",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "1-3 years",
    });
  }
  if (member.status !== "verified") {
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");
    member = await membersRepo.findMemberByIdForBranch(pool, member.id, branch.id);
  }

  return {
    churchContext: {
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    },
    memberSession: {
      member_id: member.id,
      organization_id: org.id,
      branch_id: branch.id,
      status: "verified",
      full_name: "Mary Phiri",
    },
  };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--batch="));
  const batchKey = arg ? arg.split("=")[1].toUpperCase() : "A";
  const batch = BATCHES[batchKey];
  if (!batch) {
    console.error("Unknown batch. Use A, B, or C.");
    process.exit(1);
  }

  const outDir = path.join(ROOT, batch.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  let memberSeed = null;
  let useFixtures = false;
  if (batchKey === "C") {
    try {
      memberSeed = await ensureScreenshotMember();
      if (!memberSeed) {
        useFixtures = true;
        console.warn("PG not configured — capturing Batch C via fixture renders with demo content.");
        fs.writeFileSync(
          path.join(outDir, "README.txt"),
          "Captured via EJS fixture renders because Postgres was not configured.\nRe-run with PG configured for live DB-backed screenshots.\n"
        );
      }
    } catch (err) {
      console.error("Could not seed screenshot member:", err);
      process.exit(1);
    }
  }

  const browser = await chromium.launch();
  let port = PORT;

  try {
    for (const item of batch.pages) {
      const app = makeBranchApp({
        pendingMemberSession: !!item.pendingMemberSession,
        verifiedMemberSession: !!item.verifiedMemberSession,
        churchContext: memberSeed ? memberSeed.churchContext : undefined,
        memberSession: memberSeed ? memberSeed.memberSession : undefined,
        useFixtures,
      });
      const server = http.createServer(app);
      await new Promise((r) => server.listen(port, "127.0.0.1", r));
      const page = await browser.newPage();
      const base = `http://127.0.0.1:${port}`;
      const urlPath = useFixtures && item.fixture ? `/__fixture/${item.fixture}` : item.path;
      try {
        await shot(page, `${base}${urlPath}`, 390, 844, path.join(outDir, `${item.name}-mobile.png`));
        await shot(page, `${base}${urlPath}`, 1440, 900, path.join(outDir, `${item.name}-desktop.png`));
      } catch (err) {
        console.error(`Failed ${item.name}:`, err.message);
        fs.writeFileSync(
          path.join(outDir, `${item.name}-ERROR.txt`),
          `${urlPath}\n${err.stack || err.message}\n`
        );
      } finally {
        await page.close();
        await new Promise((r) => server.close(r));
        port += 1;
      }
    }
  } finally {
    await browser.close();
  }
  console.log("Screenshots in", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
