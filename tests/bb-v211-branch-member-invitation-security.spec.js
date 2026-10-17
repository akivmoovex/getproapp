"use strict";

const { test, expect } = require("@playwright/test");
const { Pool } = require("pg");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");

test("branch invitation issue, resend and refresh protect one-time secrets", async ({ page }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql:///getpro_v211_test_01?host=/tmp" });
  const suffix = `${process.pid}.${Date.now()}`;
  const email = `v211-playwright-branch-${suffix}@example.invalid`;
  const password = "V211-playwright-password!";
  let userId;
  let memberId;
  try {
    const context = (await pool.query(`
      select c.id church_id,c.organization_id,b.id branch_id
        from blessboard.churches c
        join blessboard.branches b on b.church_id=c.id
          and b.is_primary=true and b.status='active'
       where c.status='active' limit 1
    `)).rows[0];
    expect(context).toBeTruthy();
    const user = await createBlessBoardUser(pool, { email, displayName: "V211 Playwright Branch", password });
    expect(user.ok).toBeTruthy();
    userId = user.user.id;
    await pool.query(`
      insert into blessboard.user_role_assignments
        (user_id,organization_id,church_id,role_id,scope_type,scope_id,status,assignment_origin,assignment_reason)
      select $1,$2,$3,r.id,'branch',$4,'active','manual','V211 Playwright Branch'
        from blessboard.roles r
       where r.role_key='branch_administrator' and r.is_active=true
    `, [userId, context.organization_id, context.church_id, context.branch_id]);
    memberId = (await pool.query(`
      insert into blessboard.members
        (church_id,user_id,first_name,last_name,email_normalized,email_display,status,portal_access_status)
      values ($1,$2,'V211','Branch',$3,$3,'active','not_activated') returning id
    `, [context.church_id, userId, `v211-playwright-branch-member-${suffix}@example.invalid`])).rows[0].id;
    await pool.query(`
      insert into blessboard.member_branch_memberships
        (member_id,branch_id,membership_status,is_primary,joined_at)
      values ($1,$2,'active',true,now())
    `, [memberId, context.branch_id]);

    const externalRequests = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("http://127.0.0.1:4175")) {
        externalRequests.push({ url: request.url(), referrer: request.headers().referer || "" });
      }
    });
    await page.route("**/*", async (route) => route.request().url().startsWith("http://127.0.0.1:4175")
      ? route.continue() : route.abort());

    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/branch-admin(?:\/|$)/);

    const path = `/branch-admin/members/${memberId}/invitation`;
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Issue invitation" })).toBeVisible();
    const issueResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/invitation") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Issue invitation" }).click();
    const issueResponse = await issueResponsePromise;
    expect(issueResponse.status()).toBe(200);
    expect(issueResponse.headers()["cache-control"]).toContain("no-store");
    expect(issueResponse.headers()["referrer-policy"]).toBe("no-referrer");
    const firstLink = await page.locator("textarea[aria-label='Invitation link']").inputValue();
    const firstToken = new URL(firstLink, "http://127.0.0.1:4175").searchParams.get("token");
    expect(firstToken).toBeTruthy();

    await page.goto(path);
    await expect(page.locator("textarea[aria-label='Invitation link']")).toHaveCount(0);
    await expect(page.locator("body")).toContainText("pending");

    const resendResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/invitation") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Resend invitation" }).click();
    const resendResponse = await resendResponsePromise;
    expect(resendResponse.status()).toBe(200);
    expect(resendResponse.headers()["cache-control"]).toContain("no-store");
    expect(resendResponse.headers()["referrer-policy"]).toBe("no-referrer");
    const secondLink = await page.locator("textarea[aria-label='Invitation link']").inputValue();
    const secondToken = new URL(secondLink, "http://127.0.0.1:4175").searchParams.get("token");
    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(firstToken);

    await page.goto(path);
    const html = await page.content();
    expect(html).not.toContain(firstToken);
    expect(html).not.toContain(secondToken);
    const storage = await page.evaluate(async () => ({
      local: Object.keys(localStorage), session: Object.keys(sessionStorage),
      indexedDb: typeof indexedDB === "undefined" ? null : (await indexedDB.databases()).map((db) => db.name),
      caches: typeof caches === "undefined" ? null : await caches.keys(), cookies: document.cookie,
    }));
    const serialized = JSON.stringify(storage);
    expect(serialized).not.toContain(firstToken);
    expect(serialized).not.toContain(secondToken);
    for (const request of externalRequests) {
      expect(request.url).not.toContain(firstToken);
      expect(request.url).not.toContain(secondToken);
      expect(request.referrer).not.toContain(firstToken);
      expect(request.referrer).not.toContain(secondToken);
    }
  } finally {
    if (memberId) await pool.query("delete from blessboard.member_portal_invitations where member_id=$1", [memberId]);
    if (memberId) await pool.query("delete from blessboard.member_branch_memberships where member_id=$1", [memberId]);
    if (memberId) await pool.query("delete from blessboard.members where id=$1", [memberId]);
    if (userId) {
      await pool.query("delete from platform.deployment_sessions where user_id=$1", [userId]);
      await pool.query("delete from blessboard.user_role_assignments where user_id=$1", [userId]);
      await pool.query("delete from blessboard.users where id=$1", [userId]);
    }
    await pool.end();
  }
});
