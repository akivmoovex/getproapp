(function () {
  var panel = document.getElementById("tenant_settings_inline");
  var iframe = document.querySelector(".admin-tenant-settings-inline__iframe");
  var tableWrap = document.getElementById("tenant_settings_table_wrap");
  var titleEl = document.getElementById("tenant_settings_inline_title");
  var closeBtn = document.querySelector(".admin-tenant-settings-inline__close");
  if (!panel || !iframe) return;

  function openInline(url, name) {
    if (titleEl) titleEl.textContent = name ? String(name) + " — settings" : "Region settings";
    iframe.src = url;
    if (tableWrap) tableWrap.hidden = true;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
  }

  function closeInline() {
    iframe.src = "about:blank";
    if (tableWrap) tableWrap.hidden = false;
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
  }

  document.querySelectorAll(".admin-tenant-settings-open").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var url = btn.getAttribute("data-tenant-url");
      var name = btn.getAttribute("data-tenant-name");
      if (url) openInline(url, name);
    });
  });

  if (closeBtn) closeBtn.addEventListener("click", closeInline);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) closeInline();
  });
})();
