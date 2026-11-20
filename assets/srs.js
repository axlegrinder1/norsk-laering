/*
 * Spaced-repetition scheduling. Pure functions, no DOM, so it can be unit-tested in Node.
 *
 * A progress entry is stored compactly as [box, dueDay, learningStep, dueTime]:
 *   box          0–5, index into INTERVALS once a word is learned
 *   dueDay       local day number when a learned word is next due
 *   learningStep 0..STEPS.length while learning, -1 once learned
 *   dueTime      ms timestamp when a learning word is next due
 */
(function (root) {
  "use strict";

  var STEPS = [60, 240];             // minutes between correct answers while learning
  var INTERVALS = [0, 1, 3, 7, 14, 30]; // days per box once learned
  var NEW_PER_DAY = 20;
  var MAX_LEARNING = 30;             // new words pause while this many are still being learned
  var KNOWN_BOX = 3;

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
  function grade(p, ok, now) {
    var today = dayNumber(new Date(now));
    var n = p ? { b: p.b, d: p.d, s: p.s, t: p.t } : { b: 0, d: today, s: 0, t: now };
    if (!ok) return { b: 0, d: today, s: 0, t: now };
    if (n.s >= 0) {
      if (n.s < STEPS.length) { n.t = now + STEPS[n.s] * 60000; n.s += 1; }
      else { n.s = -1; n.b = 1; n.d = today + INTERVALS[1]; n.t = 0; }
    } else {
      n.b = Math.min(n.b + 1, INTERVALS.length - 1);
      n.d = today + INTERVALS[n.b];
    }
    return n;
  }

  /** How many new words may be introduced now. */
  function newAllowance(newToday, learningCount) {
    var dailyLeft = Math.max(0, NEW_PER_DAY - newToday);
    return Math.min(dailyLeft, Math.max(0, MAX_LEARNING - learningCount));
  }

  var api = {
    STEPS: STEPS, INTERVALS: INTERVALS, NEW_PER_DAY: NEW_PER_DAY, MAX_LEARNING: MAX_LEARNING,
    dayNumber: dayNumber, unpack: unpack, pack: pack,
    isLearning: isLearning, isKnown: isKnown, isDue: isDue,
    grade: grade, newAllowance: newAllowance
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SRS = api;
})(this);
