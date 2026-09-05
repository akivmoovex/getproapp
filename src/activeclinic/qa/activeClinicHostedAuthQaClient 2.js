"use strict";

/**
 * Cookie-aware HTTPS client for hosted ActiveClinic QA. Never logs cookie values.
 */

const { CSRF_FIELD } = require("../../platform/http/v5Csrf");

const SESSION_COOKIE = "activeclinic_pronline_sid";
const CSRF_COOKIE = "activeclinic_pronline_csrf";

class CookieJar {
  constructor() {
    this.map = new Map();
    this.flags = new Map();
  }

  absorb(setCookieHeaders) {
    const headers = [].concat(setCookieHeaders || []);
    const lastByName = new Map();
    for (const raw of headers) {
      const text = String(raw);
      const part = text.split(";")[0];
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!name) continue;
      lastByName.set(name, { value, text });
    }
    for (const [name, parsed] of lastByName.entries()) {
      const expired =
        !parsed.value ||
        /;\s*Max-Age=0(?:;|$)/i.test(parsed.text) ||
        /Expires=Thu, 01 Jan 1970/i.test(parsed.text);
      if (expired) {
        this.map.delete(name);
        this.flags.delete(name);
        continue;
      }
      this.map.set(name, parsed.value);
      this.flags.set(name, {
        name,
        secure: /;\s*Secure/i.test(parsed.text),
        httpOnly: /;\s*HttpOnly/i.test(parsed.text),
        sameSite: ((parsed.text.match(/;\s*SameSite=([^;]+)/i) || [])[1] || "").trim(),
      });
    }
  }

  header() {
    return Array.from(this.map.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  has(name) {
    return this.map.has(name);
  }

  names() {
    return Array.from(this.map.keys()).sort();
  }

  flagSummaries() {
    return this.names().map((name) => this.flags.get(name) || { name });
  }

  csrf() {
    const named = this.map.get(CSRF_COOKIE);
    if (named) return named;
    for (const name of this.names()) {
      if (/_csrf$/i.test(name) && !/blessboard/i.test(name)) return this.map.get(name) || "";
    }
    return "";
  }

  sessionPresent() {
    return this.names().some((name) => /_sid$/i.test(name) && !/blessboard/i.test(name));
  }

  clearSession() {
    for (const name of this.names()) {
      if (/_sid$/i.test(name)) {
        this.map.delete(name);
        this.flags.delete(name);
      }
    }
  }
}

function summarizeSetCookie(raw) {
  const text = String(raw || "");
  const part = text.split(";")[0];
  const eq = part.indexOf("=");
  const name = eq > 0 ? part.slice(0, eq).trim() : "";
  const value = eq > 0 ? part.slice(eq + 1).trim() : "";
  return {
    name,
    hasValue: Boolean(value),
    expired:
      !value ||
      /;\s*Max-Age=0(?:;|$)/i.test(text) ||
      /Expires=Thu, 01 Jan 1970/i.test(text),
    secure: /;\s*Secure/i.test(text),
    httpOnly: /;\s*HttpOnly/i.test(text),
    sameSite: ((text.match(/;\s*SameSite=([^;]+)/i) || [])[1] || "").trim(),
  };
}
function extractCsrfField(html) {
  const match = String(html || "").match(
    new RegExp(`name=["']${CSRF_FIELD}["'][^>]*value=["']([^"']+)["']`, "i")
  );
  if (match) return match[1];
  const alt = String(html || "").match(
    new RegExp(`value=["']([^"']+)["'][^>]*name=["']${CSRF_FIELD}["']`, "i")
  );
  return alt ? alt[1] : "";
}

function extractMatch(html, re) {
  const m = String(html || "").match(re);
  return m ? m[1] : "";
}

/**
 * @param {string} baseUrl
 */
function createHostedClient(baseUrl) {
  const origin = String(baseUrl || "").replace(/\/$/, "");
  const jar = new CookieJar();

  async function request(method, path, opts) {
    const options = opts || {};
    const url = path.startsWith("http") ? path : `${origin}${path}`;
    const headers = {
      "User-Agent": "ActiveClinicHostedAuthQa/1.0",
      Accept: "text/html,application/xhtml+xml",
      Origin: origin,
      ...(options.headers || {}),
    };
    const cookie = jar.header();
    if (cookie) headers.Cookie = cookie;
    const init = {
      method,
      headers,
      redirect: "manual",
    };
    if (options.body != null) {
      init.body = options.body;
    }
    const res = await fetch(url, init);
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
          ? [res.headers.get("set-cookie")]
          : [];
    jar.absorb(setCookies);
    const location = res.headers.get("location") || "";
    let text = "";
    const contentType = res.headers.get("content-type") || "";
    if (/text|json|html/i.test(contentType) || res.status >= 400) {
      text = await res.text();
    } else {
      await res.arrayBuffer();
    }
    return {
      status: res.status,
      location,
      text,
      cookieNames: jar.names(),
      sessionPresent: jar.sessionPresent(),
      setCookieSummaries: setCookies.map(summarizeSetCookie),
      authDecision: {
        guard: res.headers.get("x-ac-auth-guard") || "",
        reason: res.headers.get("x-ac-auth-reason") || "",
        decision: res.headers.get("x-ac-auth-decision") || "",
        cookiePresent: res.headers.get("x-ac-cookie-present") || "",
        session: res.headers.get("x-ac-session") || "",
      },
    };
  }

  async function get(path) {
    return request("GET", path);
  }

  async function postForm(path, fields) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields || {})) {
      if (value == null) continue;
      body.set(key, String(value));
    }
    const referer = path.startsWith("http") ? path : `${origin}${path}`;
    return request("POST", path, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: referer,
      },
      body: body.toString(),
    });
  }

  async function follow(res) {
    if (res.status >= 300 && res.status < 400 && res.location) {
      const loc = res.location.startsWith("http")
        ? res.location.replace(origin, "")
        : res.location;
      return get(loc);
    }
    return res;
  }

  return { origin, jar, get, postForm, follow, extractCsrfField, extractMatch };
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  CSRF_FIELD,
  CookieJar,
  extractCsrfField,
  extractMatch,
  summarizeSetCookie,
  createHostedClient,
};
