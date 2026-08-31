"use strict";

/**
 * V7 shared auth UI — identifier mode tabs (Email | Phone).
 */
(function () {
  function initIdentifierTabs(root) {
    var tabs = root.querySelectorAll('[data-gp-auth-id-tab]');
    var panels = root.querySelectorAll("[data-gp-auth-id-panel]");
    if (!tabs.length || !panels.length) return;

    function activate(mode) {
      tabs.forEach(function (tab) {
        var selected = tab.getAttribute("data-gp-auth-id-tab") === mode;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
      });
      panels.forEach(function (panel) {
        var show = panel.getAttribute("data-gp-auth-id-panel") === mode;
        panel.hidden = !show;
      });
      var hidden = root.querySelector('input[name="login_mode"]');
      if (hidden) hidden.value = mode;
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        activate(tab.getAttribute("data-gp-auth-id-tab"));
      });
      tab.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        var list = Array.prototype.slice.call(tabs);
        var idx = list.indexOf(tab);
        var next = event.key === "ArrowRight" ? idx + 1 : idx - 1;
        if (next < 0) next = list.length - 1;
        if (next >= list.length) next = 0;
        list[next].focus();
        activate(list[next].getAttribute("data-gp-auth-id-tab"));
      });
    });

    var initial =
      root.getAttribute("data-gp-auth-id-initial") ||
      (root.querySelector('input[name="login_mode"]') || {}).value ||
      "email";
    activate(initial === "phone" ? "phone" : "email");
  }

  function onReady() {
    document.querySelectorAll("[data-gp-auth-identifier]").forEach(initIdentifierTabs);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
