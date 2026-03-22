(function () {
  var modal = document.getElementById("admin_settings_modal");
  var iframe = document.getElementById("admin_settings_iframe");
  if (!modal || !iframe) return;

  function openModal(url) {
    iframe.src = url;
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("admin-settings-modal--open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    iframe.src = "about:blank";
    modal.setAttribute("hidden", "hidden");
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("admin-settings-modal--open");
    document.body.style.overflow = "";
  }

  document.querySelectorAll("[data-settings-embed-url]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var url = btn.getAttribute("data-settings-embed-url");
      if (url) openModal(url);
    });
  });

  modal.addEventListener("click", function (e) {
    if (e.target.closest(".admin-settings-modal__backdrop")) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hasAttribute("hidden")) closeModal();
  });
})();
