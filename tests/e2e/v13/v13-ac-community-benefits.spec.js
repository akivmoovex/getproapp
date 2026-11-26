const { test, expect } = require("@playwright/test");

const CLINIC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINIC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function actor(clinicId, clinicName) {
  return JSON.stringify({
    staffId: "staff-1",
    role: "reception",
    clinicId,
    clinicName,
    facilityId: clinicId === CLINIC_A ? "facility-a" : "facility-b",
  });
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/__test/reset");
  expect(reset.ok()).toBeTruthy();
});

test("enrollment stays pending consent and the pass is a presentation code", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-community-test-actor": actor(CLINIC_A, "Clinic A") });
  await page.goto("/app/community/enroll");
  await page.getByLabel("Preferred name").fill("New Member");
  await page.getByRole("button", { name: "Request enrollment" }).click();
  await expect(page.getByRole("status")).toContainText("pending consent");
  await page.getByRole("link", { name: "Continue to community pass" }).click();
  await expect(page.locator("#membership_status")).toHaveText("pending_consent");
  await page.getByRole("button", { name: "Issue pass" }).click();
  await expect(page.locator("#membership_status")).toHaveText("pending_consent");
  const first = await page.locator("#fallback_code").innerText();
  await page.getByRole("button", { name: "Rotate pass" }).click();
  const second = await page.locator("#fallback_code").innerText();
  expect(second).not.toBe(first);
  await expect(page.locator("#membership_status")).toHaveText("pending_consent");
  await expect(page.locator("#pass_token")).toBeVisible();
});

test("reception check-in uses the fallback code and does not disclose another clinic chart", async ({ page, request }) => {
  const fixtures = await (await request.get("/__test/fixtures")).json();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({ "x-community-test-actor": actor(CLINIC_A, "Clinic A") });
  await page.goto("/app/reception/community-check-in");
  await expect(page.locator("#clinic_name")).toHaveText("Clinic A");
  await page.getByLabel("QR or fallback code").fill(fixtures.walkerCode);
  await page.getByLabel("Existing local patient").fill(fixtures.patientId);
  await page.getByLabel("I confirmed this is the same person").check();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#eligibility_decision")).toContainText("NOT_ELIGIBLE walk_in_no_introduction");
  await expect(page.locator("#benefit_disclosure")).toHaveText("No community discount is applied.");
  await expect(page.locator("body")).not.toContainText("private-chart-note-a");
  await expect(page.locator("#checkin_result")).toContainText("Local chart linked.");
});

test("clinic B introduction can preview a synthetic discount while clinic A stays ineligible", async ({ page, request }) => {
  const fixtures = await (await request.get("/__test/fixtures")).json();
  await page.setExtraHTTPHeaders({ "x-community-test-actor": actor(CLINIC_B, "Clinic B") });
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.introducedCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#eligibility_decision")).toContainText("ELIGIBLE introduced_repeat");
  await expect(page.locator("#benefit_disclosure")).toHaveText("Community discount 10000 ngwee.");
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.introducedCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#eligibility_decision")).toContainText("ELIGIBLE introduced_repeat");
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.walkerCode);
  await page.locator("#clinic_id").selectOption(CLINIC_B);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#eligibility_decision")).toContainText("ELIGIBLE introduced_repeat");
  await page.setExtraHTTPHeaders({ "x-community-test-actor": actor(CLINIC_A, "Clinic A") });
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.walkerCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#eligibility_decision")).toContainText("NOT_ELIGIBLE walk_in_no_introduction");
});

test("rejects invalid, expired, revoked, suspended, member-only, and wrong-clinic check-in", async ({ page, request }) => {
  const fixtures = await (await request.get("/__test/fixtures")).json();
  await page.setExtraHTTPHeaders({ "x-community-test-actor": actor(CLINIC_A, "Clinic A") });
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill("not-a-real-code");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid, expired, or revoked");

  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.expiredCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid, expired, or revoked");

  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.revokedCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid, expired, or revoked");

  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.suspendedCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#eligibility_decision")).toContainText("NOT_ELIGIBLE membership_blocked");

  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.memberCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#eligibility_decision")).toContainText("MEMBER_ONLY no_introduction");

  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.inactiveCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#eligibility_decision")).toContainText("MEMBER_ONLY agreement_inactive");
  await expect(page.locator("#benefit_disclosure")).toHaveText("No community discount is applied.");

  await page.goto("/app/reception/community-check-in");
  await page.locator("#clinic_id").selectOption(CLINIC_B);
  await page.getByLabel("QR or fallback code").fill(fixtures.memberCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("alert")).toContainText("cannot open another clinic");
});

test("ambiguous confirmation does not create a chart link and a repeated check-in does not post a ledger", async ({ page, request }) => {
  const fixtures = await (await request.get("/__test/fixtures")).json();
  await page.setExtraHTTPHeaders({ "x-community-test-actor": actor(CLINIC_A, "Clinic A") });
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.walkerCode);
  await page.getByLabel("I confirmed this is the same person").check();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#checkin_result")).toContainText("review_required");
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.introducedCode);
  await page.getByRole("button", { name: "Check in" }).click();
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.introducedCode);
  await page.getByRole("button", { name: "Check in" }).click();
  const after = await (await request.get("/__test/fixtures")).json();
  expect(after.ledgerCount).toBe(0);
});

test("mobile layout, keyboard labels, cancel, and a reused form token are rejected", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.setExtraHTTPHeaders({ "x-community-test-actor": actor(CLINIC_A, "Clinic A") });
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Service")).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/community-check-in/);
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.getByRole("heading", { name: "Community Check-in" })).toBeVisible();
  const csrf = await page.locator("input[name=csrf]").inputValue();
  const first = await request.post("/app/reception/community-check-in", {
    headers: { "x-community-test-actor": actor(CLINIC_A, "Clinic A") },
    form: { csrf, pass_code: "not-a-real-code", clinic_id: CLINIC_A, action: "preview", amount_minor: "100000", service_code: "consultation" },
  });
  expect(first.status()).toBe(400);
  const second = await request.post("/app/reception/community-check-in", {
    headers: { "x-community-test-actor": actor(CLINIC_A, "Clinic A") },
    form: { csrf, pass_code: "not-a-real-code", clinic_id: CLINIC_A, action: "preview", amount_minor: "100000", service_code: "consultation" },
  });
  expect(second.status()).toBe(403);
});

test("a fractional quote does not disclose a discount", async ({ page, request }) => {
  const fixtures = await (await request.get("/__test/fixtures")).json();
  const hidden = await request.get(`/app/community/pass?person=${fixtures.patientId}`);
  expect(hidden.status()).toBe(401);
  await page.setExtraHTTPHeaders({ "x-community-test-actor": actor(CLINIC_B, "Clinic B") });
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("QR or fallback code").fill(fixtures.introducedCode);
  await page.getByLabel("Quoted amount in ngwee").fill("100000.5");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator("#eligibility_decision")).toContainText("ELIGIBLE introduced_repeat");
  await expect(page.getByRole("alert")).toContainText("whole ngwee");
  await expect(page.locator("#benefit_disclosure")).toHaveText("No community discount is applied.");
});

test("manual lookup and settlement preview do not create a referral or a posting", async ({ page, request }) => {
  const before = await (await request.get("/__test/fixtures")).json();
  await page.setExtraHTTPHeaders({ "x-community-test-actor": actor(CLINIC_A, "Clinic A") });
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("Local patient name").fill("Walk In Ada");
  await page.getByRole("button", { name: "Find patient" }).click();
  await expect(page.locator("#lookup_results")).toContainText("Walk In Ada");
  await expect(page.locator("#lookup_results")).toContainText("****0001");
  await expect(page.locator("body")).not.toContainText("private-chart-note-a");
  await expect(page.getByRole("status")).toContainText("Confirm the chart");
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("Local patient phone").fill("0977000001");
  await page.getByRole("button", { name: "Find patient" }).click();
  await expect(page.getByRole("alert")).toContainText("More than one local patient");
  await page.goto("/app/reception/community-check-in");
  await page.getByLabel("Local patient name").fill("Nobody Here");
  await page.getByRole("button", { name: "Find patient" }).click();
  await expect(page.getByRole("alert")).toContainText("No local patient matches");
  await page.goto("/app/reception/community-check-in");
  await page.getByRole("button", { name: "Find patient" }).click();
  await expect(page.getByRole("alert")).toContainText("at least 2 characters");
  await page.goto("/app/reception/community-check-in");
  await page.getByRole("button", { name: "Preview settlement" }).click();
  await expect(page.locator("#settlement_status")).toContainText("PENDING_APPROVAL");
  await expect(page.locator("#benefit_disclosure")).toHaveText("No settlement is posted.");
  const after = await (await request.get("/__test/fixtures")).json();
  expect(after.introductionCount).toBe(before.introductionCount);
  expect(after.linkCount).toBe(before.linkCount);
  expect(after.patientCount).toBe(before.patientCount);
  expect(after.ledgerCount).toBe(0);
});

test("unauthenticated and unsupported-role check-in is refused", async ({ request }) => {
  const missing = await request.post("/app/reception/community-check-in", {
    form: { csrf: "missing", pass_code: "x", clinic_id: CLINIC_A, action: "preview" },
  });
  expect(missing.status()).toBe(401);
  const billing = await request.post("/app/reception/community-check-in", {
    headers: {
      "x-community-test-actor": JSON.stringify({
        staffId: "staff-9", role: "billing", clinicId: CLINIC_A, clinicName: "Clinic A", facilityId: "facility-a",
      }),
    },
    form: { csrf: "missing", pass_code: "x", clinic_id: CLINIC_A, action: "preview" },
  });
  expect(billing.status()).toBe(401);
});
