/**
 * Shared ops fetch / CSRF helpers (product-neutral).
 * Used by platform website media field and available to product scripts on-touch.
 * Does not encode BlessBoard or ActiveClinic branding.
 */
(function (global) {
  "use strict";

  var CSRF_FIELD = "_csrf";

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.getAttribute("content")) return String(meta.getAttribute("content"));
    var input = document.querySelector('input[name="' + CSRF_FIELD + '"]');
    return input && input.value ? String(input.value) : "";
  }

  function csrfHeaders(extra) {
    var headers = {
      Accept: "application/json",
      "X-CSRF-Token": csrfToken(),
    };
    if (extra && typeof extra === "object") {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key) && extra[key] != null) {
          headers[key] = extra[key];
        }
      }
    }
    return headers;
  }

  function appendCsrf(formData) {
    if (!formData || typeof formData.append !== "function") return formData;
    formData.append(CSRF_FIELD, csrfToken());
    return formData;
  }

  /**
   * @param {string} url
   * @param {RequestInit & { json?: object }} [options]
   */
  function fetchJson(url, options) {
    var opts = options && typeof options === "object" ? options : {};
    var headers = csrfHeaders(opts.headers || null);
    var init = {
      method: opts.method || (opts.json ? "POST" : "GET"),
      credentials: opts.credentials || "same-origin",
      headers: headers,
    };
    if (opts.body != null) {
      init.body = opts.body;
    } else if (opts.json != null) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.json);
    }
    return fetch(url, init).then(function (res) {
      return res.json().then(
        function (body) {
          return { ok: res.ok, status: res.status, body: body };
        },
        function () {
          return { ok: res.ok, status: res.status, body: null };
        }
      );
    });
  }

  global.GpOpsFetch = {
    CSRF_FIELD: CSRF_FIELD,
    csrfToken: csrfToken,
    csrfHeaders: csrfHeaders,
    appendCsrf: appendCsrf,
    fetchJson: fetchJson,
  };
})(typeof window !== "undefined" ? window : globalThis);
