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

test("new words are capped per day and while too many are being learned", () => {
  assert.equal(SRS.newAllowance(0, 0), 20);
  assert.equal(SRS.newAllowance(15, 0), 5);
  assert.equal(SRS.newAllowance(0, 25), 5);
  assert.equal(SRS.newAllowance(20, 0), 0);
  assert.equal(SRS.newAllowance(0, 40), 0);
});
