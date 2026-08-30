(function () {
  "use strict";

  var chrome = document.querySelector("[data-website-chrome]");
  var host = document.querySelector("[data-website-add-section-host]");
  var openBtn = document.querySelector("[data-website-add-section-open]");
  if (!chrome || !host || !openBtn) return;

  var endpoint = chrome.getAttribute("data-website-add-section-url");
  if (!endpoint) return;

  openBtn.hidden = false;
  var panel = host.querySelector("[data-website-add-section-panel]");
  var overlay = host.querySelector("[data-website-add-section-overlay]");
  var list = host.querySelector("[data-website-add-section-list]");
  var empty = host.querySelector("[data-website-add-section-empty]");
  var error = host.querySelector("[data-website-add-section-error]");
  var pageKey = chrome.getAttribute("data-page-key") || "home";
  var busy = false;

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.getAttribute("content")) return meta.getAttribute("content");
    var input = document.querySelector('input[name="_csrf"]');
    return input ? input.value : "";
  }

  function closePicker() {
    host.hidden = true;
    if (panel) panel.hidden = true;
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("gp-website-add-section-open");
  }

  function openPicker() {
    host.hidden = false;
    if (panel) panel.hidden = false;
    if (overlay) overlay.hidden = false;
    document.body.classList.add("gp-website-add-section-open");
    loadTypes();
  }

  function renderTypes(items) {
    if (!list) return;
    list.innerHTML = "";
    var types = Array.isArray(items) ? items : [];
    if (!types.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    types.forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gp-website-add-section__option";
      btn.setAttribute("data-website-add-section-type", item.type);
      btn.innerHTML =
        "<strong>" +
        (item.label || item.type) +
        "</strong><span>" +
        (item.description || "") +
        (item.singleton ? " (one per page)" : "") +
        "</span>";
      btn.addEventListener("click", function () {
        addSection(item.type);
      });
      list.appendChild(btn);
    });
  }

  function loadTypes() {
    if (busy) return;
    busy = true;
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    fetch(endpoint.replace(/\/add-section$/, "/add-section/types") + "?pageKey=" + encodeURIComponent(pageKey), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.body || !result.body.ok) {
          throw new Error((result.body && result.body.code) || "load_failed");
        }
        renderTypes(result.body.sections || []);
      })
      .catch(function (err) {
        if (error) {
          error.hidden = false;
          error.textContent = "Could not load section types.";
        }
      })
      .finally(function () {
        busy = false;
      });
  }

  function addSection(type) {
    if (busy) return;
    busy = true;
    var payload = {
      pageKey: pageKey,
      type: type,
      _csrf: csrfToken(),
    };
    fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken(),
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.body || !result.body.ok) {
          throw new Error((result.body && result.body.code) || "add_failed");
        }
        closePicker();
        window.location.reload();
      })
      .catch(function () {
        if (error) {
          error.hidden = false;
          error.textContent = "Could not add that section.";
        }
      })
      .finally(function () {
        busy = false;
      });
  }

  openBtn.addEventListener("click", openPicker);
  host.addEventListener("click", function (event) {
    if (event.target.closest("[data-website-add-section-dismiss]") || event.target === overlay) {
      event.preventDefault();
      closePicker();
    }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !host.hidden) closePicker();
  });
})();
