const { test, expect } = require("@playwright/test");

const AC = "http://activeclinic.pronline.org:4319";
const APEX = "http://blessboard.pronline.org:4321";
test.use({
  launchOptions: {
    args: [
      "--host-resolver-rules=MAP activeclinic.pronline.org 127.0.0.1,MAP blessboard.pronline.org 127.0.0.1",
    ],
  },
});

async function health(url, host) {
  const port = new URL(url).port;
  const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
    headers: { Host: host },
  });
  return { status: response.status, body: await response.json() };
}

test.describe("ActiveClinic two-port cross-product security", () => {
  test("both local QA processes pass safety checks", async () => {
    const [ac, apex] = await Promise.all([
      health(AC, "activeclinic.pronline.org"),
      health(APEX, "blessboard.pronline.org"),
    ]);
    for (const result of [ac, apex]) {
      expect(result.status).toBe(200);
      expect(result.body.environment).toBe("testing");
      expect(result.body.expectedIdentityKey).toBe("moovex-platform-v7");
      expect(result.body.expectedDatabaseEnvironment).toBe("testing");
    }
  });

  test("unauthenticated cross-product controls deny access", async ({ browser }) => {
    const page = await browser.newPage();
    const apex = await page.goto(`${APEX}/admin`);
    expect(apex.status()).toBe(200);
    expect(page.url()).toMatch(/\/login/);
    const apexBody = await page.locator("body").innerText();
    expect(apexBody).not.toMatch(/Platform Administrator|BlessBoard administration/i);

    const api = await page.goto(`${APEX}/api/admin`);
    expect([401, 403, 503]).toContain(api.status());
    await page.close();
  });

  test("ActiveClinic unauthenticated staff control remains protected", async ({ browser }) => {
    const page = await browser.newPage();
    const response = await page.goto(`${AC}/app/patients`);
    expect(response.status()).toBe(200);
    expect(page.url()).toMatch(/\/login/);
    await page.close();
  });
});
