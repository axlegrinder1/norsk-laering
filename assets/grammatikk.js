/* Grammar cheat sheet: level filter and expand/collapse all. */
(function () {
  "use strict";
  var KEY = "norsk.grammar.filter", OLD_KEY = "cheat-filter";
  var FILTERS = ["all", "A1A2", "A1", "A2", "B1", "B2"];
  var items = Array.prototype.slice.call(document.querySelectorAll("details.item"));
  var sections = Array.prototype.slice.call(document.querySelectorAll("section"));
  var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  var toggle = document.getElementById("toggleAll");

  function visibleItems() { return items.filter(function (i) { return !i.hidden; }); }
  function updateToggle() {
    var vis = visibleItems();
    var allOpen = vis.length > 0 && vis.every(function (i) { return i.open; });
    toggle.textContent = allOpen ? "Collapse all" : "Expand all";
  }
  function applyFilter(f) {
    items.forEach(function (it) {
      var lvl = it.dataset.level;
      it.hidden = !(f === "all" || (f === "A1A2" ? (lvl === "A1" || lvl === "A2") : lvl === f));
    });
    sections.forEach(function (s) {
      s.hidden = !Array.prototype.some.call(s.querySelectorAll("details.item"), function (i) { return !i.hidden; });
    });
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.filter === f)); });
    try { localStorage.setItem(KEY, f); } catch (e) {}
    updateToggle();
  }

  buttons.forEach(function (b) { b.addEventListener("click", function () { applyFilter(b.dataset.filter); }); });
  toggle.addEventListener("click", function () {
    var vis = visibleItems();
    var open = !vis.every(function (i) { return i.open; });
    vis.forEach(function (i) { i.open = open; });
    updateToggle();
  });
  items.forEach(function (i) { i.addEventListener("toggle", updateToggle); });

  var saved = "all";
  try { saved = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || "all"; } catch (e) {}
  if (FILTERS.indexOf(saved) === -1) saved = "all";
  applyFilter(saved);
})();
