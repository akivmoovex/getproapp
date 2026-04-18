/**
 * Same-origin full page navigations: show global scrim + indeterminate bar.
 * Skips hash-only / same-URL links, new tabs, downloads, modified clicks, and forms opted out via data-getpro-no-page-nav-loader.
 */
(function () {
  var ROOT_ID = "getpro-page-nav-loading";

  function el(id) {
    return document.getElementById(id);
  }

  function show(root) {
    root.removeAttribute("hidden");
    root.setAttribute("aria-hidden", "false");
  }

  function hide(root) {
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
  }

  function shouldShowForLink(anchor, ev) {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return false;
    var hrefAttr = anchor.getAttribute("href");
    if (hrefAttr == null) return false;
    var h = hrefAttr.trim();
    if (h === "" || h === "#") return false;
    if (anchor.getAttribute("target") === "_blank") return false;
    if (anchor.hasAttribute("download")) return false;
    if (/^javascript:/i.test(h)) return false;
    var url;
    try {
      url = new URL(anchor.href);
    } catch (e) {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.origin !== window.location.origin) return false;
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    ) {
      return false;
    }
    return true;
  }

  function init() {
    var root = el(ROOT_ID);
    if (!root) return;
    if (root.getAttribute("data-getpro-nav-loading-init") === "1") return;
    root.setAttribute("data-getpro-nav-loading-init", "1");

    window.addEventListener("pageshow", function () {
      hide(root);
    });

    document.addEventListener(
      "click",
      function (ev) {
        if (ev.defaultPrevented) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        var a = t.closest("a[href]");
        if (!a) return;
        if (!shouldShowForLink(a, ev)) return;
        show(root);
      },
      false
    );

    document.addEventListener(
      "submit",
      function (ev) {
        if (ev.defaultPrevented) return;
        var form = ev.target;
        if (!form || form.nodeName !== "FORM") return;
        if (form.getAttribute("data-getpro-no-page-nav-loader") != null) return;
        show(root);
      },
      false
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
