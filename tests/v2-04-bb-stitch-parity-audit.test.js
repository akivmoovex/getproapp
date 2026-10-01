"use strict";

/**
 * V2.04 Phase 11 — Full Stitch parity audit guards.
 * Completed product screens M01–M06, A01–A04, R01–R04 vs project 12773983203917549893.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const SCREENS = [
  {
    code: "BB-M01",
    file: "views/blessboard/v5/branch-admin/members.ejs",
    stitchId: "2b8333d5e64242bc9cde22dac5aacc3c",
    must: ["Members", "Portal Pending", "+ Add Member", "Church ID", "Manage congregation records"],
    mobileStitch: false,
  },
  {
    code: "BB-M02",
    file: "views/blessboard/v5/branch-admin/member-add.ejs",
    stitchId: "b31eebc2a7d944ed949e4032a01d8519",
    must: ["Register New Member", "Identity Section", "Church Membership Creation Policy"],
    mobileStitch: false,
  },
  {
    code: "BB-M03",
    file: "views/blessboard/v5/branch-admin/member-match.ejs",
    stitchId: "dcd7f88a977a4e63bab8327b32c1206a",
    must: ["Possible Existing Member Detected", "Duplicate Prevention Engine"],
    mobileStitch: false,
  },
  {
    code: "BB-M04",
    file: "views/blessboard/v5/branch-admin/member-review.ejs",
    stitchId: "6e22944ed9ab450a9ce51370f0acd9e0",
    must: ["Review New Member Record", "Duplicate Check Passed"],
    mobileStitch: false,
  },
  {
    code: "BB-M05",
    file: "views/blessboard/v5/branch-admin/member-created.ejs",
    stitchId: "0ef251628eb0495699eda17db921f50b",
    must: ["Roster Confirmation", "Church Member Successfully Registered", "+ Add Another Member"],
    mobileStitch: false,
  },
  {
    code: "BB-M06",
    file: "views/blessboard/v5/branch-admin/member-detail.ejs",
    stitchId: "7ddcd294a1514304a449e5f8a4acbc4c",
    must: ["Edit Member", "Manage Access", "Overview", "Membership"],
    mobileStitch: false,
  },
  {
    code: "BB-A01",
    file: "views/blessboard/v5/attendance/sessions.ejs",
    stitchId: "7102d694cef5496e8d5b0f941ee545ee",
    must: ["Attendance Sessions", "Manage active, upcoming, and certified parish gatherings", "+ Create Session"],
    mobileStitch: false,
  },
  {
    code: "BB-A02",
    file: "views/blessboard/v5/attendance/session-new.ejs",
    stitchId: "d4b24ec7d4f944afa5ec89bcf0983391",
    must: ["Create Attendance Session", "Save as Draft", "Late Arrival Threshold"],
    mobileStitch: false,
  },
  {
    code: "BB-A03",
    file: "views/blessboard/v5/attendance/session-dashboard.ejs",
    stitchId: "81d1cfbd65b04e0da93068bcf2d452fd",
    stitchMarker: /data-bb-stitch-v204="(?:<%= screen %>|BB-A03)"/,
    must: ["Total Checked In", "Close Session", "Display QR"],
    mobileStitch: false,
  },
  {
    code: "BB-A04",
    file: "views/blessboard/v5/attendance/check-in-manual.ejs",
    stitchId: "e14603722a2f4f7f94ba8a191a2ab0c1",
    must: ["Manual Greeter Desk", "Fast Member Search", "Confirm Check-In"],
    mobileStitch: false,
  },
  {
    code: "BB-R01",
    file: "views/blessboard/v5/join-requests/inbox.ejs",
    stitchId: "ff1bcec5a0274ca88ad46d2e889b80e8",
    mobileId: "bb1a2125b67f45d28eb18c1f43132dbd",
    must: ["Requests Inbox", "Pending", "Approved", "Rejected", "Cancelled", "Review Request"],
    mobileStitch: true,
  },
  {
    code: "BB-R02",
    file: "views/blessboard/v5/join-requests/review.ejs",
    stitchId: "79b654c9af18411a839a07c616e39e86",
    mobileId: "f8c014f3282549f1939920a39e2c382b",
    must: ["Approve Request", "Reject Request", "Conflict-of-Interest Protection Active"],
    mobileStitch: true,
  },
  {
    code: "BB-R03",
    file: "views/blessboard/v5/join-requests/decision.ejs",
    stitchId: "ddc98054601e4362ad7e1f051efa83bb",
    must: ["Confirm Request Adjudication", "Path A: Approve Request", "Path B: Reject Request"],
    mobileStitch: false,
  },
  {
    code: "BB-R04",
    file: "views/blessboard/v5/join-requests/ministry-members.ejs",
    stitchId: "fe42f3a5c09146738394018a7b78f6bf",
    must: ["Pending Ministry Requests", "Current Members", "Active Members"],
    mobileStitch: false,
  },
];

describe("V2.04 BB Stitch full parity audit", () => {
  it("ships completed map screens with correct Stitch IDs and authority copy", () => {
    for (const screen of SCREENS) {
      const html = read(screen.file);
      if (screen.stitchMarker) {
        assert.match(html, screen.stitchMarker);
      } else {
        assert.match(html, new RegExp(`data-bb-stitch-v204="${screen.code}"`));
      }
      assert.match(html, new RegExp(`data-bb-stitch-id="${screen.stitchId}"`));
      if (screen.mobileId) {
        assert.match(html, new RegExp(`data-bb-stitch-id-mobile="${screen.mobileId}"`));
      }
      for (const phrase of screen.must) {
        assert.match(
          html,
          new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          `${screen.code} missing phrase: ${phrase}`
        );
      }
      assert.doesNotMatch(html, /reviewJoinRequest|createAttendanceSession|createStaffManagedMember/);
    }
  });

  it("does not claim Stitch mobile for screens without mobile frames", () => {
    for (const screen of SCREENS.filter((s) => !s.mobileStitch && !s.mobileId)) {
      const html = read(screen.file);
      assert.doesNotMatch(
        html,
        /data-bb-stitch-id-mobile="[0-9a-f]{32}"/,
        `${screen.code} should not invent a Stitch mobile id`
      );
    }
  });

  it("keeps platform gp-ops partials product-neutral", () => {
    const dir = path.join(ROOT, "views/platform/partials");
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith("gp-ops-")) continue;
      const src = fs.readFileSync(path.join(dir, name), "utf8");
      assert.doesNotMatch(src, /BlessBoard|ActiveClinic|ministry|pastoral|patient|clinic|Church ID/i);
    }
    const css = read("public/platform/gp-ops-shared.css");
    assert.doesNotMatch(css, /BlessBoard|ActiveClinic|ministry|pastoral|patient|#6[Cc]5[Cc][Ee]7/);
  });

  it("V2.04 CSS uses error tokens instead of bare danger hex in new blocks", () => {
    const css = read("public/blessboard/v5/branch-admin.css");
    const idx = css.indexOf("/* —— V2.04 BB-A01");
    assert.ok(idx > 0);
    const v204 = css.slice(idx);
    // Bare #c0392b only allowed as token fallback inside var(...)
    const bare = v204.match(/(?<![,\s(])#c0392b/g);
    assert.equal(bare, null);
    assert.match(v204, /var\(--bb-color-error/);
    assert.match(css, /Phase 11 parity polish/);
  });

  it("keeps Sacred Modernity violet for apex; ops shells map Sanctuary Modern blue", () => {
    const colors = read("public/platform/theme/colors.css");
    assert.match(colors, /\[data-product="blessboard"\]/);
    assert.match(colors, /--palette-violet-500:\s*#6c5ce7/i);
    assert.match(colors, /--color-brand-primary:\s*var\(--palette-violet-500\)/);
    assert.match(colors, /data-bb-shell="branch-admin"/);
    assert.match(colors, /--color-brand-primary:\s*var\(--palette-blue-600\)/);
    assert.match(colors, /Sanctuary Modern/);
    const ac = colors.match(/\[data-product="activeclinic"\][\s\S]{0,400}/);
    assert.ok(ac);
    assert.doesNotMatch(ac[0], /palette-violet-500/);
    assert.ok(fs.existsSync(path.join(ROOT, "public/blessboard/v5/v204-foundation.css")));
  });

  it("documents missing Stitch frames as gaps (not invent screens)", () => {
    const report = read("docs/qa/V2_04_BB_STITCH_PARITY_REPORT.md");
    assert.match(report, /BB_V204_STITCH_PARITY_PASS_WITH_GAPS|BB_V204_STITCH_PARITY_PASS|BB_V204_STITCH_PARITY_BLOCKED/);
    assert.match(report, /BB-M01/);
    assert.match(report, /BB-R01/);
    assert.match(report, /PRODUCT_DECISION_DIFFERENCE|theme|GAPS/i);
  });
});
