"use strict";

/**
 * V2.04 Phase 3 — BB-M03/M04/M05 member creation flow.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const {
  FLOW_CODE,
  beginStaffAddMemberFlow,
  handleMatchStep,
  confirmStaffAddMemberCreate,
  presentMatchCards,
  signDraft,
  buildDraftPayload,
  _consumedCreateTokens,
} = require("../src/blessboard/services/blessBoardStaffAddMemberFlowService");
const {
  parseAddMemberFormBody,
} = require("../src/blessboard/services/blessBoardStaffAddMemberFormService");
const {
  PERSON_MATCH_ACTION,
  PERSON_MATCH_CODE,
} = require("../src/platform/person/duplicate");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const BRANCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MEMBER_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MEMBER_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef";
const ENV = { CSRF_SECRET: "v204-bb-member-creation-flow-test-secret" };

function baseParsed(overrides) {
  const body = {
    full_name: "Abigail Grace Mensah",
    preferred_name: "Abby",
    gender: "female",
    date_of_birth: "1988-06-14",
    phone_country: "ZM",
    phone_national: "977123456",
    email: "abigail.mensah@example.com",
    address_line_1: "12 Main St",
    branch_id: BRANCH,
    membership_status: "active",
    marital_status: "married",
    next_of_kin_name: "Michael Mensah",
    next_of_kin_relationship: "spouse",
    next_of_kin_phone: "+260971234567",
    ...(overrides || {}),
  };
  return parseAddMemberFormBody(body);
}

function memberRepoStub(rowsById) {
  const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
  const originals = {
    allocateNextChurchId: memberRepo.allocateNextChurchId,
    findMemberById: memberRepo.findMemberById,
  };
  memberRepo.allocateNextChurchId = async () => ({
    ok: true,
    memberNumber: "CH-93821",
  });
  memberRepo.findMemberById = async (_db, id) => rowsById[String(id)] || null;
  return () => {
    memberRepo.allocateNextChurchId = originals.allocateNextChurchId;
    memberRepo.findMemberById = originals.findMemberById;
  };
}

describe("V2.04 BB M03/M04/M05 templates + routes", () => {
  it("ships Stitch markers and CTAs without business logic in EJS", () => {
    const m03 = read("views/blessboard/v5/branch-admin/member-match.ejs");
    assert.match(m03, /data-bb-stitch-v204="BB-M03"/);
    assert.match(m03, /Possible Existing Member Detected/);
    assert.match(m03, /Duplicate Prevention Engine/);
    assert.match(m03, /This Is a Different Person/);
    assert.match(m03, /Open Existing Member/);
    assert.match(m03, /Back to Form/);
    assert.doesNotMatch(m03, /createStaffManagedMember|evaluatePersonDuplicates/);

    const m04 = read("views/blessboard/v5/branch-admin/member-review.ejs");
    assert.match(m04, /data-bb-stitch-v204="BB-M04"/);
    assert.match(m04, /Review New Member Record/);
    assert.match(m04, /Step 3 of 3/);
    assert.match(m04, /NOT ACTIVATED/);
    assert.match(m04, /Confirm &amp; Create Member/);
    assert.match(m04, /Back to Edit/);
    assert.doesNotMatch(m04, /createStaffManagedMember|submitStaffAddMember/);

    const m05 = read("views/blessboard/v5/branch-admin/member-created.ejs");
    assert.match(m05, /data-bb-stitch-v204="BB-M05"/);
    assert.match(m05, /Church Member Successfully Registered/);
    assert.match(m05, /Record Summary Card/);
    assert.match(m05, /Return to Members Directory/);
    assert.match(m05, /\+ Add Another Member/);
    assert.match(m05, /View Member Profile/);
    assert.doesNotMatch(m05, /createStaffManagedMember/);
  });

  it("wires multi-step routes before :id and never auto-merges", () => {
    const routes = read("src/blessboard/http/branchRegistrationAdminRoutes.js");
    const matchPost = routes.indexOf('router.post("/branch-admin/members/new/match"');
    const reviewPost = routes.indexOf('router.post("/branch-admin/members/new/review"');
    const createdGet = routes.indexOf('router.get("/branch-admin/members/:id/created"');
    const byId = routes.indexOf('router.get("/branch-admin/members/:id"');
    assert.ok(matchPost > 0 && reviewPost > 0 && createdGet > 0 && byId > 0);
    assert.ok(createdGet < byId, "GET :id/created must precede :id");
    assert.match(routes, /beginStaffAddMemberFlow/);
    assert.match(routes, /handleMatchStep/);
    assert.match(routes, /confirmStaffAddMemberCreate/);
    assert.doesNotMatch(routes, /auto[-_]?merge|mergeMembers/i);

    const flow = read("src/blessboard/services/blessBoardStaffAddMemberFlowService.js");
    assert.match(flow, /Never auto-merges|never auto-merge/i);
    assert.match(flow, /merged:\s*false/);
    assert.match(flow, /staff_confirmed_different_person/);
    assert.match(flow, /cross-tenant|Cross-tenant/);
  });
});

describe("V2.04 BB member creation flow service", () => {
  beforeEach(() => {
    _consumedCreateTokens.clear();
  });

  it("routes no-match to review then creates with portal not_activated", async () => {
    const restore = memberRepoStub({});
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFindByNumber = memberRepo.findMemberByChurchAndNumber;
    memberRepo.findMemberByChurchAndNumber = async () => null;
    try {
      const parsed = baseParsed();
      assert.equal(parsed.ok, true, JSON.stringify(parsed.fieldErrors));

      const started = await beginStaffAddMemberFlow(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          parsed,
          env: ENV,
        },
        {
          adapter: {
            productCode: "blessboard",
            duplicatePolicy: {
              decide: () => ({
                action: PERSON_MATCH_ACTION.ALLOW,
                blocking: false,
                overrideAllowed: false,
              }),
            },
            normalizeProductFields: () => ({
              ok: true,
              product: {
                churchId: CHURCH,
                branchId: BRANCH,
                membershipStatus: "active",
                portalAccessStatus: "not_activated",
              },
              productIdentifiers: [],
            }),
            loadDuplicateCandidates: async () => ({ ok: true, candidates: [] }),
            presentMatch: (m) => m,
          },
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: PERSON_MATCH_CODE.NO_MATCH,
            action: PERSON_MATCH_ACTION.ALLOW,
            blocking: false,
            matches: [],
          }),
        }
      );
      assert.equal(started.step, "review");
      assert.equal(started.code, FLOW_CODE.REVIEW_READY);

      const audits = [];
      const created = await confirmStaffAddMemberCreate(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          draftToken: started.draftToken,
          action: "confirm_create",
          env: ENV,
        },
        {
          authorize: async () => ({ allowed: true }),
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: PERSON_MATCH_CODE.NO_MATCH,
            action: PERSON_MATCH_ACTION.ALLOW,
            blocking: false,
            matches: [],
          }),
          hooks: {
            async createPerson() {
              return {
                ok: true,
                person: {
                  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                  organizationId: ORG,
                  platformIdentityId: null,
                },
              };
            },
            async linkPersonProductRelationship(_db, input) {
              return {
                ok: true,
                link: {
                  id: "link-1",
                  subjectRef: input.subjectRef,
                  personId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                },
              };
            },
            async recordAudit(_db, payload) {
              audits.push(payload);
              return { ok: true };
            },
          },
          adapter: {
            productCode: "blessboard",
            relationshipKey: "bb.membership",
            duplicatePolicy: {
              decide: () => ({
                action: PERSON_MATCH_ACTION.ALLOW,
                blocking: false,
                overrideAllowed: false,
              }),
            },
            authorize: async () => ({ ok: true }),
            normalizeProductFields: () => ({
              ok: true,
              product: {
                churchId: CHURCH,
                branchId: BRANCH,
                memberNumber: "CH-93821",
                membershipStatus: "active",
                portalAccessStatus: "not_activated",
              },
              productIdentifiers: [
                {
                  key: "member_number",
                  valueNormalized: "CH-93821",
                  blocking: true,
                },
              ],
            }),
            loadDuplicateCandidates: async () => ({ ok: true, candidates: [] }),
            createProductRelationship: async () => ({
              ok: true,
              subjectRef: MEMBER_A,
              productIdentifier: "CH-93821",
              relationshipStatus: "active",
              portalAccessStatus: "not_activated",
              productRecord: { member: { id: MEMBER_A, status: "active" } },
              location: {
                organizationId: ORG,
                churchId: CHURCH,
                branchId: BRANCH,
              },
            }),
            presentMatch: (m) => m,
          },
        }
      );
      assert.equal(created.code, FLOW_CODE.CREATED, JSON.stringify(created));
      assert.equal(created.memberId, MEMBER_A);
      assert.equal(created.portalAccessStatus, "not_activated");
      assert.ok(audits.length >= 1);
    } finally {
      memberRepo.findMemberByChurchAndNumber = originalFindByNumber;
      restore();
    }
  });

  it("blocks exact Church ID collision and forbids different-person override", async () => {
    const restore = memberRepoStub({
      [MEMBER_A]: {
        id: MEMBER_A,
        churchId: CHURCH,
        memberNumber: "CH-41098",
        firstName: "Abigail",
        lastName: "Mensah",
        phoneDisplay: "+260977123456",
        emailDisplay: "abby@example.com",
        status: "active",
        portalAccessStatus: "not_activated",
      },
    });
    try {
      const parsed = baseParsed();
      const started = await beginStaffAddMemberFlow(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          parsed,
          env: ENV,
        },
        {
          adapter: {
            productCode: "blessboard",
            duplicatePolicy: {
              decide: () => ({
                action: PERSON_MATCH_ACTION.BLOCK,
                blocking: true,
                overrideAllowed: false,
                reason: "duplicate_church_id",
              }),
            },
            normalizeProductFields: () => ({
              ok: true,
              product: {
                churchId: CHURCH,
                branchId: BRANCH,
                memberNumber: "CH-41098",
                membershipStatus: "active",
                portalAccessStatus: "not_activated",
              },
              productIdentifiers: [
                {
                  key: "member_number",
                  valueNormalized: "CH-41098",
                  blocking: true,
                },
              ],
            }),
            loadDuplicateCandidates: async () => ({
              ok: true,
              candidates: [
                {
                  id: MEMBER_A,
                  subjectRef: MEMBER_A,
                  organizationId: ORG,
                  productIdentifiers: [
                    {
                      key: "member_number",
                      valueNormalized: "CH-41098",
                      blocking: true,
                    },
                  ],
                },
              ],
            }),
            presentMatch: (m) => m,
          },
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH,
            action: PERSON_MATCH_ACTION.BLOCK,
            blocking: true,
            overrideAllowed: false,
            matches: [
              {
                subjectRef: MEMBER_A,
                matchCode: PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH,
                action: PERSON_MATCH_ACTION.BLOCK,
                reasons: ["member_number"],
              },
            ],
          }),
        }
      );
      assert.equal(started.step, "match");
      assert.equal(started.code, FLOW_CODE.MATCH_BLOCKED);
      assert.equal(started.matches.length, 1);
      assert.equal(started.matches[0].memberNumber, "CH-41098");

      const denied = await handleMatchStep(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          draftToken: started.draftToken,
          action: "different_person",
          env: ENV,
        },
        {
          adapter: {
            productCode: "blessboard",
            duplicatePolicy: {
              decide: () => ({
                action: PERSON_MATCH_ACTION.BLOCK,
                blocking: true,
                overrideAllowed: false,
              }),
            },
            normalizeProductFields: () => ({
              ok: true,
              product: {
                churchId: CHURCH,
                branchId: BRANCH,
                membershipStatus: "active",
                portalAccessStatus: "not_activated",
              },
              productIdentifiers: [],
            }),
            loadDuplicateCandidates: async () => ({ ok: true, candidates: [] }),
            presentMatch: (m) => m,
          },
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH,
            action: PERSON_MATCH_ACTION.BLOCK,
            blocking: true,
            matches: [
              {
                subjectRef: MEMBER_A,
                matchCode: PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH,
                reasons: ["member_number"],
              },
            ],
          }),
        }
      );
      assert.equal(denied.code, FLOW_CODE.MATCH_BLOCKED);
      assert.equal(denied.reason, "church_id_collision_not_overridable");
    } finally {
      restore();
    }
  });

  it("shows possible phone match then allows different person → review", async () => {
    const restore = memberRepoStub({
      [MEMBER_A]: {
        id: MEMBER_A,
        churchId: CHURCH,
        memberNumber: "CH-41098",
        firstName: "Abigail",
        lastName: "Mensah",
        phoneDisplay: "+260977123456",
        status: "active",
        portalAccessStatus: "not_activated",
      },
    });
    try {
      const parsed = baseParsed();
      const started = await beginStaffAddMemberFlow(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          parsed,
          env: ENV,
        },
        {
          adapter: {
            productCode: "blessboard",
            duplicatePolicy: {
              decide: () => ({
                action: PERSON_MATCH_ACTION.WARN,
                blocking: false,
                overrideAllowed: true,
              }),
            },
            normalizeProductFields: () => ({
              ok: true,
              product: {
                churchId: CHURCH,
                branchId: BRANCH,
                membershipStatus: "active",
                portalAccessStatus: "not_activated",
              },
              productIdentifiers: [],
            }),
            loadDuplicateCandidates: async () => ({ ok: true, candidates: [] }),
            presentMatch: (m) => m,
          },
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH,
            action: PERSON_MATCH_ACTION.WARN,
            blocking: false,
            overrideAllowed: true,
            matches: [
              {
                subjectRef: MEMBER_A,
                matchCode: PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH,
                action: PERSON_MATCH_ACTION.WARN,
                reasons: ["phone"],
              },
            ],
          }),
        }
      );
      assert.equal(started.step, "match");
      assert.equal(started.code, FLOW_CODE.MATCH_REQUIRED);

      const next = await handleMatchStep(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          draftToken: started.draftToken,
          action: "different_person",
          env: ENV,
        },
        {}
      );
      assert.equal(next.step, "review");
      assert.equal(next.draft.duplicateOverride, true);
      assert.equal(next.draft.duplicateOverrideReason, "staff_confirmed_different_person");
    } finally {
      restore();
    }
  });

  it("shows name+DOB match and open_existing never merges", async () => {
    const restore = memberRepoStub({
      [MEMBER_A]: {
        id: MEMBER_A,
        churchId: CHURCH,
        memberNumber: "CH-22001",
        firstName: "Abigail",
        lastName: "Mensah",
        status: "active",
        portalAccessStatus: "not_activated",
      },
    });
    try {
      const parsed = baseParsed();
      const started = await beginStaffAddMemberFlow(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          parsed,
          env: ENV,
        },
        {
          adapter: {
            productCode: "blessboard",
            duplicatePolicy: {
              decide: () => ({
                action: PERSON_MATCH_ACTION.WARN,
                blocking: false,
                overrideAllowed: true,
              }),
            },
            normalizeProductFields: () => ({
              ok: true,
              product: {
                churchId: CHURCH,
                branchId: BRANCH,
                membershipStatus: "active",
                portalAccessStatus: "not_activated",
              },
              productIdentifiers: [],
            }),
            loadDuplicateCandidates: async () => ({ ok: true, candidates: [] }),
            presentMatch: (m) => m,
          },
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: PERSON_MATCH_CODE.POSSIBLE_MATCH,
            action: PERSON_MATCH_ACTION.WARN,
            blocking: false,
            matches: [
              {
                subjectRef: MEMBER_A,
                matchCode: PERSON_MATCH_CODE.POSSIBLE_MATCH,
                reasons: ["name_dob"],
              },
            ],
          }),
        }
      );
      assert.equal(started.step, "match");

      const opened = await handleMatchStep(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          draftToken: started.draftToken,
          action: "open_existing",
          memberId: MEMBER_A,
          env: ENV,
        },
        {}
      );
      assert.equal(opened.step, "open_existing");
      assert.equal(opened.memberId, MEMBER_A);
      assert.equal(opened.merged, false);
    } finally {
      restore();
    }
  });

  it("never leaks cross-tenant member cards", async () => {
    const restore = memberRepoStub({
      [MEMBER_A]: {
        id: MEMBER_A,
        churchId: OTHER_CHURCH,
        memberNumber: "CH-FOREIGN",
        firstName: "Foreign",
        lastName: "Person",
      },
      [MEMBER_B]: {
        id: MEMBER_B,
        churchId: CHURCH,
        memberNumber: "CH-LOCAL",
        firstName: "Local",
        lastName: "Person",
      },
    });
    try {
      const cards = await presentMatchCards(
        {},
        {
          churchId: CHURCH,
          matches: [
            { subjectRef: MEMBER_A, reasons: ["phone"] },
            { subjectRef: MEMBER_B, reasons: ["phone"] },
          ],
        }
      );
      assert.equal(cards.length, 1);
      assert.equal(cards[0].memberId, MEMBER_B);
      assert.equal(cards[0].memberNumber, "CH-LOCAL");
      assert.ok(!cards.some((c) => c.memberNumber === "CH-FOREIGN"));
    } finally {
      restore();
    }
  });

  it("protects double-submit with createToken idempotency", async () => {
    const draft = buildDraftPayload({
      actorUserId: ACTOR,
      organizationId: ORG,
      churchId: CHURCH,
      branchId: BRANCH,
      values: { fullName: "Abigail Grace Mensah" },
      demographics: {
        firstName: "Abigail",
        lastName: "Grace Mensah",
        phoneNormalized: "+260977123456",
      },
      profile: {},
      membershipStatus: "active",
      churchIdPreview: "CH-93821",
      overallMatchCode: PERSON_MATCH_CODE.NO_MATCH,
      matchDecisionAction: PERSON_MATCH_ACTION.ALLOW,
    });
    const token = signDraft(draft, ENV);
    _consumedCreateTokens.set(draft.createToken, {
      memberId: MEMBER_A,
      productIdentifier: "CH-93821",
      expiresAt: Date.now() + 60_000,
    });

    const replay = await confirmStaffAddMemberCreate(
      {},
      {
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        draftToken: token,
        action: "confirm_create",
        env: ENV,
      },
      {}
    );
    assert.equal(replay.code, FLOW_CODE.IDEMPOTENT_REPLAY);
    assert.equal(replay.memberId, MEMBER_A);
    assert.equal(replay.portalAccessStatus, "not_activated");
    assert.equal(replay.replay, true);
  });

  it("rejects cross-actor draft tokens", async () => {
    const draft = buildDraftPayload({
      actorUserId: ACTOR,
      organizationId: ORG,
      churchId: CHURCH,
      branchId: BRANCH,
      values: {},
      demographics: {},
      profile: {},
      membershipStatus: "active",
      overallMatchCode: PERSON_MATCH_CODE.NO_MATCH,
      matchDecisionAction: PERSON_MATCH_ACTION.ALLOW,
    });
    const token = signDraft(draft, ENV);
    const denied = await handleMatchStep(
      {},
      {
        actorUserId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        organizationId: ORG,
        churchId: CHURCH,
        draftToken: token,
        action: "back",
        env: ENV,
      },
      {}
    );
    assert.equal(denied.code, FLOW_CODE.UNAUTHORIZED);
  });
});
