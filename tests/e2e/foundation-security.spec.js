"use strict";

const {
  test,
  expect,
  newHostContext,
  expectTestingDatabaseIdentity,
  PLATFORM_HOST,
  tenantHost,
} = require("./fixtures.cjs");
const {
  platformLogin,
  portalLogin,
  expectDeniedOrGone,
  seedSiblingBranchAndLeader,
  seedUnrelatedTenant,
  seedForeignIdorFixtures,
  uniquePhone,
} = require("./helpers.cjs");

test.describe.configure({ mode: "serial" });

test.describe("Foundation release security E2E", () => {
  test("1) platform provision Foundation org and tenant admin login", async ({
    browser,
    baseURL,
    e2eState,
    shared,
    db,
  }) => {
    await expectTestingDatabaseIdentity(db);

    const slug = `${e2eState.slugPrefix}-main`.replace(/[^a-z0-9-]/gi, "-").slice(0, 40);
    const hqPassword = "HqTemp_pass_2026!";
    const baPassword = "BaTemp_pass_2026!";
    const hqEmail = `hq_${slug}@example.com`;
    const baEmail = `ba_${slug}@example.com`;

    const platform = await newHostContext(browser, e2eState.platformHost || PLATFORM_HOST, {
      baseURL,
    });
    const page = await platform.newPage();

    await platformLogin(page, e2eState.adminUsername, e2eState.adminPassword);
    await page.goto("/admin/churches/new");
    await expect(page.getByRole("heading", { name: /Initialize Organization/i })).toBeVisible();

    await page.locator("#organization_name").fill(`E2E Foundation ${slug}`);
    await page.locator("#organization_slug").fill(slug);
    await page.locator("#country").fill("Zambia");
    await page.locator("#city").fill("Lusaka");
    await page.locator("#plan_code").selectOption("foundation");

    await page.locator("#branch_name").fill(`Main Branch ${slug}`);
    await page.locator("#branch_host_slug").fill(slug);
    await page.locator("#branch_city").fill("Lusaka");
    await page.locator("#pastor_name").fill("Rev. E2E");

    await page.locator("#hq_full_name").fill(`HQ Admin ${slug}`);
    await page.locator("#hq_email").fill(hqEmail);
    await page.locator("#hq_phone").fill(uniquePhone(11));
    await page.locator("#hq_temporary_password").fill(hqPassword);

    await page.locator("#branch_admin_full_name").fill(`Branch Admin ${slug}`);
    await page.locator("#branch_admin_email").fill(baEmail);
    await page.locator("#branch_admin_phone").fill(uniquePhone(22));
    await page.locator("#branch_admin_temporary_password").fill(baPassword);

    await Promise.all([
      page.waitForURL(/\/admin\/churches\/\d+/),
      page.getByRole("button", { name: "Create Organization" }).click(),
    ]);

    await expect(page.getByText(/provisioned successfully/i)).toBeVisible();
    await expect(page.getByText(/Foundation/i).first()).toBeVisible();
    await expect(page.locator("dt", { hasText: "Branches" }).locator("xpath=following-sibling::dd[1]")).toHaveText(
      "1"
    );
    await expect(
      page.locator("dt", { hasText: "Members (verified / total)" }).locator("xpath=following-sibling::dd[1]")
    ).toHaveText("0 / 0");
    await expect(page.getByText(new RegExp(`${slug}\\.local\\.test`))).toBeVisible();

    const orgMatch = page.url().match(/\/admin\/churches\/(\d+)/);
    expect(orgMatch).toBeTruthy();
    const organizationId = Number(orgMatch[1]);

    await page.goto("/admin/churches");
    await expect(page.getByText(`E2E Foundation ${slug}`)).toBeVisible();
    await page.goto(`/admin/churches/${organizationId}`);
    await expect(page.locator("dt", { hasText: "Plan" }).locator("xpath=following-sibling::dd[1]")).toContainText(
      /Foundation/i
    );

    const branchRow = await db.query(
      `SELECT id, host_slug, name FROM public.church_branches WHERE organization_id = $1 ORDER BY id ASC LIMIT 1`,
      [organizationId]
    );
    expect(branchRow.rows).toHaveLength(1);
    expect(branchRow.rows[0].host_slug).toBe(slug);

    const packageRow = await db.query(
      `SELECT plan_code, status FROM public.church_organizations WHERE id = $1`,
      [organizationId]
    );
    expect(packageRow.rows[0].plan_code).toBe("foundation");
    expect(packageRow.rows[0].status).toBe("active");

    Object.assign(shared, {
      organizationId,
      organizationSlug: slug,
      branchId: branchRow.rows[0].id,
      hostSlug: slug,
      tenantHost: tenantHost(slug),
      hqEmail,
      hqPassword,
      baEmail,
      baPassword,
      memberEmail: `member_${slug}@example.com`,
      memberPassword: "Member_pass_2026!",
      memberFullName: `Visitor ${slug}`,
    });

    await platform.close();

    const tenant = await newHostContext(browser, shared.tenantHost, { baseURL });
    const baPage = await tenant.newPage();
    await portalLogin(baPage, "/branch/login", baEmail, baPassword, "/branch/dashboard");
    await expect(baPage.getByRole("heading", { name: /dashboard/i }).first()).toBeVisible();

    const hqPage = await tenant.newPage();
    await portalLogin(hqPage, "/hq/login", hqEmail, hqPassword, "/hq/dashboard");
    await expect(hqPage.getByRole("heading", { name: /dashboard/i }).first()).toBeVisible();
    await tenant.close();
  });

  test("2) visitor registration, branch verify, member login, usage 1", async ({
    browser,
    baseURL,
    e2eState,
    shared,
    db,
  }) => {
    await expectTestingDatabaseIdentity(db);
    expect(shared.tenantHost).toBeTruthy();

    const visitor = await newHostContext(browser, shared.tenantHost, { baseURL });
    const page = await visitor.newPage();
    await page.goto("/register");
    await expect(page.locator("[data-auth-screen='register']")).toBeVisible();

    await page.locator("#full_name").fill(shared.memberFullName);
    await page.locator("#phone").fill(uniquePhone(shared.organizationId));
    await page.locator("#email").fill(shared.memberEmail);
    await page.locator("input[name='gender'][value='female']").check();
    await page.locator("#age_group").selectOption("Young Adult (20-35)");
    await page.locator("#address_area").fill("E2E Test Area");
    await page.locator("#attendance_duration").selectOption("Less than 6 months");
    await page.locator("#emergency_contact_name").fill("Emergency Contact");
    await page.locator("#emergency_contact_phone").fill(uniquePhone(shared.organizationId + 1));
    await page.locator("#password").fill(shared.memberPassword);
    await page.locator("#confirm_password").fill(shared.memberPassword);
    await page.locator("input[name='accept_terms']").check();

    await Promise.all([
      page.waitForURL(/\/registration-submitted/),
      page.getByRole("button", { name: "Submit Registration" }).click(),
    ]);
    await visitor.close();

    const pending = await db.query(
      `SELECT id, status FROM public.church_members
        WHERE organization_id = $1 AND lower(email) = lower($2)`,
      [shared.organizationId, shared.memberEmail]
    );
    expect(pending.rows[0]?.status).toBe("pending");
    shared.memberId = pending.rows[0].id;

    const baCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const baPage = await baCtx.newPage();
    await portalLogin(baPage, "/branch/login", shared.baEmail, shared.baPassword, "/branch/dashboard");
    await baPage.goto("/branch/member-verification");
    await expect(baPage.getByRole("heading", { name: /Member Verification Queue/i })).toBeVisible();
    await baPage.getByRole("link", { name: new RegExp(`(Review|View) ${shared.memberFullName}`) }).first().click();
    await expect(baPage).toHaveURL(new RegExp(`/branch/members/${shared.memberId}`));
    await baPage.getByRole("button", { name: "Approve" }).click();
    await expect
      .poll(async () => {
        const row = await db.query(`SELECT status FROM public.church_members WHERE id = $1`, [
          shared.memberId,
        ]);
        return row.rows[0]?.status;
      })
      .toBe("verified");
    await expect(baPage.getByText(/verified/i).first()).toBeVisible();

    await baPage.goto("/branch/account");
    await expect(baPage.getByText(/Active members/i)).toBeVisible();
    await expect(baPage.locator("dt", { hasText: "Active members" }).locator("xpath=following-sibling::dd[1]")).toContainText(
      /^1\b|1\s*\//
    );
    await baCtx.close();

    const memberCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const memberPage = await memberCtx.newPage();
    await portalLogin(memberPage, "/login", shared.memberEmail, shared.memberPassword, "/member/dashboard");
    await expect(memberPage.getByRole("heading", { name: /dashboard|welcome/i }).first()).toBeVisible();
    await memberCtx.close();

    const platform = await newHostContext(browser, e2eState.platformHost || PLATFORM_HOST, {
      baseURL,
    });
    const adminPage = await platform.newPage();
    await platformLogin(adminPage, e2eState.adminUsername, e2eState.adminPassword);
    await adminPage.goto(`/admin/churches/${shared.organizationId}`);
    await expect(
      adminPage.locator("dt", { hasText: "Members (verified / total)" }).locator("xpath=following-sibling::dd[1]")
    ).toHaveText("1 / 1");
    await platform.close();
  });

  test("3) self-service password change restamps mutation session and revokes peer", async ({
    browser,
    baseURL,
    shared,
    db,
  }) => {
    await expectTestingDatabaseIdentity(db);
    const oldPassword = shared.baPassword;
    const newPassword = "BaChanged_pass_2026!";

    const staleCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const stalePage = await staleCtx.newPage();
    await portalLogin(stalePage, "/branch/login", shared.baEmail, oldPassword, "/branch/dashboard");

    const mutateCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const mutatePage = await mutateCtx.newPage();
    await portalLogin(mutatePage, "/branch/login", shared.baEmail, oldPassword, "/branch/dashboard");
    await mutatePage.goto("/branch/account");
    await mutatePage.locator("#current_password").fill(oldPassword);
    await mutatePage.locator("#new_password").fill(newPassword);
    await mutatePage.locator("#confirm_password").fill(newPassword);
    await Promise.all([
      mutatePage.waitForURL(/notice=password_changed/),
      mutatePage.getByRole("button", { name: "Save new password" }).click(),
    ]);
    await expect(mutatePage.getByText(/password updated|password changed/i).first()).toBeVisible();

    await mutatePage.goto("/branch/dashboard");
    await expect(mutatePage).toHaveURL(/\/branch\/dashboard/);
    await expect(mutatePage.getByRole("heading", { name: /dashboard/i }).first()).toBeVisible();

    await stalePage.goto("/branch/dashboard");
    await expect(stalePage).toHaveURL(/\/branch\/login/);

    const failLogin = await newHostContext(browser, shared.tenantHost, { baseURL });
    const failPage = await failLogin.newPage();
    await failPage.goto("/branch/login");
    await failPage.locator("#identifier").fill(shared.baEmail);
    await failPage.locator("#password").fill(oldPassword);
    await failPage.getByRole("button", { name: /^Login$/i }).click();
    await expect(failPage).toHaveURL(/\/branch\/login/);
    await expect(failPage.getByRole("alert").or(failPage.locator(".church-alert--error"))).toBeVisible();
    await failLogin.close();

    const okLogin = await newHostContext(browser, shared.tenantHost, { baseURL });
    const okPage = await okLogin.newPage();
    await portalLogin(okPage, "/branch/login", shared.baEmail, newPassword, "/branch/dashboard");
    await okLogin.close();

    shared.baPassword = newPassword;
    await staleCtx.close();
    await mutateCtx.close();
  });

  test("4) org suspend rejects tenant sessions; unrelated tenant ok; reactivate + fresh login", async ({
    browser,
    baseURL,
    e2eState,
    shared,
    db,
  }) => {
    await expectTestingDatabaseIdentity(db);

    if (!shared.unrelated) {
      shared.unrelated = await seedUnrelatedTenant(db, e2eState.slugPrefix);
    }

    const memberCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const memberPage = await memberCtx.newPage();
    await portalLogin(memberPage, "/login", shared.memberEmail, shared.memberPassword, "/member/dashboard");

    const baCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const baPage = await baCtx.newPage();
    await portalLogin(baPage, "/branch/login", shared.baEmail, shared.baPassword, "/branch/dashboard");

    const hqCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const hqPage = await hqCtx.newPage();
    await portalLogin(hqPage, "/hq/login", shared.hqEmail, shared.hqPassword, "/hq/dashboard");

    const platform = await newHostContext(browser, e2eState.platformHost || PLATFORM_HOST, {
      baseURL,
    });
    const adminPage = await platform.newPage();
    await platformLogin(adminPage, e2eState.adminUsername, e2eState.adminPassword);
    await adminPage.goto(`/admin/churches/${shared.organizationId}/suspend`);
    await adminPage.locator("#org_suspend_reason").fill("E2E org suspension for release suite");
    await Promise.all([
      adminPage.waitForURL(new RegExp(`/admin/(churches|church/organizations)/${shared.organizationId}`)),
      adminPage.getByRole("button", { name: "Confirm suspend organization" }).click(),
    ]);

    const orgStatus = await db.query(`SELECT status, status_reason FROM public.church_organizations WHERE id = $1`, [
      shared.organizationId,
    ]);
    expect(orgStatus.rows[0].status).toBe("suspended");
    expect(orgStatus.rows[0].status_reason).toMatch(/E2E org suspension/i);

    for (const [page, target] of [
      [memberPage, "/member/dashboard"],
      [baPage, "/branch/dashboard"],
      [hqPage, "/hq/dashboard"],
    ]) {
      const res = await page.goto(target);
      expect(res.status()).toBe(503);
      await expect(page.getByText(/temporarily unavailable|suspended/i).first()).toBeVisible();
    }

    const unrelatedCtx = await newHostContext(browser, shared.unrelated.host, { baseURL });
    const unrelatedPage = await unrelatedCtx.newPage();
    await portalLogin(
      unrelatedPage,
      "/branch/login",
      shared.unrelated.branchAdmin.email,
      shared.unrelated.branchAdmin.password,
      "/branch/dashboard"
    );
    await unrelatedCtx.close();

    await adminPage.goto(`/admin/churches/${shared.organizationId}`);
    await adminPage.locator("#org_reactivate_reason").fill("E2E reactivation after hold");
    await Promise.all([
      adminPage.waitForURL(new RegExp(`/admin/(churches|church/organizations)/${shared.organizationId}`)),
      adminPage.getByRole("button", { name: "Reactivate organization" }).click(),
    ]);
    const restored = await db.query(`SELECT status FROM public.church_organizations WHERE id = $1`, [
      shared.organizationId,
    ]);
    expect(restored.rows[0].status).toBe("active");
    await platform.close();

    await memberCtx.close();
    await baCtx.close();
    await hqCtx.close();

    const fresh = await newHostContext(browser, shared.tenantHost, { baseURL });
    const freshBa = await fresh.newPage();
    await portalLogin(freshBa, "/branch/login", shared.baEmail, shared.baPassword, "/branch/dashboard");
    await fresh.close();
  });

  test("5) suspend one branch; branch sessions rejected; HQ and sibling branch remain", async ({
    browser,
    baseURL,
    e2eState,
    shared,
    db,
  }) => {
    await expectTestingDatabaseIdentity(db);

    if (!shared.sibling) {
      shared.sibling = await seedSiblingBranchAndLeader(db, shared, e2eState.slugPrefix);
    }

    const leaderCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const leaderPage = await leaderCtx.newPage();
    await portalLogin(
      leaderPage,
      "/leader/login",
      shared.sibling.ministryLeader.email,
      shared.sibling.ministryLeader.password,
      "/leader/dashboard"
    );

    const memberCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const memberPage = await memberCtx.newPage();
    await portalLogin(memberPage, "/login", shared.memberEmail, shared.memberPassword, "/member/dashboard");

    const baCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const baPage = await baCtx.newPage();
    await portalLogin(baPage, "/branch/login", shared.baEmail, shared.baPassword, "/branch/dashboard");

    const hqCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const hqPage = await hqCtx.newPage();
    await portalLogin(hqPage, "/hq/login", shared.hqEmail, shared.hqPassword, "/hq/dashboard");

    const siblingHost = tenantHost(shared.sibling.siblingBranch.host_slug);
    const sibCtx = await newHostContext(browser, siblingHost, { baseURL });
    const sibPage = await sibCtx.newPage();
    await portalLogin(
      sibPage,
      "/branch/login",
      shared.sibling.siblingBranchAdmin.email,
      shared.sibling.siblingBranchAdmin.password,
      "/branch/dashboard"
    );

    const platform = await newHostContext(browser, e2eState.platformHost || PLATFORM_HOST, {
      baseURL,
    });
    const adminPage = await platform.newPage();
    await platformLogin(adminPage, e2eState.adminUsername, e2eState.adminPassword);
    await adminPage.goto(`/admin/church/branches/${shared.branchId}`);
    await adminPage.locator("#branch_suspend_reason").fill("E2E branch facility hold");
    await Promise.all([
      adminPage.waitForURL(new RegExp(`/admin/church/branches/${shared.branchId}`)),
      adminPage.getByRole("button", { name: "Suspend branch" }).click(),
    ]);
    await platform.close();

    const branchStatus = await db.query(`SELECT status FROM public.church_branches WHERE id = $1`, [
      shared.branchId,
    ]);
    expect(branchStatus.rows[0].status).toBe("suspended");

    for (const [page, path] of [
      [memberPage, "/member/dashboard"],
      [baPage, "/branch/dashboard"],
      [leaderPage, "/leader/dashboard"],
    ]) {
      const res = await page.goto(path);
      expect(res.status()).toBe(503);
    }

    const hqRes = await hqPage.goto("/hq/dashboard");
    expect(hqRes.status()).toBe(200);
    await expect(hqPage.getByRole("heading", { name: /dashboard/i }).first()).toBeVisible();

    const sibRes = await sibPage.goto("/branch/dashboard");
    expect(sibRes.status()).toBe(200);

    await leaderCtx.close();
    await memberCtx.close();
    await baCtx.close();
    await hqCtx.close();
    await sibCtx.close();
  });

  test("6) cross-tenant IDOR denied without foreign data leakage", async ({
    browser,
    baseURL,
    e2eState,
    shared,
    db,
  }) => {
    await expectTestingDatabaseIdentity(db);

    // Reactivate primary branch so branch-admin can authenticate for IDOR probes.
    await db.query(
      `UPDATE public.church_branches
          SET status = 'active', status_reason = NULL, suspended_at = NULL, updated_at = now()
        WHERE id = $1`,
      [shared.branchId]
    );
    await db.query(
      `UPDATE public.church_branch_admins SET security_version = security_version + 1 WHERE branch_id = $1`,
      [shared.branchId]
    );
    await db.query(
      `UPDATE public.church_members SET security_version = security_version + 1 WHERE branch_id = $1`,
      [shared.branchId]
    );

    if (!shared.foreign) {
      shared.foreign = await seedForeignIdorFixtures(db, e2eState.slugPrefix);
    }
    const fx = shared.foreign;

    const baCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const baPage = await baCtx.newPage();
    await portalLogin(baPage, "/branch/login", shared.baEmail, shared.baPassword, "/branch/dashboard");

    const csrfPage = await baPage.goto("/branch/attendance/check-in");
    expect(csrfPage.status()).toBe(200);
    const csrf = await baPage.locator('input[name="_csrf"]').first().inputValue();

    const probes = [
      { method: "get", path: `/branch/members/${fx.member.id}` },
      { method: "get", path: `/branch/announcements/${fx.announcement.id}` },
      {
        method: "get",
        path: `/branch/announcements/${fx.announcement.id}/attachments/${fx.attachment.id}/download`,
      },
      {
        method: "post",
        path: `/branch/attendance/check-in/sessions/${fx.attendanceSession.id}/close`,
        form: { _csrf: csrf },
        headers: { Accept: "application/json" },
      },
      { method: "get", path: `/branch/attendance/${fx.attendanceRecord.id}` },
      { method: "get", path: `/branch/reports/${fx.monthlyReport.id}` },
    ];

    for (const probe of probes) {
      const response =
        probe.method === "post"
          ? await baPage.request.post(probe.path, {
              form: probe.form || {},
              headers: {
                "X-Forwarded-Host": shared.tenantHost,
                "X-Forwarded-Proto": "http",
                ...(probe.headers || {}),
              },
              maxRedirects: 0,
            })
          : await baPage.request.get(probe.path, {
              headers: {
                "X-Forwarded-Host": shared.tenantHost,
                "X-Forwarded-Proto": "http",
                ...(probe.headers || {}),
              },
              maxRedirects: 0,
            });
      await expectDeniedOrGone(response);
      const body = await response.text();
      for (const marker of fx.secretMarkers) {
        expect(body).not.toContain(marker);
      }
    }

    // HQ-authenticated probe for branch registry IDOR
    const hqCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const hqPage = await hqCtx.newPage();
    await portalLogin(hqPage, "/hq/login", shared.hqEmail, shared.hqPassword, "/hq/dashboard");
    const hqBranch = await hqPage.request.get(`/hq/branches/${fx.branch.id}`, {
      headers: {
        "X-Forwarded-Host": shared.tenantHost,
        "X-Forwarded-Proto": "http",
      },
    });
    await expectDeniedOrGone(hqBranch);
    expect(await hqBranch.text()).not.toContain("Foreign Main");

    await baCtx.close();
    await hqCtx.close();
  });

  test("7) Foundation scheduled reports/broadcasts denied; ordinary routes work", async ({
    browser,
    baseURL,
    shared,
    db,
  }) => {
    await expectTestingDatabaseIdentity(db);

    const baCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const baPage = await baCtx.newPage();
    await portalLogin(baPage, "/branch/login", shared.baEmail, shared.baPassword, "/branch/dashboard");

    await baPage.goto("/branch/scheduled-reports");
    await expect(baPage.getByText(/Growth|upgrade|not included|scheduled reports/i).first()).toBeVisible();

    const schedulePost = await baPage.request.post("/branch/scheduled-reports", {
      form: {
        report_type: "branch_monthly_summary",
        export_format: "csv",
        frequency: "monthly",
        timezone: "UTC",
        delivery_time_local: "09:00",
        day_of_month: "1",
      },
      headers: {
        "X-Forwarded-Host": shared.tenantHost,
        "X-Forwarded-Proto": "http",
      },
      maxRedirects: 0,
    });
    expect([403, 400, 409]).toContain(schedulePost.status());

    await baPage.goto("/branch/dashboard");
    await expect(baPage).toHaveURL(/\/branch\/dashboard/);
    await baPage.goto("/branch/members");
    await expect(baPage.getByRole("heading", { name: /members/i }).first()).toBeVisible();
    await baCtx.close();

    const hqCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const hqPage = await hqCtx.newPage();
    await portalLogin(hqPage, "/hq/login", shared.hqEmail, shared.hqPassword, "/hq/dashboard");
    await hqPage.goto("/hq/scheduled-broadcasts");
    await expect(hqPage.getByText(/Growth|upgrade|not included|scheduled broadcast/i).first()).toBeVisible();

    const future = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const publishAt = future.toISOString().slice(0, 16);
    const broadcastPost = await hqPage.request.post("/hq/broadcasts", {
      multipart: {
        title: "E2E scheduled attempt",
        body: "Should be denied on Foundation",
        audience: "all_members",
        priority: "normal",
        publish_at: publishAt,
      },
      headers: {
        "X-Forwarded-Host": shared.tenantHost,
        "X-Forwarded-Proto": "http",
      },
      maxRedirects: 0,
    });
    expect([403, 400, 409, 302, 303]).toContain(broadcastPost.status());
    if ([302, 303].includes(broadcastPost.status())) {
      const loc = String(broadcastPost.headers().location || "");
      expect(loc).not.toMatch(/notice=.*created|scheduled/i);
    }

    await hqPage.goto("/hq/dashboard");
    await expect(hqPage).toHaveURL(/\/hq\/dashboard/);
    await hqCtx.close();
  });

  test("8) basic attendance session + report reflects recorded member", async ({
    browser,
    baseURL,
    shared,
    db,
  }) => {
    await expectTestingDatabaseIdentity(db);

    const baCtx = await newHostContext(browser, shared.tenantHost, { baseURL });
    const baPage = await baCtx.newPage();
    await portalLogin(baPage, "/branch/login", shared.baEmail, shared.baPassword, "/branch/dashboard");

    const today = new Date().toISOString().slice(0, 10);
    await baPage.goto("/branch/attendance/check-in");
    await expect(baPage.getByRole("heading", { name: /Service check-in/i })).toBeVisible();
    await baPage.locator("#attendance_type").selectOption("Sunday service");
    await baPage.locator("#service_name").fill("E2E Morning Service");
    await baPage.locator("#session_date").fill(today);
    await Promise.all([
      baPage.waitForURL(/\/branch\/attendance\/check-in/),
      baPage.getByRole("button", { name: "Open session" }).click(),
    ]);
    await expect(baPage.getByText(/Active session|E2E Morning Service/i).first()).toBeVisible();

    await baPage.locator("#member_id").selectOption(String(shared.memberId));
    await Promise.all([
      baPage.waitForURL(/\/branch\/attendance\/check-in/),
      baPage.getByRole("button", { name: "Check in member" }).click(),
    ]);
    await expect(baPage.getByText(new RegExp(shared.memberFullName, "i")).first()).toBeVisible();

    await baPage.getByRole("button", { name: "Close session" }).click();
    await expect(baPage.getByRole("heading", { name: /Service check-in/i })).toBeVisible();

    await baPage.goto(`/branch/attendance/check-in/report?from=${today}&to=${today}`);
    await expect(baPage.getByText(new RegExp(shared.memberFullName, "i")).or(baPage.getByText(/1/)).first()).toBeVisible();

    await baPage.goto("/branch/attendance");
    await baPage.locator("#attendance_type").selectOption("Sunday service");
    await baPage.locator("#service_name").fill("E2E Submitted Headcount");
    await baPage.locator("#attendance_date").fill(today);
    await baPage.locator("#adults_count").fill("1");
    await Promise.all([
      baPage.waitForURL(/\/branch\/attendance/),
      baPage.getByRole("button", { name: "Submit record" }).click(),
    ]);
    await expect(baPage.getByText(/E2E Submitted Headcount/i)).toBeVisible();

    await baPage.goto(`/branch/reports/basic?date_from=${today}&date_to=${today}`);
    await expect(baPage.getByRole("heading", { name: /basic report|reports/i }).first()).toBeVisible();
    await expect(baPage.getByText(/Monthly attendance|attendance/i).first()).toBeVisible();
    const reportText = await baPage.locator("main, .church-branch-shell, body").innerText();
    expect(reportText).toMatch(/1/);

    await baCtx.close();
  });
});
