/*
 * Spaced-repetition scheduling. Pure functions, no DOM, so it can be unit-tested in Node.
 *
 * A progress entry is stored compactly as [box, dueDay, learningStep, dueTime]:
 *   box          0–5, index into the review intervals once a word is learned
 *   dueDay       local day number when a learned word is next due
 *   learningStep 0..2 while learning (three right answers needed), -1 once learned
 *   dueTime      ms timestamp when a learning word is next due
 *
 * Settings change future scheduling only; stored progress is never rewritten.
 */
(function (root) {
  "use strict";

  // Every setting: its default and the values allowed. Anything else falls back to the default.
  var SETTINGS = {
    newPerDay: { def: 10, options: [5, 10, 20] },               // most new words introduced per day
    inPlay:    { def: 10, options: [5, 10, 15, 20, 30] },       // most words mid-learning at once
    step1:     { def: 60, options: [10, 60, 240] },             // minutes after the 1st right answer
    step2:     { def: 240, options: [240, 480, 1440] },         // minutes after the 2nd right answer
    intervals: { def: "standard", options: ["faster", "standard", "longer"] },
    roundSize: { def: 20, options: [10, 20, 30, 50] },          // cards per study round
    backlog:   { def: 50, options: [25, 50, 100, 0] }           // pause new words above this many due reviews; 0 = never
  };
  // Days until the next review for each box (index 0 unused).
  var INTERVAL_PRESETS = {
    faster:   [0, 1, 2, 4, 8, 16],
    standard: [0, 1, 3, 7, 14, 30],
    longer:   [0, 2, 5, 12, 30, 60]
  };
  var KNOWN_BOX = 3;

  /** Returns a complete, valid settings object from whatever was saved. */
  function normalizeSettings(s) {
    var out = {};
    Object.keys(SETTINGS).forEach(function (k) {
      var v = s && s[k];
      out[k] = SETTINGS[k].options.indexOf(v) >= 0 ? v : SETTINGS[k].def;
    });
    return out;
  }
  var DEFAULTS = normalizeSettings({});

  /** Local calendar day as an integer (days since epoch in the user's timezone). */
  function dayNumber(date) {
    return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
  }

  /** Stored array -> object. Also reads the older 2-element format. */
  function unpack(raw) {
    if (!Array.isArray(raw)) return null;
    if (raw.length < 3) return raw[0] === 0 ? { b: 0, d: raw[1], s: 0, t: 0 } : { b: raw[0], d: raw[1], s: -1, t: 0 };
    return { b: raw[0], d: raw[1], s: raw[2], t: raw[3] };
  }
  function pack(p) { return [p.b, p.d, p.s, p.t]; }

  function isLearning(p) { return !!p && p.s >= 0; }
  function isKnown(p) { return !!p && p.s < 0 && p.b >= KNOWN_BOX; }
  function isDue(p, now) {
    if (!p) return false;
    return p.s >= 0 ? p.t <= now : p.d <= dayNumber(new Date(now));
  }

  /** Returns the new progress entry after an answer. `p` may be null for a new word. */
  function grade(p, ok, now, settings) {
    var cfg = settings || DEFAULTS;
    var steps = [cfg.step1, cfg.step2];
    var intervals = INTERVAL_PRESETS[cfg.intervals];
    var today = dayNumber(new Date(now));
    var n = p ? { b: p.b, d: p.d, s: p.s, t: p.t } : { b: 0, d: today, s: 0, t: now };
    if (!ok) return { b: 0, d: today, s: 0, t: now };
    if (n.s >= 0) {
      if (n.s < steps.length) { n.t = now + steps[n.s] * 60000; n.s += 1; }
      else { n.s = -1; n.b = 1; n.d = today + intervals[1]; n.t = 0; }
    } else {
      n.b = Math.min(n.b + 1, intervals.length - 1);
      n.d = today + intervals[n.b];
    }
    return n;
  }

  /**
   * How many new words may be introduced now, and if none, why.
   * o: { newToday, learning (words mid-learning), dueReviews (learned words due) }
   * New words need room under both the daily maximum and the words-in-play limit.
   */
  function newStatus(o, settings) {
    var cfg = settings || DEFAULTS;
    if (cfg.backlog && o.dueReviews > cfg.backlog) return { left: 0, reason: "backlog" };
    var daily = Math.max(0, cfg.newPerDay - o.newToday);
    if (!daily) return { left: 0, reason: "daily" };
    var room = Math.max(0, cfg.inPlay - o.learning);
    if (!room) return { left: 0, reason: "learning" };
    return { left: Math.min(daily, room), reason: null };
  }

  function shuffle(a, rng) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /**
   * Picks the cards for one round and shuffles them.
   * cards: [{ p }] where p is the unpacked progress (null for a new word); other fields pass through.
   * Priority: due learning words (longest waiting first), then due reviews (most overdue first),
   * then up to opts.newLeft new words. The first opts.size are taken, then shuffled.
   */
  function planRound(cards, opts) {
    var rng = opts.rng || Math.random;
    var learning = [], reviews = [], fresh = [];
    shuffle(cards.slice(), rng).forEach(function (c) {
      if (!c.p) fresh.push(c);
      else if (!isDue(c.p, opts.now)) return;
      else if (c.p.s >= 0) learning.push(c);
      else reviews.push(c);
    });
    learning.sort(function (a, b) { return a.p.t - b.p.t; }); // sort is stable, so ties stay shuffled
    reviews.sort(function (a, b) { return a.p.d - b.p.d; });
    var picked = learning.concat(reviews, fresh.slice(0, opts.newLeft)).slice(0, opts.size || DEFAULTS.roundSize);
    return shuffle(picked, rng);
  }

  var api = {
    SETTINGS: SETTINGS, INTERVAL_PRESETS: INTERVAL_PRESETS, DEFAULTS: DEFAULTS,
    normalizeSettings: normalizeSettings,
    dayNumber: dayNumber, unpack: unpack, pack: pack,
    isLearning: isLearning, isKnown: isKnown, isDue: isDue,
    grade: grade, newStatus: newStatus, planRound: planRound
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SRS = api;
})(this);
