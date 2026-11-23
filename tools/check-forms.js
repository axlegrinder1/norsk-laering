// Checks the inflected forms and noun genders in data/words.json against Bokmålsordboka (ord.uib.no).
// Usage: node tools/check-forms.js data/words.json <cache.json>   (the cache file speeds up re-runs; keep it out of the repo)
const fs = require("fs");
const [,, wordsPath, cachePath] = process.argv;
const data = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
let cache = {}; try { cache = JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch (e) {}
const get = async (u) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch (e) {} await new Promise(r => setTimeout(r, 800)); } return null; };
async function lookup(lemma) {
  if (cache[lemma]) return cache[lemma];
  const res = await get("https://ord.uib.no/api/articles?w=" + encodeURIComponent(lemma) + "&dict=bm&scope=e");
  const out = [];
  for (const id of ((res && res.articles && res.articles.bm) || []).slice(0, 8)) {
    const a = await get("https://ord.uib.no/bm/article/" + id + ".json");
    for (const l of (a && a.lemmas) || []) {
      if (l.lemma !== lemma) continue;
      for (const p of l.paradigm_info || []) out.push({ pos: p.tags || [], infl: (p.inflection || []).filter(i => i.word_form).map(i => [i.tags.join("+"), i.word_form]) });
    }
  }
  return (cache[lemma] = out);
}
function parse(w) {
  const no = w.no.replace(/\s*\(.*\)/, "").trim();
  let m, kind = null, lemma = null, art = null;
  if ((m = no.match(/^(en|ei|et) (\S+)$/))) { kind = "noun"; art = m[1]; lemma = m[2]; }
  else if ((m = no.match(/^å (\S+)/))) { kind = "verb"; lemma = m[1]; }
  else if (/^\S+$/.test(no) && w.forms && w.theme !== "phrases") { kind = "other"; lemma = no; }
  else return null;
  const toks = [];
  for (let seg of (w.forms || "").split(/[–·]/)) {
    seg = seg.trim(); if (!seg || /[=(:…]/.test(seg) || /^(på|den|de) /.test(seg)) continue;
    toks.push(seg.replace(/^har /, "").split("/").map(s => s.trim().split(" ")[0]));
  }
  return { kind, lemma, art, toks };
}
const SLOTS = {
  noun: [t => t === "Sing+Def", t => t === "Plur+Ind", t => t === "Plur+Def"],
  verb: [t => t === "Pres", t => t === "Past", t => t === "<PerfPart>"],
  adj:  [t => /Neuter\+Ind\+Sing/.test(t) && /^Pos/.test(t), t => t === "Pos+Plur"]
};
(async () => {
  const jobs = data.words.map(w => ({ w, p: parse(w) })).filter(j => j.p);
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (i < jobs.length) { const j = jobs[i++]; j.par = await lookup(j.p.lemma); } }));
  fs.writeFileSync(cachePath, JSON.stringify(cache));
  let checked = 0, slots = 0;
  for (const { w, p, par } of jobs) {
    const want = p.kind === "noun" ? "NOUN" : p.kind === "verb" ? "VERB" : "ADJ";
    const pars = par.filter(x => x.pos.includes(want));
    if (!pars.length) { if (p.kind !== "other") console.log("NOT FOUND ", w.id, w.no); continue; }
    checked++;
    const kind = p.kind === "other" ? "adj" : p.kind;
    if (kind === "noun") {
      const g = new Set(pars.flatMap(x => x.pos));
      if (!(p.art === "et" ? g.has("Neuter") : (g.has("Masc") || g.has("Fem")))) console.log("GENDER    ", w.id, w.no, "| dictionary:", [...g].join(","));
    }
    if (kind === "noun" && p.toks.length !== 3) continue; // singular-only / notes
    p.toks.forEach((alts, n) => {
      const test = SLOTS[kind][n]; if (!test) return;
      const ok = new Set(pars.flatMap(x => x.infl.filter(f => test(f[0])).map(f => f[1])));
      slots++;
      for (const a of alts) if (!ok.has(a)) console.log("FORM      ", w.id, w.no, "| listed:", a, "| dictionary allows:", [...ok].join(", ") || "(none)");
    });
  }
  console.log("checked", checked, "entries,", slots, "individual forms");
})();
