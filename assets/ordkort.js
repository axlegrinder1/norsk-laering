/* Flashcards: loads data/words.json, schedules with SRS (assets/srs.js), saves to localStorage. */
(function () {
  "use strict";

  // Saved progress formats:
  //   v3  key norsk.ordkort.v3  progress keyed by numeric word id (current)
  //   v2  key norsk.ordkort.v2  keyed by text ids like "mann"; mapped via data/legacy-ids-v2.json
  //   v1  key ordkort           keyed by the Norwegian headword ("en mann")
  var STORE_KEY = "norsk.ordkort.v3";
  var V2_KEY = "norsk.ordkort.v2";
  var V1_KEY = "ordkort";
  var LEVELS = ["A1A2", "A1", "A2", "B1", "B2", "every"];
  var DIRS = ["no", "en", "mix"];

  var WORDS = [], THEMES = {}, ORDER = [], BY_ID = {}, BY_NO = {};
  var DETAILS = null; // extra info per word id, from data/details.json (loaded in the background)
  var state = { level: "A1A2", dir: "no", settings: SRS.normalizeSettings({}), prog: {}, newLog: {} };
  var session = null;

  // The "More settings" panel: [setting key, label, how to show each option]
  function fmtMins(m) {
    if (m < 60) return m + " min";
    if (m % 1440 === 0) return (m / 1440) + (m === 1440 ? " day" : " days");
    return (m / 60) + " h";
  }
  var PRESET_NAMES = { faster: "Faster", standard: "Standard", longer: "Longer" };
  var SETTING_UI = [
    ["inPlay", "Words in play at once", function (v) { return v + " words"; }],
    ["step1", "After the 1st right answer, ask again in", fmtMins],
    ["step2", "After the 2nd right answer, ask again in", fmtMins],
    ["intervals", "Review gaps once learned", function (v) { return PRESET_NAMES[v] + ": " + SRS.INTERVAL_PRESETS[v].slice(1).join(", ") + " days"; }],
    ["roundSize", "Cards per round", String],
    ["backlog", "Pause new words when reviews due exceed", function (v) { return v ? String(v) : "Never pause"; }]
  ];

  function $(id) { return document.getElementById(id); }
  function today() { return SRS.dayNumber(new Date()); }
  function inLevel(w) {
    if (state.level === "every") return true;
    if (state.level === "A1A2") return w.level === "A1" || w.level === "A2";
    return w.level === state.level;
  }

  function P(w) { return SRS.unpack(state.prog[w.id]); }
  function isNew(w) { return !state.prog[w.id]; }
  function isLearning(w) { return SRS.isLearning(P(w)); }
  function isDue(w) { return SRS.isDue(P(w), Date.now()); }
  function isKnown(w) { return SRS.isKnown(P(w)); }
  function newToday() { return state.newLog[today()] || 0; }
  function learningCount() { return WORDS.filter(isLearning).length; }
  function dueReviewCount() { var now = Date.now(); return WORDS.filter(function (w) { var p = P(w); return p && p.s < 0 && SRS.isDue(p, now); }).length; }
  function newStatus() {
    return SRS.newStatus({ newToday: newToday(), learning: learningCount(), dueReviews: dueReviewCount() }, state.settings);
  }
  function waitingIn(ws, left) { return ws.filter(isDue).length + Math.min(ws.filter(isNew).length, left); }

  /* ---------- data ---------- */
  function loadWords() {
    return fetch("data/words.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (data) {
      ORDER = data.themes.map(function (t) { return t.id; });
      data.themes.forEach(function (t) { THEMES[t.id] = t.label; });
      WORDS = data.words.filter(function (w) { return w.id && w.no && w.en && THEMES[w.theme]; });
      WORDS.forEach(function (w) { BY_ID[w.id] = w; BY_NO[w.no] = w; });
    });
  }

  // Optional: cards work without it, the More section just doesn't appear.
  function loadDetails() {
    fetch("data/details.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.details) return;
      DETAILS = d.details;
      if (session && session.flipped && session.queue.length) renderCard();
    }).catch(function () {});
  }
  function pairList(cls, title, pairs) {
    var box = document.createElement("div"); box.className = cls;
    var h = document.createElement("h3"); h.textContent = title; box.appendChild(h);
    pairs.forEach(function (p) {
      var row = document.createElement("p");
      var no = document.createElement("span"); no.className = "no"; no.lang = "nb"; no.textContent = p[0];
      var en = document.createElement("span"); en.className = "en"; en.textContent = p[1];
      row.appendChild(no); row.appendChild(en); box.appendChild(row);
    });
    return box;
  }
  function buildMore(d) {
    var more = document.createElement("details"); more.className = "more";
    var sum = document.createElement("summary"); sum.textContent = "More"; more.appendChild(sum);
    var body = document.createElement("div"); body.className = "morebody";
    if (d.ex && d.ex.length) body.appendChild(pairList("moreex", "Examples", d.ex));
    if (d.tip) { var tip = document.createElement("p"); tip.className = "moretip"; tip.textContent = d.tip; body.appendChild(tip); }
    if (d.phr && d.phr.length) body.appendChild(pairList("morephr", "Useful phrases", d.phr));
    if (d.rel) { var rel = document.createElement("p"); rel.className = "morerel"; rel.textContent = "See also: " + d.rel; body.appendChild(rel); }
    more.appendChild(body);
    return more;
  }

  /* ---------- saving ---------- */
  // Converts saved progress of any version to numeric ids. Unknown keys are dropped.
  function migrateProg(prog, version, legacy) {
    var out = {};
    if (!prog || typeof prog !== "object") return out;
    Object.keys(prog).forEach(function (k) {
      var w = version >= 3 ? BY_ID[k] : version === 2 ? BY_ID[legacy && legacy[k]] : BY_NO[k];
      if (w && Array.isArray(prog[k])) out[w.id] = prog[k];
    });
    return out;
  }
  function versionOf(s) { return s && s.v >= 3 ? 3 : s && s.v === 2 ? 2 : 1; }
  // Resolves to the text-id -> number map, only fetched when v2 progress needs converting.
  function legacyMapFor(version) {
    if (version !== 2) return Promise.resolve(null);
    return fetch("data/legacy-ids-v2.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function applySaved(s, version, legacy) {
    if (!s || typeof s !== "object") return;
    state.prog = migrateProg(s.prog, version, legacy);
    state.newLog = s.newLog && typeof s.newLog === "object" ? s.newLog : {};
    var level = s.level === "all" ? "A1A2" : s.level;
    if (LEVELS.indexOf(level) >= 0) state.level = level;
    if (DIRS.indexOf(s.dir) >= 0) state.dir = s.dir;
    state.settings = SRS.normalizeSettings(s.settings);
  }
  function readStore(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  // Older keys are left in place as a fallback copy.
  function loadSaved() {
    var s = readStore(STORE_KEY);
    if (s) { applySaved(s, 3); return Promise.resolve(); }
    var v2 = readStore(V2_KEY);
    if (v2) return legacyMapFor(2).then(function (map) { applySaved(v2, 2, map); save(); });
    var v1 = readStore(V1_KEY);
    if (v1) { applySaved(v1, 1); save(); }
    return Promise.resolve();
  }
  function snapshot() {
    return { app: "norsk-ordkort", v: 3, saved: new Date().toISOString(), level: state.level, dir: state.dir, settings: state.settings, newLog: state.newLog, prog: state.prog };
  }
  function prune() { var t = today(); Object.keys(state.newLog).forEach(function (d) { if (+d < t - 7) delete state.newLog[d]; }); }
  function save() {
    prune();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot())); }
    catch (e) { setStatus("Couldn’t save progress in this browser. Private browsing can block saving."); }
  }
  function setStatus(t) { $("status").textContent = t; }

  function exportProgress() {
    var blob = new Blob([JSON.stringify(snapshot())], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "norsk-progress-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    setStatus("Backup downloaded. Import it on another device to carry on there.");
  }
  function importProgress(file) {
    var s, version;
    file.text().then(function (txt) {
      s = JSON.parse(txt);
      if (!s || typeof s.prog !== "object") throw new Error("not a backup");
      version = versionOf(s);
      return legacyMapFor(version);
    }).then(function (map) {
      var n = Object.keys(migrateProg(s.prog, version, map)).length;
      if (!window.confirm("Replace the progress in this browser with this backup (" + n + " words studied)?")) return;
      applySaved(s, version, map);
      save(); renderHome();
      setStatus("Backup restored: " + n + " words studied.");
    }).catch(function () { setStatus("That file isn’t a progress backup."); });
  }

  /* ---------- home ---------- */
  function fmtWait(ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60), r = m % 60;
    return h + " h" + (r ? " " + r + " min" : "");
  }
  function renderHome() {
    document.querySelectorAll("#levelSeg button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.level === state.level)); });
    document.querySelectorAll("#dirSeg button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.dir === state.dir)); });
    document.querySelectorAll("#newSeg button").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.dataset.new === state.settings.newPerDay)); });
    SETTING_UI.forEach(function (s) { $("set-" + s[0]).value = String(state.settings[s[0]]); });
    var list = $("decks"); list.textContent = "";
    var ns = newStatus(), left = ns.left, now = Date.now();
    var allDue = 0, allNew = 0, allKnown = 0, allTotal = 0, nextT = Infinity;
    ORDER.forEach(function (t) {
      var ws = WORDS.filter(function (w) { return w.theme === t && inLevel(w); });
      if (!ws.length) return;
      var due = ws.filter(isDue).length, nw = ws.filter(isNew).length, kn = ws.filter(isKnown).length, lr = ws.filter(isLearning).length;
      ws.forEach(function (w) { var p = P(w); if (p && p.s >= 0 && p.t > now) nextT = Math.min(nextT, p.t); });
      allDue += due; allNew += nw; allKnown += kn; allTotal += ws.length;
      var todo = waitingIn(ws, left);
      var li = document.createElement("li");
      var b = document.createElement("button"); b.type = "button"; b.className = "deck";
      b.innerHTML = '<span class="name"></span><span class="due"></span><span class="meta"></span><span class="bar"><i></i></span>';
      b.querySelector(".name").textContent = THEMES[t];
      b.querySelector(".meta").textContent = ws.length + " words · " + kn + " known · " + lr + " learning · " + nw + " new";
      var dueEl = b.querySelector(".due");
      dueEl.textContent = todo ? todo + " to study" : "Done for now";
      if (!todo) dueEl.classList.add("zero");
      b.querySelector(".bar i").style.width = Math.round(100 * kn / ws.length) + "%";
      if (todo) b.addEventListener("click", function () { startSession(t); });
      li.appendChild(b); list.appendChild(li);
    });
    var todoAll = allDue + Math.min(allNew, left);
    var btn = $("studyAll");
    btn.disabled = !todoAll;
    var size = state.settings.roundSize;
    btn.textContent = !todoAll ? "All caught up"
      : todoAll > size ? "Study " + size + " of " + todoAll + " cards"
      : "Study " + todoAll + (todoAll === 1 ? " card" : " cards");
    var note = [];
    if (allDue) note.push(allDue + " due now");
    if (allNew) note.push(left ? left + " new " + (left === 1 ? "word" : "words") + " available"
      : ns.reason === "backlog" ? "New words paused until " + state.settings.backlog + " or fewer reviews are due"
      : ns.reason === "learning" ? "New words paused – finish the " + learningCount() + " you’re learning first"
      : "Today’s " + state.settings.newPerDay + " new words done");
    if (!todoAll && nextT < Infinity) note.push("Next card ready in " + fmtWait(nextT - now));
    else if (!todoAll) note.push("Come back tomorrow for reviews.");
    $("studyNote").textContent = note.join(" · ");
    $("totals").textContent = allKnown + " of " + allTotal + " words known.";
  }

  /* ---------- study ---------- */
  function poolFor(theme) { return WORDS.filter(function (w) { return inLevel(w) && (!theme || w.theme === theme); }); }
  function startSession(theme) {
    var cards = poolFor(theme).map(function (w) { return { w: w, p: P(w) }; });
    var queue = SRS.planRound(cards, { now: Date.now(), newLeft: newStatus().left, size: state.settings.roundSize })
      .map(function (c) { return c.w; });
    if (!queue.length) return;
    session = { theme: theme, queue: queue, done: 0, total: queue.length, flipped: false, curId: null, curDir: null };
    $("home").hidden = true;
    $("study").hidden = false;
    window.scrollTo(0, 0);
    renderCard();
  }
  function endSession() {
    session = null;
    $("study").hidden = true;
    $("home").hidden = false;
    renderHome();
  }
  function renderCard() {
    var area = $("cardArea");
    if (!session.queue.length) {
      $("count").textContent = "";
      var more = waitingIn(poolFor(session.theme), newStatus().left);
      area.innerHTML = '<div class="done"><h2 lang="nb">Bra jobba!</h2><p></p>' +
        (more ? '<button type="button" class="cta" id="moreBtn"></button>' : '') +
        '<button type="button" class="cta' + (more ? ' secondary' : '') + '" id="doneBtn">Back to decks</button></div>';
      area.querySelector(".done p").textContent = more
        ? "Every answer is saved, so you can stop here or do another round."
        : "That’s everything for now. Words you’re learning come back later today. Words you already know come back in a few days.";
      if (more) {
        $("moreBtn").textContent = "Keep going (" + more + " left)";
        $("moreBtn").addEventListener("click", function () { startSession(session.theme); });
      }
      $("doneBtn").addEventListener("click", endSession);
      return;
    }
    var w = session.queue[0];
    var p = P(w);
    var tag = !p ? "New" : (p.s >= 0 ? "Learning" : "Review");
    if (session.curId !== w.id) {
      session.curId = w.id;
      session.curDir = state.dir === "mix" ? (p ? (Math.random() < 0.5 ? "no" : "en") : "no") : state.dir;
    }
    var dir = session.curDir;
    $("count").textContent = session.done + " / " + session.total;
    area.innerHTML =
      '<div class="card" id="card"><span class="lvl"></span><span class="theme"></span>' +
      '<div class="prompt"></div>' +
      (session.flipped ? '<div class="answer"><div class="main"></div>' + (w.forms ? '<div class="forms" lang="nb"></div>' : '') + '</div>' : '<div class="hint"></div>') +
      '</div><div class="actions">' +
      (session.flipped
        ? '<button type="button" class="again" id="againBtn">Again</button><button type="button" class="good" id="goodBtn">Got it</button>'
        : '<button type="button" class="reveal" id="revealBtn">Show answer</button>') +
      '</div>';
    var lvl = area.querySelector(".lvl"); lvl.textContent = w.level; lvl.classList.add(w.level);
    area.querySelector(".theme").textContent = THEMES[w.theme] + " · " + tag;
    var prompt = area.querySelector(".prompt");
    prompt.textContent = dir === "no" ? w.no : w.en;
    prompt.lang = dir === "no" ? "nb" : "en";
    if (session.flipped) {
      var main = area.querySelector(".answer .main");
      main.textContent = dir === "no" ? w.en : w.no;
      main.lang = dir === "no" ? "en" : "nb";
      if (w.forms) area.querySelector(".answer .forms").textContent = (dir === "en" ? "" : w.no + "  ·  ") + w.forms;
      if (DETAILS && DETAILS[w.id]) area.querySelector(".answer").appendChild(buildMore(DETAILS[w.id]));
      $("againBtn").addEventListener("click", function () { grade(false); });
      $("goodBtn").addEventListener("click", function () { grade(true); });
    } else {
      area.querySelector(".hint").textContent = "Tap to show the answer";
      $("revealBtn").addEventListener("click", flip);
      $("card").addEventListener("click", flip);
    }
  }
  function flip() { session.flipped = true; renderCard(); }
  function grade(ok) {
    var w = session.queue.shift();
    var p = P(w);
    if (!p) state.newLog[today()] = newToday() + 1;
    state.prog[w.id] = SRS.pack(SRS.grade(p, ok, Date.now(), state.settings));
    if (ok) session.done++;
    else session.queue.splice(Math.min(session.queue.length, 3 + Math.floor(Math.random() * 3)), 0, w);
    session.flipped = false;
    session.curId = null;
    save();
    renderCard();
  }

  /* ---------- settings ---------- */
  function buildSettings() {
    var box = $("settingsList");
    SETTING_UI.forEach(function (s) {
      var key = s[0], spec = SRS.SETTINGS[key];
      var label = document.createElement("label"); label.className = "setting";
      var span = document.createElement("span"); span.textContent = s[1];
      var sel = document.createElement("select"); sel.id = "set-" + key;
      spec.options.forEach(function (v) {
        var o = document.createElement("option");
        o.value = String(v);
        o.textContent = s[2](v) + (v === spec.def ? " (default)" : "");
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () {
        var picked = spec.options.filter(function (v) { return String(v) === sel.value; })[0];
        state.settings[key] = picked === undefined ? spec.def : picked;
        save(); renderHome();
      });
      label.appendChild(span); label.appendChild(sel); box.appendChild(label);
    });
  }

  /* ---------- controls ---------- */
  function bindControls() {
    document.querySelectorAll("#levelSeg button").forEach(function (b) { b.addEventListener("click", function () { state.level = b.dataset.level; save(); renderHome(); }); });
    document.querySelectorAll("#dirSeg button").forEach(function (b) { b.addEventListener("click", function () { state.dir = b.dataset.dir; save(); renderHome(); }); });
    document.querySelectorAll("#newSeg button").forEach(function (b) { b.addEventListener("click", function () { state.settings.newPerDay = +b.dataset.new; save(); renderHome(); }); });
    buildSettings();
    $("defaultsBtn").addEventListener("click", function () {
      state.settings = SRS.normalizeSettings({}); save(); renderHome();
      setStatus("Settings restored to defaults.");
    });
    $("studyAll").addEventListener("click", function () { startSession(null); });
    $("backBtn").addEventListener("click", endSession);
    $("exportBtn").addEventListener("click", exportProgress);
    $("importBtn").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", function () { var f = this.files[0]; this.value = ""; if (f) importProgress(f); });
    document.addEventListener("keydown", function (e) {
      if (!session || !session.queue.length) return;
      if (!session.flipped && (e.key === " " || e.key === "Enter")) { e.preventDefault(); flip(); }
      else if (session.flipped && (e.key === "1" || e.key === "ArrowLeft")) grade(false);
      else if (session.flipped && (e.key === "2" || e.key === "ArrowRight" || e.key === " ")) { e.preventDefault(); grade(true); }
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && !session) renderHome(); });
    setInterval(function () { if (!session) renderHome(); }, 60000);

    var resetBtn = $("reset"), resetArmed = false;
    resetBtn.addEventListener("click", function () {
      if (!resetArmed) {
        resetArmed = true; resetBtn.textContent = "Tap again to confirm reset";
        setTimeout(function () { resetArmed = false; resetBtn.textContent = "Reset progress"; }, 4000);
        return;
      }
      resetArmed = false; resetBtn.textContent = "Reset progress";
      state.prog = {}; state.newLog = {}; save(); renderHome();
      setStatus("Progress reset.");
    });
  }

  // If earlier progress can't be converted, stop rather than start fresh: saving would
  // create a v3 entry and the earlier progress would never be converted.
  var stage = "words";
  loadWords().then(function () {
    stage = "progress";
    return loadSaved();
  }).then(function () {
    bindControls();
    renderHome();
    loadDetails();
  }).catch(function () {
    $("studyAll").textContent = stage === "words" ? "Word list unavailable" : "Couldn’t load your progress";
    $("studyNote").textContent = stage === "progress"
      ? "Your earlier progress is still stored but needs converting. Check your connection and reload."
      : location.protocol === "file:"
        ? "Browsers block loading the word list from a file on disk. Run a local server (see README) or use the hosted site."
        : "Couldn’t load the word list. Check your connection and reload.";
  });
})();
