// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const SRS = require("../assets/srs.js");

const MIN = 60000;
const now = new Date(2026, 10, 20, 9, 0).getTime(); // 20 Nov 2026, 09:00 local
const today = SRS.dayNumber(new Date(now));

test("a new word answered right enters learning step 1, due in an hour", () => {
  const p = SRS.grade(null, true, now);
  assert.deepEqual(p, { b: 0, d: today, s: 1, t: now + 60 * MIN });
  assert.ok(SRS.isLearning(p));
  assert.ok(!SRS.isDue(p, now + 59 * MIN));
  assert.ok(SRS.isDue(p, now + 60 * MIN));
});

test("three right answers graduate a word to box 1, due tomorrow", () => {
  let p = SRS.grade(null, true, now);
  p = SRS.grade(p, true, now + 60 * MIN);
  assert.equal(p.s, 2);
  assert.equal(p.t, now + 60 * MIN + 240 * MIN);
  p = SRS.grade(p, true, now + 300 * MIN);
  assert.deepEqual(p, { b: 1, d: today + 1, s: -1, t: 0 });
  assert.ok(!SRS.isLearning(p));
  assert.ok(!SRS.isDue(p, now + 300 * MIN));
});

test("learned words step through 1, 3, 7, 14, 30 day intervals and stop at 30", () => {
  let p = { b: 1, d: today, s: -1, t: 0 };
  const gaps = [];
  for (let i = 0; i < 6; i++) { p = SRS.grade(p, true, now); gaps.push(p.d - today); }
  assert.deepEqual(gaps, [3, 7, 14, 30, 30, 30]);
});

test("a word counts as known from box 3", () => {
  assert.ok(!SRS.isKnown({ b: 2, d: today, s: -1, t: 0 }));
  assert.ok(SRS.isKnown({ b: 3, d: today, s: -1, t: 0 }));
  assert.ok(!SRS.isKnown({ b: 3, d: today, s: 0, t: now }));
});

test("a wrong answer sends any word back to the start of learning, due now", () => {
  const p = SRS.grade({ b: 4, d: today, s: -1, t: 0 }, false, now);
  assert.deepEqual(p, { b: 0, d: today, s: 0, t: now });
  assert.ok(SRS.isDue(p, now));
});

test("grade does not mutate its input", () => {
  const p = { b: 2, d: today, s: -1, t: 0 };
  SRS.grade(p, true, now);
  assert.deepEqual(p, { b: 2, d: today, s: -1, t: 0 });
});

test("pack and unpack round-trip, and the old 2-element format still reads", () => {
  const p = { b: 2, d: today, s: -1, t: 0 };
  assert.deepEqual(SRS.unpack(SRS.pack(p)), p);
  assert.deepEqual(SRS.unpack([0, today]), { b: 0, d: today, s: 0, t: 0 });
  assert.deepEqual(SRS.unpack([3, today]), { b: 3, d: today, s: -1, t: 0 });
  assert.equal(SRS.unpack(undefined), null);
});

const cfg = (o) => SRS.normalizeSettings({ ...SRS.DEFAULTS, ...o });
const st = (o, s) => SRS.newStatus({ newToday: 0, learning: 0, dueReviews: 0, ...o }, cfg(s));

test("new words need room under both the daily maximum and words in play", () => {
  assert.deepEqual(st({}), { left: 10, reason: null });
  assert.deepEqual(st({ newToday: 7 }), { left: 3, reason: null });
  assert.deepEqual(st({ learning: 8 }), { left: 2, reason: null });
  assert.deepEqual(st({ newToday: 10 }), { left: 0, reason: "daily" });
  assert.deepEqual(st({ learning: 10 }), { left: 0, reason: "learning" });
  // separate limits: up to 20 a day, but never more than 5 in play
  assert.deepEqual(st({}, { newPerDay: 20, inPlay: 5 }), { left: 5, reason: null });
  assert.deepEqual(st({ learning: 3 }, { newPerDay: 20, inPlay: 5 }), { left: 2, reason: null });
  assert.deepEqual(st({ newToday: 18, learning: 0 }, { newPerDay: 20, inPlay: 5 }), { left: 2, reason: null });
});

test("new words pause above the review backlog limit, unless it's set to never", () => {
  assert.equal(st({ dueReviews: 50 }).left, 10);
  assert.deepEqual(st({ dueReviews: 51 }), { left: 0, reason: "backlog" });
  assert.deepEqual(st({ dueReviews: 26 }, { backlog: 25 }), { left: 0, reason: "backlog" });
  assert.equal(st({ dueReviews: 500 }, { backlog: 0 }).left, 10);
});

test("settings fall back to defaults for missing or unknown values", () => {
  assert.deepEqual(SRS.normalizeSettings(undefined), SRS.DEFAULTS);
  const s = SRS.normalizeSettings({ newPerDay: 20, inPlay: 7, step1: "60", intervals: "turbo", backlog: 0 });
  assert.equal(s.newPerDay, 20);
  assert.equal(s.inPlay, 10, "7 isn't an option");
  assert.equal(s.step1, 60, "string isn't accepted");
  assert.equal(s.intervals, "standard");
  assert.equal(s.backlog, 0, "0 (never) is a valid choice");
});

test("learning gaps follow the step settings", () => {
  const s = cfg({ step1: 240, step2: 1440 });
  let p = SRS.grade(null, true, now, s);
  assert.equal(p.t, now + 240 * MIN);
  p = SRS.grade(p, true, now, s);
  assert.equal(p.t, now + 1440 * MIN);
});

test("review gaps follow the chosen preset", () => {
  for (const [name, gaps] of [["faster", [2, 4, 8, 16, 16]], ["longer", [5, 12, 30, 60, 60]]]) {
    let p = { b: 1, d: today, s: -1, t: 0 };
    const got = [];
    for (let i = 0; i < 5; i++) { p = SRS.grade(p, true, now, cfg({ intervals: name })); got.push(p.d - today); }
    assert.deepEqual(got, gaps, name);
  }
  const learned = SRS.grade({ b: 0, d: today, s: 2, t: now }, true, now, cfg({ intervals: "longer" }));
  assert.equal(learned.d, today + 2, "graduating uses the preset's first gap");
});

test("a round holds at most 20 cards: due learning first, then most overdue reviews, then new", () => {
  const learning = (id, mins) => ({ id, p: { b: 0, d: today, s: 1, t: now - mins * MIN } });
  const review = (id, daysLate) => ({ id, p: { b: 2, d: today - daysLate, s: -1, t: 0 } });
  const cards = [
    ...Array.from({ length: 5 }, (_, i) => learning("L" + i, i + 1)),
    ...Array.from({ length: 30 }, (_, i) => review("R" + i, i)),
    ...Array.from({ length: 10 }, (_, i) => ({ id: "N" + i, p: null })),
    { id: "notyet", p: { b: 0, d: today, s: 1, t: now + 30 * MIN } },
    { id: "future", p: { b: 3, d: today + 2, s: -1, t: 0 } },
  ];
  const round = SRS.planRound(cards, { now, newLeft: 10, size: 20 });
  const ids = new Set(round.map((c) => c.id));
  assert.equal(round.length, 20);
  for (let i = 0; i < 5; i++) assert.ok(ids.has("L" + i), "all due learning words included");
  for (let i = 15; i < 30; i++) assert.ok(ids.has("R" + i), "the 15 most overdue reviews included");
  assert.ok(![...ids].some((id) => id.startsWith("N")), "no room left for new words");
  assert.ok(!ids.has("notyet") && !ids.has("future"), "cards not yet due are left out");
});

test("a round tops up with new words up to the allowance", () => {
  const cards = [
    { id: "R", p: { b: 2, d: today, s: -1, t: 0 } },
    ...Array.from({ length: 10 }, (_, i) => ({ id: "N" + i, p: null })),
  ];
  const round = SRS.planRound(cards, { now, newLeft: 3, size: 20 });
  assert.equal(round.length, 4);
  assert.equal(round.filter((c) => !c.p).length, 3);
});

test("a round is shuffled rather than in priority order", () => {
  const cards = Array.from({ length: 20 }, (_, i) => ({ id: i, p: { b: 2, d: today - 20 + i, s: -1, t: 0 } }));
  const orders = new Set();
  for (let i = 0; i < 20; i++) orders.add(SRS.planRound(cards, { now, newLeft: 0, size: 20 }).map((c) => c.id).join(","));
  assert.ok(orders.size > 1, "order varies between rounds");
});
