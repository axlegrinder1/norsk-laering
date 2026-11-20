// Checks data/words.json. Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "words.json"), "utf8"));
const LEVELS = ["A1", "A2", "B1", "B2"];
const FIELDS = ["id", "level", "theme", "no", "forms", "en"];

test("themes have unique ids and labels", () => {
  const ids = data.themes.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of data.themes) assert.ok(t.id && t.label, JSON.stringify(t));
});

test("every word has the required fields and nothing unexpected", () => {
  const themes = new Set(data.themes.map((t) => t.id));
  for (const w of data.words) {
    const where = JSON.stringify(w);
    assert.match(w.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be lowercase-with-dashes: " + where);
    assert.ok(LEVELS.includes(w.level), "unknown level: " + where);
    assert.ok(themes.has(w.theme), "unknown theme: " + where);
    assert.ok(typeof w.no === "string" && w.no.trim(), "missing Norwegian: " + where);
    assert.ok(typeof w.en === "string" && w.en.trim(), "missing English: " + where);
    if ("forms" in w) assert.ok(typeof w.forms === "string" && w.forms.trim(), "empty forms: " + where);
    for (const k of Object.keys(w)) assert.ok(FIELDS.includes(k), "unexpected field " + k + ": " + where);
  }
});

test("word ids are unique (progress is stored by id, so never reuse or change one)", () => {
  const seen = new Map();
  for (const w of data.words) {
    assert.ok(!seen.has(w.id), `duplicate id "${w.id}": ${seen.get(w.id)} and ${w.no}`);
    seen.set(w.id, w.no);
  }
});

test("Norwegian headwords are unique (old saved progress is matched by headword)", () => {
  const seen = new Set();
  for (const w of data.words) {
    assert.ok(!seen.has(w.no), `duplicate headword "${w.no}"`);
    seen.add(w.no);
  }
});
