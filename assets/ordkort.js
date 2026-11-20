/* Flashcards: loads data/words.json, schedules with SRS (assets/srs.js), saves to localStorage. */
(function () {
  "use strict";

  var STORE_KEY = "norsk.ordkort.v2";
  var OLD_KEY = "ordkort";              // pre-2026 format: progress keyed by the Norwegian word
  var LEVELS = ["A1A2", "A1", "A2", "B1", "B2", "every"];
  var DIRS = ["no", "en", "mix"];

  var WORDS = [], THEMES = {}, ORDER = [], BY_ID = {}, BY_NO = {};
  var state = { level: "A1A2", dir: "no", prog: {}, newLog: {} };
  var session = null;

  function $(id) { return document.getElementById(id); }
  function today() { return SRS.dayNumber(new Date()); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
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
  function dailyLeft() { return Math.max(0, SRS.NEW_PER_DAY - newToday()); }
  function newLeft() { return SRS.newAllowance(newToday(), learningCount()); }

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

  /* ---------- saving ---------- */
  // Version 1 progress is keyed by the Norwegian word; version 2 by word id. Unknown keys are dropped.
  function migrateProg(prog, version) {
    var out = {};
    if (!prog || typeof prog !== "object") return out;
    Object.keys(prog).forEach(function (k) {
      var w = version >= 2 ? BY_ID[k] : BY_NO[k];
      if (w && Array.isArray(prog[k])) out[w.id] = prog[k];
    });
    return out;
  }
  function applySaved(s, version) {
    if (!s || typeof s !== "object") return;
    state.prog = migrateProg(s.prog, version);
    state.newLog = s.newLog && typeof s.newLog === "object" ? s.newLog : {};
    var level = s.level === "all" ? "A1A2" : s.level;
    if (LEVELS.indexOf(level) >= 0) state.level = level;
    if (DIRS.indexOf(s.dir) >= 0) state.dir = s.dir;
  }
  function readStore(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function loadSaved() {
    var s = readStore(STORE_KEY);
    if (s) { applySaved(s, 2); return; }
    var old = readStore(OLD_KEY);
    if (old) { applySaved(old, 1); save(); } // the old key is left in place as a fallback copy
  }
  function snapshot() {
    return { app: "norsk-ordkort", v: 2, saved: new Date().toISOString(), level: state.level, dir: state.dir, newLog: state.newLog, prog: state.prog };
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
    file.text().then(function (txt) {
      var s = JSON.parse(txt);
      if (!s || typeof s.prog !== "object") throw new Error("not a backup");
      var version = s.v >= 2 ? 2 : 1;
      var n = Object.keys(migrateProg(s.prog, version)).length;
      if (!window.confirm("Replace the progress in this browser with this backup (" + n + " words studied)?")) return;
      applySaved(s, version);
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
    var list = $("decks"); list.textContent = "";
    var left = newLeft(), now = Date.now();
    var allDue = 0, allNew = 0, allKnown = 0, allTotal = 0, nextT = Infinity;
    ORDER.forEach(function (t) {
      var ws = WORDS.filter(function (w) { return w.theme === t && inLevel(w); });
      if (!ws.length) return;
      var due = ws.filter(isDue).length, nw = ws.filter(isNew).length, kn = ws.filter(isKnown).length, lr = ws.filter(isLearning).length;
      ws.forEach(function (w) { var p = P(w); if (p && p.s >= 0 && p.t > now) nextT = Math.min(nextT, p.t); });
      allDue += due; allNew += nw; allKnown += kn; allTotal += ws.length;
      var todo = due + Math.min(nw, left);
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
    btn.textContent = todoAll ? "Study " + todoAll + " cards" : "All caught up";
    var note = [];
    if (allDue) note.push(allDue + " due now");
    if (allNew) note.push(left ? left + " new words available" : (dailyLeft() ? "New words paused – finish some learning words first" : "Today’s new words done"));
    if (!todoAll && nextT < Infinity) note.push("Next card ready in " + fmtWait(nextT - now));
    else if (!todoAll) note.push("Come back tomorrow for reviews.");
    $("studyNote").textContent = note.join(" · ");
    $("totals").textContent = allKnown + " of " + allTotal + " words known.";
  }

  /* ---------- study ---------- */
  function startSession(theme) {
    var pool = WORDS.filter(function (w) { return inLevel(w) && (!theme || w.theme === theme); });
    var learning = pool.filter(function (w) { return isLearning(w) && isDue(w); }).sort(function (a, b) { return P(a).t - P(b).t; });
    var reviews = shuffle(pool.filter(function (w) { return !isLearning(w) && isDue(w); }));
    var nw = shuffle(pool.filter(isNew)).slice(0, newLeft());
    var queue = learning.concat(reviews, nw);
    if (!queue.length) return;
    session = { queue: queue, done: 0, total: queue.length, flipped: false, curId: null, curDir: null };
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
      area.innerHTML = '<div class="done"><h2 lang="nb">Bra jobba!</h2><p>Words you’re learning come back in about an hour, then a few hours later. Words you already know come back in a few days.</p><button type="button" class="cta" id="doneBtn">Back to decks</button></div>';
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
    state.prog[w.id] = SRS.pack(SRS.grade(p, ok, Date.now()));
    if (ok) session.done++;
    else session.queue.splice(Math.min(session.queue.length, 3 + Math.floor(Math.random() * 3)), 0, w);
    session.flipped = false;
    session.curId = null;
    save();
    renderCard();
  }

  /* ---------- controls ---------- */
  function bindControls() {
    document.querySelectorAll("#levelSeg button").forEach(function (b) { b.addEventListener("click", function () { state.level = b.dataset.level; save(); renderHome(); }); });
    document.querySelectorAll("#dirSeg button").forEach(function (b) { b.addEventListener("click", function () { state.dir = b.dataset.dir; save(); renderHome(); }); });
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

  loadWords().then(function () {
    loadSaved();
    bindControls();
    renderHome();
  }).catch(function () {
    $("studyAll").textContent = "Word list unavailable";
    $("studyNote").textContent = location.protocol === "file:"
      ? "Browsers block loading the word list from a file on disk. Run a local server (see README) or use the hosted site."
      : "Couldn’t load the word list. Check your connection and reload.";
  });
})();
