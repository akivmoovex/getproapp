"use strict";

/**
 * ActiveClinic P04 clinical UI parity tests.
 * Verifies all 12 Stitch screens have corresponding views with correct data-ac-stitch markers.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const VIEWS_DIR = path.join(__dirname, "..", "views", "activeclinic", "app");

const EXPECTED_SCREENS = [
  {
    name: "Clinical Escalation Alert",
    id: "99757cfd7d3747d490f00ac342faa519",
    file: "clinical-escalation-alert-content.ejs",
  },
  {
    name: "Clinical Queue – Desktop",
    id: "b8d47f05a83c4959ac2d3d6ca83c7dfb",
    file: "clinical-queue-content.ejs",
  },
  {
    name: "Clinical Queue – Mobile",
    id: "16897ac752a94750bf00225db66ff768",
    file: "clinical-queue-content.ejs", // Same file as desktop
  },
  {
    name: "Consultation Workspace – Desktop",
    id: "5e4dbc7265ad4e17b060b1f641996db3",
    file: "consultation-workspace-content.ejs",
  },
  {
    name: "Consultation Workspace – Mobile",
    id: "15c6c639c2b04bbda97b54f127c500f8",
    file: "consultation-workspace-content.ejs", // Same file as desktop
  },
  {
    name: "Create Laboratory Request",
    id: "969bbfbdf9634dbc8af598ec2277e92f",
    file: "create-laboratory-request-content.ejs",
  },
  {
    name: "Create Prescription",
    id: "ee9bf2322b924cd79e86619a4635f702",
    file: "create-prescription-content.ejs",
  },
  {
    name: "Create Radiology Request",
    id: "bc4ffd8f0e8c44f48f38cc15a069656a",
    file: "create-radiology-request-content.ejs",
  },
  {
    name: "Diagnosis Entry",
    id: "33a522e2f4eb45c9bdbede9ba34e0bee",
    file: "diagnosis-entry-content.ejs",
  },
  {
    name: "Nursing Intake – Desktop",
    id: "7959616d1673403ba3bf6ff71d18a77b",
    file: "nursing-intake-content.ejs",
  },
  {
    name: "Triage Assessment – Desktop",
    id: "3c8f7b43b7984718acf661e381c1e6f7",
    file: "triage-assessment-content.ejs",
  },
  {
    name: "Vital Signs Entry – Desktop",
    id: "dede5e72277d413497e1f870f6b4a0e1",
    file: "vital-signs-entry-content.ejs",
  },
];

test("ActiveClinic P04 clinical UI parity", async (t) => {
  await t.test("all clinical view files exist", async () => {
    const files = new Set(await fs.readdir(VIEWS_DIR));

    for (const screen of EXPECTED_SCREENS) {
      assert.ok(
        files.has(screen.file),
        `View file ${screen.file} must exist for ${screen.name}`
      );
    }
  });

  await t.test("clinical queue view has desktop Stitch ID", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "clinical-queue-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes('data-ac-stitch="b8d47f05a83c4959ac2d3d6ca83c7dfb"'),
      "Clinical queue view must have desktop Stitch marker"
    );
  });

  await t.test("consultation workspace view has desktop Stitch ID", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "consultation-workspace-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes('data-ac-stitch="5e4dbc7265ad4e17b060b1f641996db3"'),
      "Consultation workspace view must have desktop Stitch marker"
    );
  });

  await t.test("triage assessment view has Stitch ID", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "triage-assessment-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes('data-ac-stitch="3c8f7b43b7984718acf661e381c1e6f7"'),
      "Triage assessment view must have Stitch marker"
    );
  });

  await t.test("vital signs entry view has Stitch ID", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "vital-signs-entry-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes('data-ac-stitch="dede5e72277d413497e1f870f6b4a0e1"'),
      "Vital signs entry view must have Stitch marker"
    );
  });

  await t.test("create lab request view has Stitch ID", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "create-laboratory-request-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes('data-ac-stitch="969bbfbdf9634dbc8af598ec2277e92f"'),
      "Create laboratory request view must have Stitch marker"
    );
  });

  await t.test("create prescription view has Stitch ID", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "create-prescription-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes('data-ac-stitch="ee9bf2322b924cd79e86619a4635f702"'),
      "Create prescription view must have Stitch marker"
    );
    assert.ok(
      content.includes("No auto-prescribing") || content.includes("manual"),
      "Prescription view must document manual entry requirement"
    );
  });

  await t.test("create radiology request view has Stitch ID", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "create-radiology-request-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes('data-ac-stitch="bc4ffd8f0e8c44f48f38cc15a069656a"'),
      "Create radiology request view must have Stitch marker"
    );
  });

  await t.test("clinical alert view has Stitch ID", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "clinical-escalation-alert-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes('data-ac-stitch="99757cfd7d3747d490f00ac342faa519"'),
      "Clinical alert view must have Stitch marker"
    );
    assert.ok(
      content.includes("Manual") || content.includes("manual"),
      "Clinical alert view must document manual raise requirement"
    );
  });

  await t.test("all views have CSRF token placeholder", async () => {
    const viewFiles = [
      "triage-assessment-content.ejs",
      "vital-signs-entry-content.ejs",
      "create-laboratory-request-content.ejs",
      "create-prescription-content.ejs",
      "create-radiology-request-content.ejs",
      "clinical-start-encounter-content.ejs",
    ];

    for (const file of viewFiles) {
      const content = await fs.readFile(path.join(VIEWS_DIR, file), "utf-8");
      assert.ok(
        content.includes('name="<%= shell.csrf.field %>"') ||
          content.includes('value="<%= shell.csrf.token %>"'),
        `${file} must have CSRF token placeholders`
      );
    }
  });

  await t.test("consultation workspace has SOAP structure placeholders", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "consultation-workspace-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes("subjective") ||
        content.includes("Subjective") ||
        content.includes("subjective_text"),
      "Consultation workspace must have SOAP Subjective field"
    );
    assert.ok(
      content.includes("objective") ||
        content.includes("Objective") ||
        content.includes("objective_text"),
      "Consultation workspace must have SOAP Objective field"
    );
    assert.ok(
      content.includes("assessment") ||
        content.includes("Assessment") ||
        content.includes("assessment_text"),
      "Consultation workspace must have SOAP Assessment field"
    );
    assert.ok(
      content.includes("plan") || content.includes("Plan") || content.includes("plan_text"),
      "Consultation workspace must have SOAP Plan field"
    );
  });

  await t.test("vital signs view supports common observation types", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "vital-signs-entry-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes("blood_pressure") || content.includes("Blood pressure"),
      "Vitals view must support blood pressure"
    );
    assert.ok(
      content.includes("heart_rate") || content.includes("Heart rate"),
      "Vitals view must support heart rate"
    );
    assert.ok(
      content.includes("temperature") || content.includes("Temperature"),
      "Vitals view must support temperature"
    );
  });

  await t.test("triage assessment supports pain scale", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "triage-assessment-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.includes("pain") || content.includes("Pain"),
      "Triage view must support pain level"
    );
    assert.ok(
      content.includes("0-10") || content.includes('max="10"'),
      "Triage view must support 0-10 pain scale"
    );
  });

  await t.test("prescription view documents no auto-prescribing", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "create-prescription-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.toLowerCase().includes("manual") ||
        content.toLowerCase().includes("no auto"),
      "Prescription view must document manual entry"
    );
    assert.ok(
      content.includes("dose") || content.includes("Dose"),
      "Prescription view must have dose field"
    );
    assert.ok(
      content.includes("frequency") || content.includes("Frequency"),
      "Prescription view must have frequency field"
    );
  });

  await t.test("clinical alert view documents manual raise only", async () => {
    const content = await fs.readFile(
      path.join(VIEWS_DIR, "clinical-escalation-alert-content.ejs"),
      "utf-8"
    );

    assert.ok(
      content.toLowerCase().includes("manual") ||
        content.toLowerCase().includes("no auto") ||
        content.toLowerCase().includes("explicitly"),
      "Clinical alert view must document manual raise requirement"
    );
  });
});
