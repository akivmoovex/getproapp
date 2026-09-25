"use strict";

/**
 * Canonical Release Notes Center catalog (evidence-backed).
 * Status values must match the Release Notes Center taxonomy.
 * Do not invent PASS / RELEASED without repository evidence.
 */

const STATUS = Object.freeze({
  PLANNED: "PLANNED",
  IN_DEVELOPMENT: "IN DEVELOPMENT",
  IMPLEMENTED: "IMPLEMENTED",
  LOCAL_QA_PASS: "LOCAL QA PASS",
  HOSTED_QA_PASS: "HOSTED QA PASS",
  QA_BLOCKED: "QA BLOCKED",
  NOT_TESTED: "NOT TESTED",
  RELEASED: "RELEASED",
  UNVERIFIED: "UNVERIFIED",
  DOCUMENTATION_PENDING: "DOCUMENTATION PENDING",
});

const PRODUCTS = Object.freeze({
  BB: "BlessBoard",
  AC: "ActiveClinic",
  SHARED: "Shared GetPro Platform",
  INFRA: "Infrastructure",
});

/** @type {ReadonlyArray<string>} */
const VERSION_ORDER = Object.freeze(["1.0", "1.1", "1.2", "1.3", "2.0", "2.01"]);

/**
 * @typedef {object} ReleaseFeature
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} workflow
 * @property {string} expectedBehavior
 * @property {string[]} products
 * @property {string} featureType
 * @property {string} implementationStatus
 * @property {string} qaStatus
 * @property {string[]} testCaseIds
 * @property {string[]} sources
 * @property {boolean} [publicSafe]
 */

/**
 * @typedef {object} ReleaseBug
 * @property {string} id
 * @property {string} severity
 * @property {string} product
 * @property {string} problem
 * @property {string|null} rootCause
 * @property {string|null} fix
 * @property {string} verificationStatus
 * @property {string[]} regressionTests
 * @property {string|null} outstanding
 * @property {string[]} sources
 * @property {boolean} [publicSafe]
 */

/**
 * @typedef {object} QaTestCase
 * @property {string} id
 * @property {string} featureOrBugId
 * @property {string} product
 * @property {string} objective
 * @property {string} prerequisites
 * @property {string[]} steps
 * @property {string} expectedResult
 * @property {string} status
 * @property {string} evidence
 */

/**
 * @typedef {object} ReleaseVersion
 * @property {string} version
 * @property {string} summary
 * @property {string|null} releaseDate
 * @property {string[]} products
 * @property {string} deploymentStatus
 * @property {string} qaVerification
 * @property {string[]} acceptanceCriteria
 * @property {string[]} pendingDevelopment
 * @property {string[]} knownIssues
 * @property {string[]} documentationGaps
 * @property {ReleaseFeature[]} features
 * @property {ReleaseBug[]} bugs
 * @property {QaTestCase[]} qaChecklist
 * @property {string[]} sources
 */

/** @type {ReadonlyArray<ReleaseVersion>} */
const VERSIONS = Object.freeze([
  Object.freeze({
    version: "1.0",
    summary:
      "ActiveClinic V1.0 release-candidate closure on branch V7 (testing). BlessBoard V5 foundation-era work is only partially mapped to the product label “1.0”; comprehensive unified 1.0 notes are incomplete.",
    releaseDate: "2026-08-26",
    products: [PRODUCTS.AC, PRODUCTS.BB, PRODUCTS.SHARED],
    deploymentStatus:
      "TESTING — ActiveClinic RC approved on moovex-platform-testing; production promotion was an explicit later operator step. Do not treat this label as verified production deployment.",
    qaVerification:
      "ACTIVECLINIC_V1_RELEASE_CANDIDATE_APPROVED (AC). BlessBoard 1.0 unified hosted closure: DOCUMENTATION PENDING.",
    acceptanceCriteria: [
      "AC FIX_REQUIRED 21-screen reconciliation closed or APPROVED_PRODUCT_DIFFERENCE",
      "Hosted SHA matches RC candidate on testing hosts",
      "Production untouched during RC closure",
    ],
    pendingDevelopment: [
      "Unified BlessBoard+ActiveClinic 1.0 release packet (DOCUMENTATION PENDING)",
    ],
    knownIssues: [
      "Historical docs use V5 / V7 branch labels; product “1.0” mapping for BlessBoard is incomplete",
    ],
    documentationGaps: [
      "No single docs/releases packet titled Version 1.0 covering both BB and AC",
      "BlessBoard 1.0 feature inventory for this center is UNVERIFIED / DOCUMENTATION PENDING",
    ],
    features: [
      Object.freeze({
        id: "F-1.0-AC-01",
        name: "ActiveClinic V1.0 release candidate",
        description:
          "Public booking/auth/CMS journeys certified against Stitch-scoped FIX_REQUIRED set (21 representative screens) with hosted QA on testing.",
        workflow:
          "Login → registration → public mini-site → CMS edit/publish on disposable QA clinic.",
        expectedBehavior:
          "Representative screens READY (≥95) or APPROVED_PRODUCT_DIFFERENCE; hosted journeys PASS on RC SHA.",
        products: [PRODUCTS.AC],
        featureType: "product_release",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.HOSTED_QA_PASS,
        testCaseIds: ["TC-1.0-AC-01"],
        sources: [
          "docs/activeclinic/release/ACTIVECLINIC_V1_RELEASE_CANDIDATE_CLOSURE.md",
        ],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-1.0-BB-01",
        name: "BlessBoard V5 foundation (mapped to 1.0 label)",
        description:
          "BlessBoard V5 platform foundation / RC versioning existed historically; this Release Notes Center does not have a complete evidence-backed 1.0 feature matrix for BlessBoard.",
        workflow: "DOCUMENTATION PENDING",
        expectedBehavior: "DOCUMENTATION PENDING",
        products: [PRODUCTS.BB],
        featureType: "product_release",
        implementationStatus: STATUS.DOCUMENTATION_PENDING,
        qaStatus: STATUS.UNVERIFIED,
        testCaseIds: ["TC-1.0-BB-01"],
        sources: ["docs/release/V5_RELEASE_VERSIONING.md", "docs/release/V5_FINAL_RELEASE_APPROVAL.md"],
        publicSafe: true,
      }),
    ],
    bugs: [],
    qaChecklist: [
      Object.freeze({
        id: "TC-1.0-AC-01",
        featureOrBugId: "F-1.0-AC-01",
        product: PRODUCTS.AC,
        objective: "Confirm AC V1.0 RC hosted closure verdict",
        prerequisites: "Access to ACTIVECLINIC_V1_RELEASE_CANDIDATE_CLOSURE.md",
        steps: [
          "Open docs/activeclinic/release/ACTIVECLINIC_V1_RELEASE_CANDIDATE_CLOSURE.md",
          "Confirm verdict ACTIVECLINIC_V1_RELEASE_CANDIDATE_APPROVED",
          "Confirm production untouched",
        ],
        expectedResult: "Documented hosted RC approval on testing SHA b0c62cd4…",
        status: STATUS.HOSTED_QA_PASS,
        evidence: "docs/activeclinic/release/ACTIVECLINIC_V1_RELEASE_CANDIDATE_CLOSURE.md",
      }),
      Object.freeze({
        id: "TC-1.0-BB-01",
        featureOrBugId: "F-1.0-BB-01",
        product: PRODUCTS.BB,
        objective: "Locate complete BlessBoard 1.0 release notes",
        prerequisites: "Repository docs search",
        steps: ["Search docs for BlessBoard Version 1.0 unified release notes"],
        expectedResult: "Complete packet found — currently not found",
        status: STATUS.NOT_TESTED,
        evidence: "DOCUMENTATION PENDING",
      }),
    ],
    sources: [
      "docs/activeclinic/release/ACTIVECLINIC_V1_RELEASE_CANDIDATE_CLOSURE.md",
      "docs/release/V5_RELEASE_VERSIONING.md",
    ],
  }),

  Object.freeze({
    version: "1.1",
    summary:
      "No dedicated Version 1.1 release packet was found under docs/releases or docs/qa. Entries below are marked DOCUMENTATION PENDING / UNVERIFIED.",
    releaseDate: null,
    products: [PRODUCTS.BB, PRODUCTS.AC, PRODUCTS.SHARED],
    deploymentStatus: "UNVERIFIED — do not infer production deployment from missing docs",
    qaVerification: "DOCUMENTATION PENDING",
    acceptanceCriteria: ["DOCUMENTATION PENDING — establish historical 1.1 evidence pack"],
    pendingDevelopment: ["Author historical 1.1 release notes from git tags/commits if recovered"],
    knownIssues: ["Historical documentation gap for Version 1.1"],
    documentationGaps: [
      "No docs/releases/*1.1* or docs/qa/*1.1* release notes located",
    ],
    features: [
      Object.freeze({
        id: "F-1.1-GAP-01",
        name: "Version 1.1 historical inventory",
        description: "Feature inventory for 1.1 could not be reconstructed from release docs in-repo.",
        workflow: "DOCUMENTATION PENDING",
        expectedBehavior: "DOCUMENTATION PENDING",
        products: [PRODUCTS.SHARED],
        featureType: "documentation",
        implementationStatus: STATUS.DOCUMENTATION_PENDING,
        qaStatus: STATUS.UNVERIFIED,
        testCaseIds: ["TC-1.1-GAP-01"],
        sources: [],
        publicSafe: true,
      }),
    ],
    bugs: [],
    qaChecklist: [
      Object.freeze({
        id: "TC-1.1-GAP-01",
        featureOrBugId: "F-1.1-GAP-01",
        product: PRODUCTS.SHARED,
        objective: "Confirm absence of Version 1.1 release docs",
        prerequisites: "Repository checkout",
        steps: ["Search docs/releases and docs/qa for 1.1 release notes"],
        expectedResult: "Gap recorded as DOCUMENTATION PENDING",
        status: STATUS.NOT_TESTED,
        evidence: "Audit 2026-09-25 — no dedicated 1.1 packet",
      }),
    ],
    sources: [],
  }),

  Object.freeze({
    version: "1.2",
    summary:
      "No dedicated Version 1.2 product release packet was found. Related shared website morning QA packs exist but are not a certified 1.2 release note.",
    releaseDate: null,
    products: [PRODUCTS.BB, PRODUCTS.AC, PRODUCTS.SHARED],
    deploymentStatus: "UNVERIFIED",
    qaVerification: "DOCUMENTATION PENDING",
    acceptanceCriteria: ["DOCUMENTATION PENDING"],
    pendingDevelopment: ["Author historical 1.2 release notes if recovered from ops archives"],
    knownIssues: ["Historical documentation gap for Version 1.2"],
    documentationGaps: [
      "docs/platform/V1_WEBSITE_MORNING_QA_PACK.md exists but is not a Version 1.2 release note",
      "No certified 1.2 BB/AC release acceptance verdict located",
    ],
    features: [
      Object.freeze({
        id: "F-1.2-GAP-01",
        name: "Version 1.2 historical inventory",
        description: "Feature inventory for 1.2 could not be reconstructed from a dedicated release packet.",
        workflow: "DOCUMENTATION PENDING",
        expectedBehavior: "DOCUMENTATION PENDING",
        products: [PRODUCTS.SHARED],
        featureType: "documentation",
        implementationStatus: STATUS.DOCUMENTATION_PENDING,
        qaStatus: STATUS.UNVERIFIED,
        testCaseIds: ["TC-1.2-GAP-01"],
        sources: ["docs/platform/V1_WEBSITE_MORNING_QA_PACK.md"],
        publicSafe: true,
      }),
    ],
    bugs: [],
    qaChecklist: [
      Object.freeze({
        id: "TC-1.2-GAP-01",
        featureOrBugId: "F-1.2-GAP-01",
        product: PRODUCTS.SHARED,
        objective: "Confirm Version 1.2 documentation gap",
        prerequisites: "Repository checkout",
        steps: ["Search for Version 1.2 release notes"],
        expectedResult: "Gap recorded",
        status: STATUS.NOT_TESTED,
        evidence: "Audit 2026-09-25",
      }),
    ],
    sources: ["docs/platform/V1_WEBSITE_MORNING_QA_PACK.md"],
  }),

  Object.freeze({
    version: "1.3",
    summary:
      "V7 QA line labeled product Version 1.3 (About versionBase 1.03). September 2026 QA release notes plus BB/AC hosted closure packs. Joint freeze remained BLOCKED by BlessBoard draft-hydration Major.",
    releaseDate: "2026-09-20",
    products: [PRODUCTS.BB, PRODUCTS.AC, PRODUCTS.SHARED],
    deploymentStatus:
      "TESTING on moovex-platform-testing (pronline.org). Production remained on a different SHA and was untouched by freeze/closure work.",
    qaVerification:
      "AC hosted closure PASS; BB hosted closure FAIL; joint freeze V1_3_QA_FREEZE_BLOCKED. Not a full release PASS.",
    acceptanceCriteria: [
      "BB+AC hosted critical workflows PASS",
      "Automated regression green",
      "Draft hydration Major closed (not met at freeze)",
    ],
    pendingDevelopment: [
      "BlessBoard draft hydration Major (blocker at freeze SHA c5910e075aac)",
      "Section reorder / edit→public marker proof incomplete while hydration fails",
    ],
    knownIssues: [
      "BB About editor stays data-draft=0 under website_mode=draft after save/reload (Major)",
      "Recovery email delivery configuration pending on testing (not an app failure proof)",
    ],
    documentationGaps: [
      "Earlier Sep 5 V7 QA notes predate 1.3 freeze; treat as related historical evidence, not the freeze verdict",
    ],
    features: [
      Object.freeze({
        id: "F-1.3-AC-01",
        name: "ActiveClinic V1.3 hosted closure workflows",
        description:
          "Staff invitation, About image CDN publish, website section lifecycle certified on testing demo clinic.",
        workflow: "Login → staff activate → CMS draft/publish → public verify",
        expectedBehavior: "BUG-002/007/008 hosted PASS on documented SHA",
        products: [PRODUCTS.AC],
        featureType: "qa_closure",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.HOSTED_QA_PASS,
        testCaseIds: ["TC-1.3-AC-01"],
        sources: ["docs/qa/V1_3_AC_QA_RELEASE_NOTES.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-1.3-SHARED-01",
        name: "Shared website governance + phone identity",
        description:
          "HQ-only publish authorization, cross-tenant denial, phone country/national split on registration.",
        workflow: "Finance cannot publish; cross-tenant 403; registration country list",
        expectedBehavior: "Governance and phone identity gates PASS on hosted BB probes",
        products: [PRODUCTS.SHARED, PRODUCTS.BB],
        featureType: "platform",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.HOSTED_QA_PASS,
        testCaseIds: ["TC-1.3-SHARED-01"],
        sources: ["docs/qa/V1_3_BB_QA_RELEASE_NOTES.md", "docs/releases/V7_QA_RELEASE_NOTES_2026-09-05.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-1.3-AC-02",
        name: "ActiveClinic registration/media/editor reliability (Sep 5 pack)",
        description:
          "Phone validation hardening, media validation, CSRF publish fix, cache policy, network save/publish UX.",
        workflow: "Register / edit / publish under interruption scenarios",
        expectedBehavior: "Documented PASS items in V7_QA_RELEASE_NOTES_2026-09-05",
        products: [PRODUCTS.AC],
        featureType: "bugfix_pack",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.HOSTED_QA_PASS,
        testCaseIds: ["TC-1.3-AC-02"],
        sources: ["docs/releases/V7_QA_RELEASE_NOTES_2026-09-05.md"],
        publicSafe: true,
      }),
    ],
    bugs: [
      Object.freeze({
        id: "BUG-1.3-BB-HYDRATION",
        severity: "Major",
        product: PRODUCTS.BB,
        problem:
          "About/home editor chrome stays data-draft=0 under website_mode=draft; saved drafts do not rehydrate after refresh.",
        rootCause: null,
        fix: null,
        verificationStatus: "OPEN",
        regressionTests: ["TC-1.3-BB-01"],
        outstanding: "Blocked V1_3_QA_FREEZE at SHA c5910e075aac",
        sources: ["docs/qa/V1_3_BB_QA_RELEASE_NOTES.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "BUG-1.3-EMPTY-BODY",
        severity: "Minor",
        product: PRODUCTS.SHARED,
        problem:
          "Empty body_text \"\" violated page_sections_body_text_len (23514) and historically surfaced as lookup_error on publish.",
        rootCause: "Empty string persisted instead of NULL for empty body",
        fix: "add/apply persist NULL instead of \"\" (shared website services)",
        verificationStatus: "MITIGATED — residual certification incomplete while hydration fails",
        regressionTests: ["TC-1.3-SHARED-02"],
        outstanding: "Full add→edit→public marker proof incomplete",
        sources: ["docs/qa/V1_3_BB_QA_RELEASE_NOTES.md"],
        publicSafe: true,
      }),
    ],
    qaChecklist: [
      Object.freeze({
        id: "TC-1.3-AC-01",
        featureOrBugId: "F-1.3-AC-01",
        product: PRODUCTS.AC,
        objective: "AC hosted closure BUG-002/007/008",
        prerequisites: "activeclinic.pronline.org testing",
        steps: ["Run hosted closure probes per V1_3_AC_QA_RELEASE_NOTES"],
        expectedResult: "V1_3_AC_HOSTED_CLOSURE_PASS",
        status: STATUS.HOSTED_QA_PASS,
        evidence: "docs/qa/V1_3_AC_QA_RELEASE_NOTES.md",
      }),
      Object.freeze({
        id: "TC-1.3-BB-01",
        featureOrBugId: "BUG-1.3-BB-HYDRATION",
        product: PRODUCTS.BB,
        objective: "BB draft hydration under website_mode=draft",
        prerequisites: "blessboard.pronline.org testing",
        steps: ["Add section / save / reload draft editor", "Observe data-draft"],
        expectedResult: "data-draft=1 and content hydrated",
        status: "OPEN",
        evidence: "docs/qa/V1_3_BB_QA_RELEASE_NOTES.md — FAIL on c5910e075aac",
      }),
      Object.freeze({
        id: "TC-1.3-SHARED-01",
        featureOrBugId: "F-1.3-SHARED-01",
        product: PRODUCTS.SHARED,
        objective: "Website governance hosted gate",
        prerequisites: "demo-church testing",
        steps: ["Finance publish denied", "HQ publish allowed"],
        expectedResult: "403 / published as documented",
        status: STATUS.HOSTED_QA_PASS,
        evidence: "docs/qa/V1_3_BB_QA_RELEASE_NOTES.md",
      }),
      Object.freeze({
        id: "TC-1.3-AC-02",
        featureOrBugId: "F-1.3-AC-02",
        product: PRODUCTS.AC,
        objective: "Sep 5 AC reliability pack",
        prerequisites: "V7 testing hosts",
        steps: ["Follow V7_QA_RELEASE_NOTES_2026-09-05 AC sections"],
        expectedResult: "Documented PASS items",
        status: STATUS.HOSTED_QA_PASS,
        evidence: "docs/releases/V7_QA_RELEASE_NOTES_2026-09-05.md",
      }),
      Object.freeze({
        id: "TC-1.3-SHARED-02",
        featureOrBugId: "BUG-1.3-EMPTY-BODY",
        product: PRODUCTS.SHARED,
        objective: "Empty body publish no longer 23514/lookup_error",
        prerequisites: "After NULL body fix deploy",
        steps: ["Add empty body section", "Publish"],
        expectedResult: "published without lookup_error on baseline probe",
        status: STATUS.NOT_TESTED,
        evidence: "Residual certification incomplete per V1_3_BB notes",
      }),
    ],
    sources: [
      "docs/qa/V1_3_BB_QA_RELEASE_NOTES.md",
      "docs/qa/V1_3_AC_QA_RELEASE_NOTES.md",
      "docs/releases/V7_QA_RELEASE_NOTES_2026-09-05.md",
    ],
  }),

  Object.freeze({
    version: "2.0",
    summary:
      "V8 platform line (neuniversity.org) introduced as Version 2.0 development/testing. Shared forms, membership, announcements, booking, and media work landed across overnight prompts. QA hub restricted to BB+AC V2.0 cards. About pages later moved to 2.01 — do not confuse hub marketing copy with About productVersion.",
    releaseDate: "2026-09-20",
    products: [PRODUCTS.BB, PRODUCTS.AC, PRODUCTS.SHARED],
    deploymentStatus:
      "TESTING — moovex-platform-v8-testing. Not an automatic production promotion. Production isolation preserved in V8 docs.",
    qaVerification:
      "V8_QA_HOMEPAGE_V2_ONLY_PASS for hub. Feature coverage is a mix of IMPLEMENTED / PARTIAL / hosted reports — not a single full release PASS.",
    acceptanceCriteria: [
      "V8 hub shows only BlessBoard V2.0 and ActiveClinic V2.0",
      "Production hosts untouched by V8 testing deploys",
      "Per-feature Stitch/workflow evidence recorded in V8_* docs",
    ],
    pendingDevelopment: [
      "Multiple PARTIAL Stitch mobile/desktop parity items in V8_IMPLEMENTATION_BASELINE",
      "Some V8 migrations created but not applied at baseline time",
    ],
    knownIssues: [
      "Implementation baseline PARTIAL rows (forms mobile, membership mobile, etc.)",
      "Historical BUG-002 shared deployment 503 and media delivery issues — see V8 bug docs",
    ],
    documentationGaps: [
      "No single “Version 2.0 RELEASED to production” certificate in-repo",
    ],
    features: [
      Object.freeze({
        id: "F-2.0-HUB-01",
        name: "V8 QA homepage Version 2.0 only",
        description:
          "neuniversity.org QA launcher shows BlessBoard V2.0 + ActiveClinic V2.0 only; V7 pronline hub unchanged.",
        workflow: "Open https://neuniversity.org/ → two product cards",
        expectedBehavior: "No V7 multi-product matrix on V8 hub",
        products: [PRODUCTS.SHARED],
        featureType: "platform",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.HOSTED_QA_PASS,
        testCaseIds: ["TC-2.0-HUB-01"],
        sources: ["docs/releases/V8_QA_HOMEPAGE_VERSION_2_ONLY.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.0-FORMS-01",
        name: "Shared forms builder (SH01–SH15)",
        description:
          "Cross-product form studio, public submit, submission review — see implementation baseline statuses.",
        workflow: "Admin forms dashboard → studio → publish → public /f/:token → submissions",
        expectedBehavior: "Core flows IMPLEMENTED; some mobile Stitch PARTIAL",
        products: [PRODUCTS.SHARED, PRODUCTS.BB, PRODUCTS.AC],
        featureType: "platform",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.UNVERIFIED,
        testCaseIds: ["TC-2.0-FORMS-01"],
        sources: ["docs/releases/V8_IMPLEMENTATION_BASELINE.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.0-BB-MEM-01",
        name: "BlessBoard membership workflows (BB01–BB18)",
        description: "Public apply wizard, activity registration, review queue, member profiles.",
        workflow: "Public register → HQ/branch review → member profile",
        expectedBehavior: "Most workflows IMPLEMENTED; several mobile PARTIAL",
        products: [PRODUCTS.BB],
        featureType: "product",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.UNVERIFIED,
        testCaseIds: ["TC-2.0-BB-MEM-01"],
        sources: ["docs/releases/V8_IMPLEMENTATION_BASELINE.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.0-AC-BOOK-01",
        name: "ActiveClinic booking / directory / services surfaces",
        description:
          "Directory navigation, service management, doctor profiles, booking inquiry prompts documented across V8_AC_* reports.",
        workflow: "Directory → clinic → book/inquire",
        expectedBehavior: "Per-prompt QA docs; aggregate status UNVERIFIED as a single release",
        products: [PRODUCTS.AC],
        featureType: "product",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.UNVERIFIED,
        testCaseIds: ["TC-2.0-AC-BOOK-01"],
        sources: [
          "docs/releases/V8_AC_DIRECTORY_NAVIGATION_QA.md",
          "docs/releases/V8_AC_SERVICE_MANAGEMENT_QA.md",
        ],
        publicSafe: true,
      }),
    ],
    bugs: [
      Object.freeze({
        id: "BUG-2.0-002-503",
        severity: "Critical",
        product: PRODUCTS.SHARED,
        problem: "Shared deployment 503 / boot failures documented in V8_BUG_002 and P0 root-cause docs.",
        rootCause: "See V8_P0_503_ROOT_CAUSE_AND_FIX.md / V8_BUG_002_SHARED_DEPLOYMENT_503.md",
        fix: "Documented remediation pack in those reports",
        verificationStatus: "See source docs — do not auto-declare RELEASED",
        regressionTests: ["TC-2.0-BUG-002"],
        outstanding: "Confirm hosted status from source doc before claiming PASS",
        sources: [
          "docs/releases/V8_BUG_002_SHARED_DEPLOYMENT_503.md",
          "docs/releases/V8_P0_503_ROOT_CAUSE_AND_FIX.md",
        ],
        publicSafe: true,
      }),
    ],
    qaChecklist: [
      Object.freeze({
        id: "TC-2.0-HUB-01",
        featureOrBugId: "F-2.0-HUB-01",
        product: PRODUCTS.SHARED,
        objective: "V8 hub Version 2.0 only",
        prerequisites: "neuniversity.org",
        steps: ["GET /", "Confirm only BB+AC V2.0 cards"],
        expectedResult: "V8_QA_HOMEPAGE_V2_ONLY_PASS",
        status: STATUS.HOSTED_QA_PASS,
        evidence: "docs/releases/V8_QA_HOMEPAGE_VERSION_2_ONLY.md",
      }),
      Object.freeze({
        id: "TC-2.0-FORMS-01",
        featureOrBugId: "F-2.0-FORMS-01",
        product: PRODUCTS.SHARED,
        objective: "Shared forms end-to-end on V8 testing",
        prerequisites: "BB or AC V8 host + forms migrations applied",
        steps: ["Create form", "Publish", "Submit", "Review"],
        expectedResult: "End-to-end PASS",
        status: STATUS.NOT_TESTED,
        evidence: "Aggregate hosted E2E not asserted as global PASS in this center",
      }),
      Object.freeze({
        id: "TC-2.0-BB-MEM-01",
        featureOrBugId: "F-2.0-BB-MEM-01",
        product: PRODUCTS.BB,
        objective: "Membership happy path on V8",
        prerequisites: "blessboard.neuniversity.org",
        steps: ["Public apply", "HQ review"],
        expectedResult: "Application reaches review queue",
        status: STATUS.NOT_TESTED,
        evidence: "Implementation baseline ≠ hosted release PASS",
      }),
      Object.freeze({
        id: "TC-2.0-AC-BOOK-01",
        featureOrBugId: "F-2.0-AC-BOOK-01",
        product: PRODUCTS.AC,
        objective: "Directory + booking smoke",
        prerequisites: "activeclinic.neuniversity.org",
        steps: ["Open directory", "Open clinic", "Start booking/inquiry"],
        expectedResult: "No 5xx on smoke path",
        status: STATUS.NOT_TESTED,
        evidence: "Per-prompt docs exist; center aggregate NOT TESTED",
      }),
      Object.freeze({
        id: "TC-2.0-BUG-002",
        featureOrBugId: "BUG-2.0-002-503",
        product: PRODUCTS.SHARED,
        objective: "Regression for shared deployment 503 class",
        prerequisites: "V8 testing healthz",
        steps: ["Check /healthz on hub + product hosts"],
        expectedResult: "200 ok schemaCompatible",
        status: STATUS.NOT_TESTED,
        evidence: "Re-verify against current tip before PASS",
      }),
    ],
    sources: [
      "docs/releases/V8_QA_HOMEPAGE_VERSION_2_ONLY.md",
      "docs/releases/V8_IMPLEMENTATION_BASELINE.md",
      "docs/releases/V8_HOSTED_END_TO_END_QA_REPORT.md",
    ],
  }),

  Object.freeze({
    version: "2.01",
    summary:
      "V8 tip line labeled product Version 2.01. Includes About version bump, publish error diagnostics, Website Change Manager (local QA), and Hostinger process investigations (infra, not app features). Change Manager hosted deploy was not performed in those QA tasks.",
    releaseDate: "2026-09-25",
    products: [PRODUCTS.BB, PRODUCTS.AC, PRODUCTS.SHARED, PRODUCTS.INFRA],
    deploymentStatus:
      "TESTING target moovex-platform-v8-testing. Individual features have varying hosted deploy evidence. Production untouched in V2.01 task docs.",
    qaVerification:
      "Mixed: About baseline PASS (hosted); publish diagnostics PASS (hosted, Hostinger log incomplete); Change Manager LOCAL QA PASS / hosted NOT TESTED; Hostinger Package A BLOCKED; worker consolidation UNVERIFIED.",
    acceptanceCriteria: [
      "About shows 2.01 on BB+AC V8 testing after baseline deploy",
      "Publish failures no longer remapped to incorrect lookup_error",
      "Change Manager features match Stitch where claimed — without calling design-only work RELEASED",
      "Infra Hostinger work tracked separately from application features",
    ],
    pendingDevelopment: [
      "Hosted deploy + hosted QA for Website Change Manager surfaces",
      "Package A www worker retirement (operator hPanel)",
      "Hostinger PID consolidation proof",
      "Original intermittent Sep 24 publishing failure still not reproduced as a separate engine bug",
    ],
    knownIssues: [
      "Incomplete Hostinger log verification for original publish incident",
      "Remaining uncertainty around original intermittent publishing failure",
      "Package A BLOCKED (no hPanel access in agent session)",
      "Worker consolidation UNVERIFIED",
    ],
    documentationGaps: [
      "Stitch Release Notes Center screens: not present in Stitch project list (UI DOCUMENTATION PENDING vs approved Stitch)",
      "No dedicated V2.01 robots.txt change ticket found — existing SEO robots.txt is longer-standing platform capability",
    ],
    features: [
      Object.freeze({
        id: "F-2.01-ABOUT-01",
        name: "About page Version 2.01",
        description:
          "Shared applicationBuildInfo V8 productVersion/versionBase bumped to 2.01; BB and AC About consume buildInfo.",
        workflow: "Open /about on BB and AC V8 hosts",
        expectedBehavior: "Displays Version 2.01 / Release or Enterprise 2.01 with separate build SHA",
        products: [PRODUCTS.BB, PRODUCTS.AC, PRODUCTS.SHARED],
        featureType: "versioning",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.HOSTED_QA_PASS,
        testCaseIds: ["TC-2.01-ABOUT-01"],
        sources: ["docs/releases/V2_01_RELEASE_BASELINE.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-ROBOTS-01",
        name: "robots.txt (platform SEO discovery)",
        description:
          "Tenant/clinic robots.txt via shared SEO discovery — existing capability. No dedicated V2.01 robots.txt change packet found; listed separately per task requirement.",
        workflow: "GET tenant/clinic /robots.txt",
        expectedBehavior: "Returns robots directives with sitemap when indexable",
        products: [PRODUCTS.SHARED, PRODUCTS.BB, PRODUCTS.AC],
        featureType: "seo",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.UNVERIFIED,
        testCaseIds: ["TC-2.01-ROBOTS-01"],
        sources: ["src/platform/website/seoDiscovery.js", "tests/v7-shared-seo-expansion.test.js"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-PUB-DIAG-01",
        name: "Publish error diagnostics (real engine codes)",
        description:
          "BlessBoard publish catch-alls no longer mask failures as lookup_error. Returns publicCode/engineCode/requestId and friendly messages. AC explicit codes preserved.",
        workflow: "Trigger publish failure → observe code + request ID in UI/JSON",
        expectedBehavior: "Real classification codes; no secret leakage; successful multi-item publish still works",
        products: [PRODUCTS.BB, PRODUCTS.AC],
        featureType: "bugfix",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.HOSTED_QA_PASS,
        testCaseIds: ["TC-2.01-PUB-DIAG-01", "TC-2.01-PUB-BB-01", "TC-2.01-PUB-AC-01"],
        sources: [
          "docs/qa/V2_01_PUBLISH_ERROR_DIAGNOSTICS_QA.md",
          "docs/qa/V2_01_PUBLISH_LOOKUP_ROOT_CAUSE.md",
        ],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-CM-FOUND-01",
        name: "Website Change Manager foundation",
        description:
          "Shared pending-change counting and Change Manager UI mounting infrastructure for BB+AC editors.",
        workflow: "Open website editor with drafts → pending count available to chrome",
        expectedBehavior: "Server-confirmed draft-vs-published distinct field counts",
        products: [PRODUCTS.SHARED, PRODUCTS.BB, PRODUCTS.AC],
        featureType: "change_manager",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.LOCAL_QA_PASS,
        testCaseIds: ["TC-2.01-CM-FOUND-01"],
        sources: ["docs/qa/V2_01_CHANGE_MANAGER_FOUNDATION_QA.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-CM-TOOLBAR-01",
        name: "Editor toolbar + unpublished changes counter",
        description:
          "Shared editor chrome: pending pill, save status, History/Preview/Publish, Publish (N) badge.",
        workflow: "Edit fields → see pending count → Publish label updates",
        expectedBehavior: "Counts from server; save status honest; Publish gated by website.publish",
        products: [PRODUCTS.BB, PRODUCTS.AC],
        featureType: "change_manager",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.LOCAL_QA_PASS,
        testCaseIds: ["TC-2.01-CM-TOOLBAR-01"],
        sources: ["docs/qa/V2_01_TOOLBAR_REMINDERS_QA.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-CM-REMIND-01",
        name: "Friendly publishing reminders",
        description:
          "Reminder dialog at pending threshold (≥5) with Preview Changes / Keep Editing and don’t-show-again-today.",
        workflow: "Accumulate ≥5 unpublished fields → reminder",
        expectedBehavior: "Preview does not publish; dismissal website-scoped",
        products: [PRODUCTS.BB, PRODUCTS.AC],
        featureType: "change_manager",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.LOCAL_QA_PASS,
        testCaseIds: ["TC-2.01-CM-REMIND-01"],
        sources: ["docs/qa/V2_01_TOOLBAR_REMINDERS_QA.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-CM-PANEL-01",
        name: "Unpublished Changes Panel",
        description:
          "Panel listing unpublished fields with navigation back to editors; shared BB/AC infrastructure.",
        workflow: "Open unpublished panel from chrome → jump to field",
        expectedBehavior: "Lists server-confirmed pending fields only",
        products: [PRODUCTS.BB, PRODUCTS.AC],
        featureType: "change_manager",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.LOCAL_QA_PASS,
        testCaseIds: ["TC-2.01-CM-PANEL-01"],
        sources: ["docs/qa/V2_01_UNPUBLISHED_CHANGES_QA.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-CM-HIST-01",
        name: "Field-level history and restoration",
        description:
          "History beside pencil; restore from published versions + current draft tip; writes new draft revision for selected field; no auto-publish.",
        workflow: "History → choose version → restore field → pending count updates",
        expectedBehavior: "Never fabricates unavailable draft revisions; CDN media validated; expectedUpdatedAt conflicts honored",
        products: [PRODUCTS.BB, PRODUCTS.AC],
        featureType: "change_manager",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.LOCAL_QA_PASS,
        testCaseIds: ["TC-2.01-CM-HIST-01"],
        sources: ["docs/qa/V2_01_FIELD_HISTORY_RESTORE_QA.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-CM-STITCH-01",
        name: "Change Manager Stitch mobile parity (~390px)",
        description:
          "CSS densification and layout checks against Website Change Manager Stitch screens for toolbar/reminder/panel/history.",
        workflow: "Resize editor chrome to ~390px",
        expectedBehavior: "Usable chrome without horizontal overflow for implemented screens",
        products: [PRODUCTS.BB, PRODUCTS.AC],
        featureType: "change_manager",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.LOCAL_QA_PASS,
        testCaseIds: ["TC-2.01-CM-STITCH-01"],
        sources: [
          "docs/qa/V2_01_TOOLBAR_REMINDERS_QA.md",
          "docs/qa/V2_01_UNPUBLISHED_CHANGES_QA.md",
          "docs/qa/V2_01_FIELD_HISTORY_RESTORE_QA.md",
        ],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-INFRA-AUDIT-01",
        name: "Hostinger account-wide process audit (infra)",
        description:
          "Investigation of Node worker/PID topology on Hostinger account — infrastructure, not application functionality.",
        workflow: "Ops read-only probes",
        expectedBehavior: "Documented PID matrix and findings",
        products: [PRODUCTS.INFRA],
        featureType: "infrastructure",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.UNVERIFIED,
        testCaseIds: ["TC-2.01-INFRA-01"],
        sources: ["docs/qa/V2_01_HOSTINGER_PROCESS_AUDIT.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-INFRA-CONSOL-01",
        name: "Hostinger worker consolidation plan (infra)",
        description:
          "Plan/investigation whether multiple hostnames can share one Node PID. Application co-location already designed; Hostinger Topology A not demonstrated.",
        workflow: "Ops investigation only",
        expectedBehavior: "Findings documented; no false claim of PID merge",
        products: [PRODUCTS.INFRA],
        featureType: "infrastructure",
        implementationStatus: STATUS.PLANNED,
        qaStatus: STATUS.UNVERIFIED,
        testCaseIds: ["TC-2.01-INFRA-02"],
        sources: ["docs/qa/V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-INFRA-PKGA-01",
        name: "Hostinger Package A www retirement (infra)",
        description:
          "Retire dedicated www workers via Hostinger redirects + unbind. Not applied — agent lacked hPanel access.",
        workflow: "Operator hPanel redirects + unbind www from Node app",
        expectedBehavior: "Fewer warm hostnames/PIDs after operator change",
        products: [PRODUCTS.INFRA],
        featureType: "infrastructure",
        implementationStatus: STATUS.PLANNED,
        qaStatus: STATUS.QA_BLOCKED,
        testCaseIds: ["TC-2.01-INFRA-03"],
        sources: ["docs/qa/V2_01_HOSTINGER_PACKAGE_A_QA.md"],
        publicSafe: true,
      }),
      Object.freeze({
        id: "F-2.01-RNC-01",
        name: "Release Notes Center",
        description:
          "Permanent /release-notes center on the V8 platform QA hub with version routes, filters, QA checklists, share/print.",
        workflow: "Open /release-notes → filter → version detail → share/print",
        expectedBehavior: "Evidence-backed statuses; public vs internal separation; no invented PASS",
        products: [PRODUCTS.SHARED],
        featureType: "platform",
        implementationStatus: STATUS.IMPLEMENTED,
        qaStatus: STATUS.LOCAL_QA_PASS,
        testCaseIds: ["TC-2.01-RNC-01"],
        sources: ["docs/releases/RELEASE_NOTES.md", "docs/qa/V2_01_RELEASE_NOTES_CENTER_QA.md"],
        publicSafe: true,
      }),
    ],
    bugs: [
      Object.freeze({
        id: "BUG-2.01-LOOKUP-REMAP",
        severity: "High",
        product: PRODUCTS.BB,
        problem:
          "BlessBoard publish catch-alls remapped many TX/engine failures to lookup_error, masking real codes.",
        rootCause:
          "Catch-all remapping in BB publish services (confirmed). Not proven as the sole cause of any specific Sep 24 intermittent failure.",
        fix: "websitePublishFailureDiagnostics + service catch path updates; requestId + publicCode",
        verificationStatus: "HOSTED QA PASS for diagnostics behavior; Hostinger log correlation incomplete",
        regressionTests: ["TC-2.01-PUB-DIAG-01", "TC-2.01-PUB-BB-01"],
        outstanding:
          "Original intermittent publishing failure not reproduced; Hostinger log verification incomplete",
        sources: [
          "docs/qa/V2_01_PUBLISH_LOOKUP_ROOT_CAUSE.md",
          "docs/qa/V2_01_PUBLISH_ERROR_DIAGNOSTICS_QA.md",
        ],
        publicSafe: true,
      }),
      Object.freeze({
        id: "BUG-2.01-PKG-A",
        severity: "Medium",
        product: PRODUCTS.INFRA,
        problem: "www hostnames still warm distinct Node PIDs; Express 301 alone does not retire workers.",
        rootCause: "Hostinger per-vhost lsnode spawn; hPanel change required",
        fix: null,
        verificationStatus: "BLOCKED",
        regressionTests: ["TC-2.01-INFRA-03"],
        outstanding: "Operator Package A execution + before/after PID matrix",
        sources: ["docs/qa/V2_01_HOSTINGER_PACKAGE_A_QA.md"],
        publicSafe: true,
      }),
    ],
    qaChecklist: [
      Object.freeze({
        id: "TC-2.01-ABOUT-01",
        featureOrBugId: "F-2.01-ABOUT-01",
        product: PRODUCTS.SHARED,
        objective: "About shows 2.01 on V8 BB+AC",
        prerequisites: "moovex-platform-v8-testing deploy of baseline",
        steps: ["GET BB /about", "GET AC /about"],
        expectedResult: "Version 2.01 visible; V7 unchanged",
        status: STATUS.HOSTED_QA_PASS,
        evidence: "docs/releases/V2_01_RELEASE_BASELINE.md",
      }),
      Object.freeze({
        id: "TC-2.01-ROBOTS-01",
        featureOrBugId: "F-2.01-ROBOTS-01",
        product: PRODUCTS.SHARED,
        objective: "robots.txt responds on tenant/clinic",
        prerequisites: "Demo tenant on testing",
        steps: ["GET /robots.txt (tenant/clinic path)"],
        expectedResult: "200 with expected directives",
        status: STATUS.NOT_TESTED,
        evidence: "Unit coverage exists; V2.01 hosted recheck NOT TESTED",
      }),
      Object.freeze({
        id: "TC-2.01-PUB-DIAG-01",
        featureOrBugId: "F-2.01-PUB-DIAG-01",
        product: PRODUCTS.BB,
        objective: "Failure codes not remapped to lookup_error",
        prerequisites: "Diagnostics deploy on V8 testing",
        steps: ["Inject/classify failure paths", "Confirm publicCode"],
        expectedResult: "V2_01_PUBLISH_DIAGNOSTICS_QA_PASS",
        status: STATUS.HOSTED_QA_PASS,
        evidence: "docs/qa/V2_01_PUBLISH_ERROR_DIAGNOSTICS_QA.md",
      }),
      Object.freeze({
        id: "TC-2.01-PUB-BB-01",
        featureOrBugId: "F-2.01-PUB-DIAG-01",
        product: PRODUCTS.BB,
        objective: "BB multi-item publishing success on tip",
        prerequisites: "Disposable V8 QA church",
        steps: ["Edit multiple fields", "Publish"],
        expectedResult: "published success reported",
        status: STATUS.HOSTED_QA_PASS,
        evidence: "docs/qa/V2_01_PUBLISH_LOOKUP_ROOT_CAUSE.md § confirmed successful publish",
      }),
      Object.freeze({
        id: "TC-2.01-PUB-AC-01",
        featureOrBugId: "F-2.01-PUB-DIAG-01",
        product: PRODUCTS.AC,
        objective: "AC publishing success on tip",
        prerequisites: "Disposable V8 QA clinic",
        steps: ["Edit", "Publish"],
        expectedResult: "published success reported",
        status: STATUS.HOSTED_QA_PASS,
        evidence: "docs/qa/V2_01_PUBLISH_LOOKUP_ROOT_CAUSE.md",
      }),
      Object.freeze({
        id: "TC-2.01-CM-FOUND-01",
        featureOrBugId: "F-2.01-CM-FOUND-01",
        product: PRODUCTS.SHARED,
        objective: "Change Manager foundation local suite",
        prerequisites: "Local V8 tree",
        steps: ["Run foundation tests"],
        expectedResult: "V2_01_CHANGE_MANAGER_FOUNDATION_PASS",
        status: STATUS.LOCAL_QA_PASS,
        evidence: "docs/qa/V2_01_CHANGE_MANAGER_FOUNDATION_QA.md — hosted deploy not performed",
      }),
      Object.freeze({
        id: "TC-2.01-CM-TOOLBAR-01",
        featureOrBugId: "F-2.01-CM-TOOLBAR-01",
        product: PRODUCTS.BB,
        objective: "Toolbar + counter local QA",
        prerequisites: "Local editor",
        steps: ["Verify pending pill and Publish (N)"],
        expectedResult: "V2_01_TOOLBAR_REMINDERS_PASS",
        status: STATUS.LOCAL_QA_PASS,
        evidence: "docs/qa/V2_01_TOOLBAR_REMINDERS_QA.md",
      }),
      Object.freeze({
        id: "TC-2.01-CM-REMIND-01",
        featureOrBugId: "F-2.01-CM-REMIND-01",
        product: PRODUCTS.AC,
        objective: "Publishing reminder local QA",
        prerequisites: "≥5 pending fields",
        steps: ["Trigger reminder", "Preview does not publish"],
        expectedResult: "Reminder UX PASS locally",
        status: STATUS.LOCAL_QA_PASS,
        evidence: "docs/qa/V2_01_TOOLBAR_REMINDERS_QA.md",
      }),
      Object.freeze({
        id: "TC-2.01-CM-PANEL-01",
        featureOrBugId: "F-2.01-CM-PANEL-01",
        product: PRODUCTS.SHARED,
        objective: "Unpublished panel local QA",
        prerequisites: "Pending drafts",
        steps: ["Open panel", "Navigate to field"],
        expectedResult: "V2_01_UNPUBLISHED_CHANGES_PASS",
        status: STATUS.LOCAL_QA_PASS,
        evidence: "docs/qa/V2_01_UNPUBLISHED_CHANGES_QA.md",
      }),
      Object.freeze({
        id: "TC-2.01-CM-HIST-01",
        featureOrBugId: "F-2.01-CM-HIST-01",
        product: PRODUCTS.SHARED,
        objective: "Field history/restore local QA",
        prerequisites: "Published history available",
        steps: ["Restore field", "Confirm new draft revision"],
        expectedResult: "V2_01_FIELD_HISTORY_RESTORE_PASS",
        status: STATUS.LOCAL_QA_PASS,
        evidence: "docs/qa/V2_01_FIELD_HISTORY_RESTORE_QA.md",
      }),
      Object.freeze({
        id: "TC-2.01-CM-STITCH-01",
        featureOrBugId: "F-2.01-CM-STITCH-01",
        product: PRODUCTS.SHARED,
        objective: "390px Change Manager chrome",
        prerequisites: "Local CSS",
        steps: ["Viewport 390px", "Inspect chrome"],
        expectedResult: "No blocking overflow for implemented screens",
        status: STATUS.LOCAL_QA_PASS,
        evidence: "CM QA docs Stitch parity tables",
      }),
      Object.freeze({
        id: "TC-2.01-INFRA-01",
        featureOrBugId: "F-2.01-INFRA-AUDIT-01",
        product: PRODUCTS.INFRA,
        objective: "Process audit document complete",
        prerequisites: "Audit doc",
        steps: ["Review PID matrix"],
        expectedResult: "Findings recorded",
        status: STATUS.UNVERIFIED,
        evidence: "docs/qa/V2_01_HOSTINGER_PROCESS_AUDIT.md",
      }),
      Object.freeze({
        id: "TC-2.01-INFRA-02",
        featureOrBugId: "F-2.01-INFRA-CONSOL-01",
        product: PRODUCTS.INFRA,
        objective: "Worker consolidation feasibility",
        prerequisites: "Consolidation plan",
        steps: ["Confirm Topology A not demonstrated"],
        expectedResult: "V2_01_WORKER_CONSOLIDATION_UNVERIFIED",
        status: STATUS.UNVERIFIED,
        evidence: "docs/qa/V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md",
      }),
      Object.freeze({
        id: "TC-2.01-INFRA-03",
        featureOrBugId: "F-2.01-INFRA-PKGA-01",
        product: PRODUCTS.INFRA,
        objective: "Package A applied",
        prerequisites: "hPanel operator",
        steps: ["Apply redirects", "Unbind www", "PID before/after"],
        expectedResult: "V2_01_PACKAGE_A_QA_PASS",
        status: "BLOCKED",
        evidence: "docs/qa/V2_01_HOSTINGER_PACKAGE_A_QA.md",
      }),
      Object.freeze({
        id: "TC-2.01-RNC-01",
        featureOrBugId: "F-2.01-RNC-01",
        product: PRODUCTS.SHARED,
        objective: "Release Notes Center routes respond on V8 hub",
        prerequisites: "Deploy containing release-notes routes",
        steps: [
          "GET /release-notes",
          "GET /release-notes/2.01",
          "Apply filters",
          "Open share/print",
        ],
        expectedResult: "200 HTML; statuses match catalog; no secrets",
        status: STATUS.LOCAL_QA_PASS,
        evidence:
          "tests/v2-01-release-notes-center.test.js 16/16 PASS — hosted deploy NOT TESTED",
      }),
    ],
    sources: [
      "docs/releases/V2_01_RELEASE_BASELINE.md",
      "docs/qa/V2_01_PUBLISH_ERROR_DIAGNOSTICS_QA.md",
      "docs/qa/V2_01_PUBLISH_LOOKUP_ROOT_CAUSE.md",
      "docs/qa/V2_01_CHANGE_MANAGER_FOUNDATION_QA.md",
      "docs/qa/V2_01_TOOLBAR_REMINDERS_QA.md",
      "docs/qa/V2_01_UNPUBLISHED_CHANGES_QA.md",
      "docs/qa/V2_01_FIELD_HISTORY_RESTORE_QA.md",
      "docs/qa/V2_01_HOSTINGER_PROCESS_AUDIT.md",
      "docs/qa/V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md",
      "docs/qa/V2_01_HOSTINGER_PACKAGE_A_QA.md",
    ],
  }),
]);

module.exports = {
  STATUS,
  PRODUCTS,
  VERSION_ORDER,
  VERSIONS,
};
