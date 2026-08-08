(function () {
  "use strict";

  var KEY = "pft-theme";

  function getSaved() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function systemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  var saved = getSaved();
  var theme = saved === "dark" || saved === "light" ? saved : systemTheme();
  document.documentElement.setAttribute("data-theme", theme);

  window.__pftTheme = {
    current: theme,
    toggle: function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem(KEY, next);
      } catch (e) { /* storage unavailable — session-only theme */ }
      return next;
    },
  };
})();
