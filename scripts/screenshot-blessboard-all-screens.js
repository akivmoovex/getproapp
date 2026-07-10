/**
 * BlessBoard Stitch visual screenshots by batch.
 * Usage:
 *   node scripts/screenshot-blessboard-all-screens.js
 *   node scripts/screenshot-blessboard-all-screens.js --batch=A
 *   node scripts/screenshot-blessboard-all-screens.js --batch=B
 *   node scripts/screenshot-blessboard-all-screens.js --batch=C
 *   node scripts/screenshot-blessboard-all-screens.js --batch=D
 *   node scripts/screenshot-blessboard-all-screens.js --batch=E
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
  D: {
    outDir: "branch-admin",
    pages: [
      { path: "/branch/dashboard", name: "dashboard", branchAdminSession: true, fixture: "ba_dashboard" },
      { path: "/branch/member-verification", name: "member-verification", branchAdminSession: true, fixture: "ba_verification" },
      { path: "/branch/website-editor", name: "website-editor", branchAdminSession: true, fixture: "ba_website" },
      { path: "/branch/events", name: "events", branchAdminSession: true, fixture: "ba_events" },
      { path: "/branch/sermons", name: "sermons", branchAdminSession: true, fixture: "ba_sermons" },
      { path: "/branch/resources", name: "resources", branchAdminSession: true, fixture: "ba_resources" },
      { path: "/branch/contact-submissions", name: "contact-submissions", branchAdminSession: true, fixture: "ba_contact" },
      { path: "/branch/members", name: "members", branchAdminSession: true, fixture: "ba_members" },
      { path: "/branch/reports", name: "reports", branchAdminSession: true, fixture: "ba_reports" },
    ],
  },
  E: {
    outDir: "platform-admin",
    pages: [
      { path: "/admin/login", name: "admin-login", fixture: "pa_login", platformFixture: true },
      { path: "/admin/dashboard", name: "dashboard", fixture: "pa_dashboard", platformFixture: true },
      { path: "/admin/churches", name: "churches-list", fixture: "pa_orgs", platformFixture: true },
      { path: "/admin/churches/new", name: "church-new", fixture: "pa_org_new", platformFixture: true },
      { path: "/admin/churches/1", name: "church-detail", fixture: "pa_org_detail", platformFixture: true },
      { path: "/admin/churches/1/edit", name: "church-edit", fixture: "pa_org_edit", platformFixture: true },
      { path: "/admin/diagnostics", name: "diagnostics", fixture: "pa_diagnostics", platformFixture: true },
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


function branchAdminFixtureLocals(fixtureKey) {
  const churchName = "Kafue Baptist Church";
  const admin = {
    admin_id: 1,
    organization_id: 1,
    branch_id: 1,
    full_name: "Pastor John Banda",
    role: "branch_admin",
    status: "active",
  };
  const base = {
    churchName,
    pageTitle: churchName,
    organization: { id: 1, name: churchName, status: "active" },
    branch: { id: 1, name: churchName, status: "active", host_slug: "demo", member_registration_enabled: true },
    branchAdmin: admin,
    adminName: admin.full_name,
    adminAvatarUrl: "/church/images/branch-admin/avatar-pastor-stitch.jpg",
    notice: null,
    error: null,
    planContext: null,
  };
  const zeroCounts = { pending: 3, verified: 128, suspended: 1 };
  const map = {
    ba_dashboard: {
      ...base,
      navActive: "dashboard",
      shellTitle: "Branch Dashboard",
      counts: zeroCounts,
      requestCounts: { submitted: 4, in_review: 2 },
      announcementCounts: { published: 6, draft: 1 },
      upcomingPublishedEvents: 3,
      eventCounts: { draft: 1 },
      ministryCounts: { published: 8, draft: 0 },
      departmentCounts: { active: 5, archived: 1 },
      confirmedUpcomingDuties: 2,
      dutyCounts: { draft: 0, cancelled: 0 },
      activityNoteCounts: { submitted: 1, reviewed: 2, follow_up_requested: 0 },
      ministryAttendanceThisMonth: 42,
      leaderCounts: { active: 7, inactive: 1 },
      joinRequestCounts: { submitted: 2 },
      prayerCounts: { submitted: 3 },
      branchResetPendingCounts: { submitted_total: 1, member: 1, ministry_leader: 0 },
      monthlyReportStatus: "Draft ready",
      recentActivity: [
        {
          action: "member_verified",
          created_at: new Date().toISOString(),
        },
        {
          action: "announcement_published",
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      hqBroadcasts: [],
      actionLabel: (a) => ({
        member_verified: "Member verified",
        announcement_published: "Announcement published",
      }[a] || a),
      auditSummary: (log) =>
        log.action === "member_verified"
          ? "A pending registration was approved."
          : "A branch announcement went live.",
      actorDisplayFromRow: () => "Pastor John Banda",
    },
    ba_verification: {
      ...base,
      navActive: "verification",
      shellTitle: "Member Verification",
      pendingMembers: [
        {
          id: 1,
          full_name: "Grace Tembo",
          phone: "0977111000",
          email: "grace@example.com",
          age_group: "Adult (36-60)",
          ministry_interest: "Worship",
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          full_name: "Chanda Mwale",
          phone: "0977222000",
          email: "chanda@example.com",
          age_group: "Youth (18-35)",
          ministry_interest: "Youth",
          created_at: new Date().toISOString(),
        },
      ],
    },
    ba_website: {
      ...base,
      navActive: "website",
      shellTitle: "Website Editor",
      status: "published",
      lastPublishedAt: new Date().toISOString(),
      content: {},
      form: {},
    },
    ba_events: {
      ...base,
      navActive: "events",
      shellTitle: "Events Management",
      eventFilters: ["all", "published", "draft", "cancelled"],
      statusFilter: "all",
      eventStatusLabel: (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1),
      visibilityLabel: (v) => v || "Public",
      formatEventTimeRange: (ev) => ev.start_time || "",
      events: [
        {
          id: 1,
          title: "Sunday Worship Celebration",
          event_date: new Date().toISOString(),
          start_time: "09:00",
          location: "Main Sanctuary",
          visibility: "public",
          status: "published",
        },
        {
          id: 2,
          title: "Youth Outreach Night",
          event_date: new Date(Date.now() + 86400000 * 3).toISOString(),
          start_time: "19:00",
          location: "Community Hall",
          visibility: "members",
          status: "draft",
        },
      ],
    },
    ba_sermons: {
      ...base,
      navActive: "sermons",
      shellTitle: "Sermons",
      sermonFilters: ["all", "published", "draft"],
      statusFilter: "all",
      sermons: [
        { id: 1, title: "Walking in Faith", speaker: "Pastor John", category: "Sunday", status: "published" },
      ],
    },
    ba_resources: {
      ...base,
      navActive: "resources",
      shellTitle: "Resources",
      resourceFilters: ["all", "published", "draft"],
      resourceTypes: ["study", "document", "form"],
      statusFilter: "all",
      resourceTypeFilter: "all",
      resources: [
        { id: 1, title: "Membership Form", resource_type: "form", visibility: "members", status: "published" },
      ],
    },
    ba_contact: {
      ...base,
      navActive: "contact",
      shellTitle: "Contact Submissions",
      statusFilter: "all",
      contactStatusLabel: (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1),
      submissions: [
        {
          id: 1,
          full_name: "Visitor One",
          email: "visitor@example.com",
          phone: "",
          status: "new",
          created_at: new Date().toISOString(),
        },
      ],
    },
    ba_members: {
      ...base,
      navActive: "members",
      shellTitle: "Members",
      searchQuery: "",
      memberFilters: ["all", "pending", "verified", "suspended"],
      statusFilter: "all",
      memberStatusLabel: (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1),
      members: [
        {
          id: 1,
          full_name: "Mary Phiri",
          email: "mary@example.com",
          phone: "0977123456",
          status: "verified",
          age_group: "Adult (36-60)",
          created_at: new Date().toISOString(),
        },
      ],
    },
    ba_reports: {
      ...base,
      navActive: "reports",
      shellTitle: "Reports",
      dashboard: {
        previousMonthMissing: false,
        previousMonthLabel: "June 2026",
        currentMonthStatus: "Draft",
        currentPeriodLabel: "July 2026",
        givingStatus: "Not submitted",
        statusCounts: { draft: 1, submitted: 2 },
        attendancePreview: {
          sunday_average: 120,
          midweek_average: 45,
          children_average: 30,
          youth_average: 22,
          visitors_total: 8,
        },
        draftAttendanceCount: 0,
        reports: [],
      },
    },
  };
  return map[fixtureKey] || base;
}


function platformAdminFixtureLocals(fixtureKey) {
  const { getPlanDisplay } = require("../src/church/churchPlans");
  const { churchPublicHost } = require("../src/church/platformProvisioningValidation");
  const { ORG_BRANCH_STATUSES } = require("../src/church/platformStatusValidation");
  const { statusLabel, statusBadgeClass } = require("../src/church/churchStatusAccess");
  const formatDate = (v) => {
    if (!v) return "—";
    try { return new Date(v).toLocaleDateString("en-GB"); } catch { return String(v); }
  };
  const adminUser = { username: "superadmin", display_name: "Platform Admin", role: "super_admin" };
  const base = {
    blessboardAdminMode: true,
    adminUser,
    bodyEmbedClass: "",
    asset: (k) => `/${String(k || "").replace(/^\//, "")}`,
    _bn: "BlessBoard",
    notice: null,
    error: null,
    getPlanDisplay,
    churchPublicHost,
    formatDate,
    statusLabel,
    statusBadgeClass,
    orgBranchStatuses: ORG_BRANCH_STATUSES,
    churchResetPendingCounts: { submitted_total: 0 },
  };
  const org = {
    id: 1,
    name: "Kafue Baptist Church",
    slug: "kafuebaptist",
    country: "Zambia",
    city: "Kafue",
    primary_contact_name: "Pastor John Banda",
    primary_contact_email: "pastor@example.com",
    plan_code: "standard",
    branch_count: 1,
    status: "active",
    created_at: new Date().toISOString(),
  };
  const map = {
    pa_login: { error: null, cancelHref: "/" },
    pa_dashboard: {
      ...base,
      activeNav: "church_platform",
      navTitle: "Platform Dashboard",
      summary: {
        total_organizations: 12,
        active_organizations: 11,
        total_branches: 18,
        active_branches: 17,
        free_plan_count: 4,
        standard_plan_count: 6,
        pro_plan_count: 2,
        recentOrganizations: [org],
      },
      recentSupportNotes: [],
      securitySummary: { locked_total: 0, failed_attempts_last_24h: 2 },
      branchAdminPasswordResetCounts: { submitted: 1, reviewed: 3 },
      hqAdminPasswordResetCounts: { submitted: 0, reviewed: 1 },
      unifiedResetSummary: { submitted_total: 1, member: 0, branch_admin: 1, hq_admin: 0 },
      churchResetPendingCounts: { submitted_total: 1 },
    },
    pa_orgs: {
      ...base,
      activeNav: "church_platform_orgs",
      navTitle: "Organization Governance",
      organizations: [org],
      q: "",
      statusFilter: "all",
    },
    pa_org_new: {
      ...base,
      activeNav: "church_platform_orgs",
      navTitle: "Create New Organization",
      form: {},
      error: null,
      planCodes: ["free", "standard", "pro"],
    },
    pa_org_detail: {
      ...base,
      activeNav: "church_platform",
      navTitle: "BlessBoard Admin",
      organization: { ...org, status_reason: null, suspended_at: null, archived_at: null, primary_contact_phone: "" },
      branches: [{ id: 1, name: "Main", slug: "main", host_slug: "kafuebaptist", status: "active", created_at: new Date().toISOString() }],
      hqAdmins: [],
      branchAdmins: [],
      primaryHqAdmin: null,
      activeHqAdminCount: 0,
      hqLoginHostSlug: "kafuebaptist",
      planSummary: {
        branchLimitReached: false,
        planDisplay: getPlanDisplay("standard"),
        planCode: "standard",
        planStatus: "active",
        branchesDisplay: "1 / 5",
        membersDisplay: "12 / 200",
        storageDisplay: "0.2 GB",
        warnings: [],
      },
      provisioned: false,
      welcomePack: null,
      statusNotice: null,
      statusError: null,
      supportNotes: [],
      supportNoteNotice: null,
      supportNoteError: null,
      supportNoteReturnTo: "/admin/churches/1",
    },
    pa_org_edit: {
      ...base,
      activeNav: "church_platform_orgs",
      navTitle: "Edit organization",
      organization: org,
      form: {
        organization_name: org.name,
        organization_slug: org.slug,
        country: org.country,
        city: org.city,
        primary_contact_name: org.primary_contact_name,
        primary_contact_email: org.primary_contact_email,
        status: org.status,
      },
      organizationDetailPath: "/admin/churches/1",
      currentSlug: org.slug,
      error: null,
    },
    pa_diagnostics: {
      ...base,
      activeNav: "church_platform_diagnostics",
      navTitle: "Support Monitoring",
      diagnostics: {
        warnings: [],
        deploymentLabel: "local-dev",
        nodeEnv: "test",
        checkedAt: new Date().toISOString(),
        latestChurchMigration: "2026_church_schema",
        churchHostDomain: "blessboard.com",
        baseDomain: "blessboard.com",
        databaseConfigured: true,
        databaseReachable: true,
        databaseErrorKind: null,
        databaseError: null,
        poolConfig: { max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 },
        churchBranchesTable: { ok: true, message: "ok" },
        demoBranchLookup: { ok: true, message: "ok" },
        demoBranch: { ok: true, message: "present" },
        pilotBranch: { ok: true, message: "present" },
        schema: {
          memberRegistrationColumn: { ok: true, message: "ok" },
          contactSubmissionsTable: { ok: true, message: "ok" },
        },
        sessionSecretConfigured: true,
        sessionSecretLengthOk: true,
        sessionSecretWarning: null,
        hostResolutionSamples: [
          { host: "blessboard.com", label: "Apex", parsedKind: "apex", parsedSlug: null },
          { host: "demo.blessboard.com", label: "Demo", parsedKind: "branch", parsedSlug: "demo" },
        ],
      },
    },
  };
  return map[fixtureKey] || base;
}

function makePlatformAdminApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.get("/__fixture/:key", (req, res) => {
    const key = req.params.key;
    const viewMap = {
      pa_login: "admin/blessboard_login",
      pa_dashboard: "admin/church/dashboard",
      pa_orgs: "admin/church/organizations",
      pa_org_new: "admin/church/organization_form",
      pa_org_detail: "admin/church/organization_detail",
      pa_org_edit: "admin/church/organization_edit",
      pa_diagnostics: "admin/church/diagnostics",
    };
    const view = viewMap[key];
    if (!view) return res.status(404).send("unknown fixture");
    return res.render(view, platformAdminFixtureLocals(key));
  });
  return app;
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
    if (options.branchAdminSession && options.branchAdminSessionData) {
      req.session.churchBranchAdmin = options.branchAdminSessionData;
      req.churchBranchAdmin = options.branchAdminSessionData;
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
        ba_dashboard: "church/branch-admin/dashboard",
        ba_verification: "church/branch-admin/verification_queue",
        ba_website: "church/branch-admin/website_editor",
        ba_events: "church/branch-admin/events_management",
        ba_sermons: "church/branch-admin/sermons_management",
        ba_resources: "church/branch-admin/resources_management",
        ba_contact: "church/branch-admin/contact_submissions",
        ba_members: "church/branch-admin/members_directory",
        ba_reports: "church/branch-admin/reports_dashboard",
      };
      const view = viewMap[key];
      if (!view) return res.status(404).send("unknown fixture");
      const locals = String(key).startsWith("ba_")
        ? branchAdminFixtureLocals(key)
        : memberFixtureLocals(key);
      return res.render(view, locals);
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
    console.error("Unknown batch. Use A, B, C, D, or E.");
    process.exit(1);
  }

  const outDir = path.join(ROOT, batch.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  let memberSeed = null;
  let branchAdminSeed = null;
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

  if (batchKey === "D") {
    useFixtures = true;
    console.warn("Capturing Batch D via fixture renders (safe without PG / avoids auth DB reload).");
    fs.writeFileSync(
      path.join(outDir, "README.txt"),
      "Captured via EJS fixture renders for Branch Admin Batch D.\nRe-run with PG + live login for DB-backed screenshots.\n"
    );
    branchAdminSeed = {
      admin_id: 1,
      organization_id: 1,
      branch_id: 1,
      full_name: "Pastor John Banda",
      role: "branch_admin",
      status: "active",
    };
  }

  if (batchKey === "E") {
    useFixtures = true;
    console.warn("Capturing Batch E via platform admin fixture renders.");
    fs.writeFileSync(
      path.join(outDir, "README.txt"),
      "Captured via EJS fixture renders for Platform Admin Batch E.\nRe-run with PG + super admin login on blessboard.com for live screenshots.\n"
    );
  }

  const browser = await chromium.launch();
  let port = PORT;

  try {
    for (const item of batch.pages) {
      const app = item.platformFixture
        ? makePlatformAdminApp()
        : makeBranchApp({
            pendingMemberSession: !!item.pendingMemberSession,
            verifiedMemberSession: !!item.verifiedMemberSession,
            branchAdminSession: !!item.branchAdminSession,
            churchContext: memberSeed ? memberSeed.churchContext : undefined,
            memberSession: memberSeed ? memberSeed.memberSession : undefined,
            branchAdminSessionData: branchAdminSeed || undefined,
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
