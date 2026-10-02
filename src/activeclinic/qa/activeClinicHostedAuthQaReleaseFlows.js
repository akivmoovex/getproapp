"use strict";

/**
 * Extra hosted-QA flows for ActiveClinic V7 release readiness.
 * Never logs passwords, cookies, or tokens.
 */

const {
  CSRF_FIELD,
  createHostedClient,
  extractCsrfField,
} = require("./activeClinicHostedAuthQaClient");

const PUBLIC_PATHS = Object.freeze([
  "/",
  "/clinics",
  "/login",
  "/register-clinic",
  "/app",
  "/clinics/activeclinic-demo",
  "/clinics/activeclinic-demo/patient/login",
  "/clinics/activeclinic-demo/patient/register",
]);

function locationPath(location) {
  return String(location || "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0];
}

function isLoginRedirect(res) {
  return (
    res &&
    res.status >= 300 &&
    res.status < 400 &&
    /\/login(\?|$)/i.test(locationPath(res.location))
  );
}

function isOnboardingRedirect(res) {
  return (
    res &&
    res.status >= 300 &&
    res.status < 400 &&
    locationPath(res.location) === "/app/onboarding"
  );
}

function isStaffLandingOk(res) {
  if (!res) return false;
  if (res.status === 200 && /ac-app|data-ac-shell/i.test(res.text || "")) return true;
  return isOnboardingRedirect(res);
}

async function loadStaffLanding(client, followed) {
  if (followed && followed.status === 200) return followed;
  const appPage = await client.get("/app");
  if (appPage.status === 200 || !isOnboardingRedirect(appPage)) return appPage;
  return client.get("/app/onboarding");
}

async function publicSmoke(baseUrl) {
  const origin = String(baseUrl || "").replace(/\/$/, "");
  const routes = [];
  let ok = true;
  for (const path of PUBLIC_PATHS) {
    const client = createHostedClient(origin);
    const res = await client.get(path);
    const failed = res.status >= 500 || res.status === 0;
    if (failed) ok = false;
    routes.push({
      path,
      status: res.status,
      location: locationPath(res.location),
      ok: failed === false,
    });
  }
  const healthClient = createHostedClient(origin);
  const health = await healthClient.get("/healthz");
  let healthz = { status: health.status, ok: false };
  try {
    const body = JSON.parse(health.text || "{}");
    healthz = {
      status: health.status,
      ok: health.status === 200 && body && (body.ok === true || body.status === "ok" || body.healthy === true),
      gitSha: body.gitSha || body.sha || null,
      environment: body.environment || body.environmentCode || null,
      deploymentCode: body.deploymentCode || null,
      schemaCompatible: body.schemaCompatible,
      identityKey: body.identityKey || body.identity_key || null,
    };
  } catch (_err) {
    healthz = { status: health.status, ok: false, parse: "invalid_json" };
  }
  return { ok: ok && healthz.ok !== false, routes, healthz };
}

async function staffLogin(client, fixture) {
  const loginGet = await client.get("/login");
  const csrf = extractCsrfField(loginGet.text) || client.jar.csrf();
  const loginPost = await client.postForm("/login", {
    [CSRF_FIELD]: csrf,
    identifier: fixture.adminEmail,
    password: fixture.password,
  });
  return { loginGet, loginPost };
}

function classifySessionFlake(iterations) {
  const loginRedirects = (iterations || []).filter((row) => row.loginRedirect === true);
  const sidLost = (iterations || []).filter(
    (row) => row.sessionAfterLogin === true && row.sessionAfterOnboarding === false
  );
  const sessionIgnored = (iterations || []).filter(
    (row) => row.loginRedirect === true && row.sessionAfterOnboarding === true
  );
  if (!iterations || iterations.length === 0) {
    return { classification: "NOT_REPRODUCED", reproduced: false, reason: "no_iterations" };
  }
  if (loginRedirects.length === 0) {
    return {
      classification: "NOT_REPRODUCED",
      reproduced: false,
      loginRedirects: 0,
      iterations: iterations.length,
    };
  }
  if (sidLost.length > 0 && sessionIgnored.length === 0) {
    const expireAfterSet = sidLost.some((row) =>
      (row.onboardingSetCookies || []).some((cookie) => /_sid$/i.test(cookie.name) && cookie.expired === true)
    );
    return {
      classification: expireAfterSet ? "HOSTING_RACE" : "QA_CLIENT_DEFECT",
      reproduced: true,
      loginRedirects: loginRedirects.length,
      sidLost: sidLost.length,
      iterations: iterations.length,
      reason: expireAfterSet ? "set_cookie_expire_after_sid" : "session_cookie_missing_on_followup",
    };
  }
  if (sessionIgnored.length > 0) {
    const appCachedSignature = sessionIgnored.filter((row) => {
      const appLogin = isLoginRedirect({
        status: row.appStatus,
        location: row.appLocation,
      });
      return appLogin === true && Number(row.onboardingStatus) === 200;
    });
    if (appCachedSignature.length === sessionIgnored.length) {
      return {
        classification: "HOSTING_RACE",
        reproduced: true,
        loginRedirects: loginRedirects.length,
        sessionPresentButLoginRedirect: sessionIgnored.length,
        iterations: iterations.length,
        reason: "app_login_redirect_while_other_app_routes_succeed",
      };
    }
    return {
      classification: "REAL_SESSION_DEFECT",
      reproduced: true,
      loginRedirects: loginRedirects.length,
      sessionPresentButLoginRedirect: sessionIgnored.length,
      iterations: iterations.length,
    };
  }
  return {
    classification: "OTHER",
    reproduced: true,
    loginRedirects: loginRedirects.length,
    iterations: iterations.length,
  };
}

async function runSessionProbe(baseUrl, fixture, iterations) {
  const origin = String(baseUrl || "").replace(/\/$/, "");
  const count = Math.max(1, Number(iterations) || 12);
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const client = createHostedClient(origin);
    const { loginPost } = await staffLogin(client, fixture);
    const afterLogin = await client.follow(loginPost);
    const appRaw = await client.get("/app");
    const onboardingRaw = await client.get("/app/onboarding");
    const loginRedirect =
      isLoginRedirect(appRaw) ||
      isLoginRedirect(onboardingRaw) ||
      (afterLogin.status === 303 && isLoginRedirect(afterLogin));
    rows.push({
      i: i + 1,
      loginStatus: loginPost.status,
      loginLocation: locationPath(loginPost.location),
      afterLoginStatus: afterLogin.status,
      appStatus: appRaw.status,
      appLocation: locationPath(appRaw.location),
      onboardingStatus: onboardingRaw.status,
      onboardingLocation: locationPath(onboardingRaw.location),
      sessionAfterLogin: loginPost.sessionPresent === true || afterLogin.sessionPresent === true,
      sessionAfterOnboarding: onboardingRaw.sessionPresent === true,
      cookieNames: onboardingRaw.cookieNames,
      loginSetCookies: loginPost.setCookieSummaries || [],
      onboardingSetCookies: onboardingRaw.setCookieSummaries || [],
      loginRedirect,
    });
    await client.get("/logout").catch(() => {});
  }
  const classified = classifySessionFlake(rows);
  return {
    ok: classified.reproduced === false,
    iterations: rows,
    classification: classified.classification,
    reproduced: classified.reproduced === true,
    details: classified,
  };
}

function selectorListsClinic(html, fixture) {
  const text = String(html || "");
  const name = String((fixture && fixture.clinicName) || "");
  const key = String((fixture && fixture.organizationKey) || "");
  const id = String((fixture && fixture.organizationId) || "");
  return (
    (name && text.includes(name)) ||
    (key && text.includes(key)) ||
    (id && text.includes(`value="${id}"`))
  );
}

async function runDualClinicSelector(baseUrl, clinicA, clinicB, foreignOrganizationId, measureOverflow) {
  const origin = String(baseUrl || "").replace(/\/$/, "");
  const checks = {};
  const client = createHostedClient(origin);
  const { loginGet, loginPost } = await staffLogin(client, clinicA);
  checks.selectorAppears = {
    ok: /select-organization/i.test(loginPost.location || ""),
    status: loginPost.status,
    location: locationPath(loginPost.location),
  };
  const selector = /select-organization/i.test(loginPost.location || "")
    ? await client.follow(loginPost)
    : { status: loginPost.status, text: loginPost.text || loginGet.text, location: loginPost.location };
  const html = selector.text || "";
  const listedA = selectorListsClinic(html, clinicA);
  const listedB = selectorListsClinic(html, clinicB);
  const listedDemo = /activeclinic-demo|Juflona/i.test(html);
  checks.bothClinicsListed = { ok: listedA && listedB, listedA, listedB };
  checks.noUnrelatedClinics = { ok: listedDemo === false, listedDemo };
  checks.roleAndLocationCopy = {
    ok: /Organization admin|Organisation admin|Lusaka/i.test(html),
    hasRole: /Organization admin|Organisation admin/i.test(html),
    hasLocation: /Lusaka/i.test(html),
  };

  const csrf = extractCsrfField(html) || client.jar.csrf();
  const chooseA = await client.postForm("/login/select-organization", {
    [CSRF_FIELD]: csrf,
    organization_id: clinicA.organizationId,
  });
  const afterA = await client.follow(chooseA);
  const dashA = await loadStaffLanding(client, afterA);
  checks.chooseClinicA = {
    ok: isStaffLandingOk(dashA) || (dashA.status === 200 && /ac-app|data-ac-shell/i.test(dashA.text || "")),
    status: dashA.status,
    location: locationPath(dashA.location),
  };
  const crossB = await client.get(`/clinics/${clinicB.clinicKey}/website/preview`);
  checks.directUrlCannotBypass = {
    ok: crossB.status === 403 || crossB.status === 404 || isLoginRedirect(crossB),
    status: crossB.status,
    leaked: /Theme customization|Website Management/i.test(crossB.text || "") && crossB.status === 200,
  };

  await client.get("/logout");
  await client.follow({ status: 303, location: "/login" });

  const clientB = createHostedClient(origin);
  const second = await staffLogin(clientB, clinicA);
  const selectorB = await clientB.follow(second.loginPost);
  const chooseB = await clientB.postForm("/login/select-organization", {
    [CSRF_FIELD]: extractCsrfField(selectorB.text) || clientB.jar.csrf(),
    organization_id: clinicB.organizationId,
  });
  const afterB = await clientB.follow(chooseB);
  const dashB = await loadStaffLanding(clientB, afterB);
  checks.chooseClinicB = {
    ok: isStaffLandingOk(dashB) || (dashB.status === 200 && /ac-app|data-ac-shell/i.test(dashB.text || "")),
    status: dashB.status,
    location: locationPath(dashB.location),
  };

  const bypassClient = createHostedClient(origin);
  const bypassLogin = await staffLogin(bypassClient, clinicA);
  await bypassClient.follow(bypassLogin.loginPost);
  const bypass = await bypassClient.postForm("/login/select-organization", {
    [CSRF_FIELD]: extractCsrfField((await bypassClient.get("/login/select-organization")).text) || bypassClient.jar.csrf(),
    organization_id: foreignOrganizationId || "00000000-0000-4000-8000-000000000001",
  });
  checks.membershipBypassDenied = {
    ok: bypass.status === 403 || isLoginRedirect(bypass) || bypass.status === 401,
    status: bypass.status,
  };

  let mobile = { ok: false };
  if (typeof measureOverflow === "function") {
    const mobileClient = createHostedClient(origin);
    const mobileLogin = await staffLogin(mobileClient, clinicA);
    await mobileClient.follow(mobileLogin.loginPost);
    mobile = await measureOverflow(origin, "/login/select-organization", mobileClient.jar.header(), {
      width: 390,
      height: 844,
    });
  }
  checks.mobileSelector = { ok: mobile.ok === true, status: mobile.status, overflow: mobile.overflow };

  const logout = await clientB.get("/logout");
  await clientB.follow(logout);
  const afterLogout = await clientB.get("/app");
  checks.logoutClearsContext = {
    ok: isLoginRedirect(afterLogout) || afterLogout.status === 401,
    status: afterLogout.status,
    sessionCleared: clientB.jar.sessionPresent() === false,
  };

  const ok = Object.values(checks).every((row) => row && row.ok === true);
  return { ok, checks, mobile };
}

module.exports = {
  PUBLIC_PATHS,
  publicSmoke,
  runSessionProbe,
  classifySessionFlake,
  runDualClinicSelector,
  isLoginRedirect,
  isOnboardingRedirect,
  isStaffLandingOk,
  loadStaffLanding,
  locationPath,
};
