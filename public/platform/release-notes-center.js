(function () {
  "use strict";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  var copyBtn = qs("[data-rnc-copy]");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var url = window.location.origin + window.location.pathname.replace(/\/print$/, "/share");
      var status = qs("[data-rnc-copy-status]");
      function done(ok) {
        if (!status) return;
        status.hidden = false;
        status.textContent = ok
          ? "Copied public share link."
          : "Copy failed — select the URL manually.";
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { done(true); }).catch(function () { done(false); });
      } else {
        done(false);
      }
    });
  }

  var printBtn = qs("[data-rnc-print]");
  if (printBtn) {
    printBtn.addEventListener("click", function () {
      window.print();
    });
  }
})();
