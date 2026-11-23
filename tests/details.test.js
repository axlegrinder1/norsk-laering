// Checks data/details.json (the "More" section on each card). Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", f), "utf8"));
const words = read("words.json").words;
const details = read("details.json").details;
const ids = new Set(words.map((w) => String(w.id)));
const FIELDS = ["ex", "phr", "tip", "rel"];
const text = (s) => typeof s === "string" && s.trim() === s && s.length > 0;

test("every details entry belongs to a word in the word list", () => {
  for (const id of Object.keys(details)) assert.ok(ids.has(id), `details for unknown word id ${id}`);
});

test("details entries have the right shape and no unexpected fields", () => {
  for (const [id, d] of Object.entries(details)) {
    const where = `word ${id}`;
    assert.ok(Object.keys(d).length > 0, `${where}: empty entry`);
    for (const k of Object.keys(d)) assert.ok(FIELDS.includes(k), `${where}: unexpected field "${k}"`);
    for (const k of ["ex", "phr"]) {
      if (!(k in d)) continue;
      assert.ok(Array.isArray(d[k]) && d[k].length > 0, `${where}: ${k} must be a non-empty list`);
      for (const pair of d[k]) {
        assert.ok(Array.isArray(pair) && pair.length === 2, `${where}: each ${k} item is [Norwegian, English]`);
        assert.ok(text(pair[0]) && text(pair[1]), `${where}: ${k} item has blank or untrimmed text: ${JSON.stringify(pair)}`);
      }
    }
    for (const k of ["tip", "rel"]) if (k in d) assert.ok(text(d[k]), `${where}: ${k} must be non-empty trimmed text`);
  }
});
