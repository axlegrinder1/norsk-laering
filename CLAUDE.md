# Norsk – notes for Claude

A static site, hosted on GitHub Pages, with a Norwegian grammar cheat sheet (`grammatikk.html`) and spaced-repetition flashcards (`ordkort.html`). It's for an English speaker preparing for Norskprøven, levels A1–B2. There's no build step: just HTML, CSS and JS. `README.md` covers the file layout, running locally and deploying. Read it first.

- Live site: https://axlegrinder1.github.io/norsk-laering/
- Repo: https://github.com/axlegrinder1/norsk-laering (branch `main`; every push to `main` deploys).
- An older copy in `../norsk-ordkort` is **out of date**. Don't edit it.

## Working with the user

- **Ask before every commit and push**, even after earlier approvals, because a push goes live.
- **Accuracy of the Norwegian matters most.** Every sentence must be correct Bokmål that an Oslo speaker would naturally say. Check inflections against the dictionary (below), and have Norwegian content reviewed by a separate subagent before publishing.
- Explain *why* when you're asked: the user likes to understand the reasoning.

## Rules that protect learners' progress

Progress is stored in the browser (`localStorage` key `norsk.ordkort.v3`), keyed by numeric word id.

- **Never change or reuse a word `id`** in `data/words.json`. A new word gets the current `nextId`, then `nextId` goes up by 1. Leave `nextId` alone when deleting a word.
- Editing a word's text (`no`, `forms`, `en`, `level`, `theme`) is safe, because progress follows the id.
- **Don't edit `data/legacy-ids-v2.json`.** It converts older saved progress.
- When `assets/srs.js` or `assets/ordkort.js` change, bump the `?v=` on their `<script>` tags in `ordkort.html`. This stops browsers pairing cached old code with new data.
- When files are added, renamed or removed, update `PRECACHE` in `sw.js` and bump `VERSION`.
- Settings changes affect future answers only. Never write code that reschedules existing progress.

## Testing

- `node --test` runs the scheduler, word-list and details tests. Run it before every commit.
- To run locally: `python -m http.server 8000`. The flashcards can't load JSON from `file://`.
- `node tools/check-forms.js data/words.json <cache.json>` checks every inflected form and noun gender against Bokmålsordboka. Put the cache file outside the repo. It always reports a few false alarms because of how the dictionary tags certain words:
  - the -s verbs (synes, trives, lykkes)
  - vind
  - the adverbs mye and mange
  - the nominalised adjectives frivillig and tillitsvalgt
- **Browser checks on this Windows machine:** use headless Edge at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` with `--headless=new --screenshot=<path> --virtual-time-budget=6000`.
  - `--dump-dom` prints nothing here.
  - Screenshots are written a few seconds after the command returns, so wait for the file to appear.
  - To test with saved progress: put a temporary page in the repo that seeds `localStorage` and loads `ordkort.html` in an iframe. Delete it afterwards.

## Content style (words.json and details.json)

- **Bokmål, Oslo style:** use the -a endings for everyday feminine nouns (boka, jenta, helga, klokka, døra). Both -a and -en are correct; the list uses -a consistently.
- **British English** in translations (flat, jumper, practise, colour).
- **Typographic punctuation:** ’ for apostrophes, – (en dash) for ranges and separators, …, and «» around Norwegian quoted inside English. This is deliberate, and the user is happy with it.
- **Dictionary API for checking forms:**
  - `https://ord.uib.no/api/articles?w=WORD&dict=bm&scope=e` returns article ids.
  - `https://ord.uib.no/bm/article/ID.json` returns the article, with `paradigm_info` listing the inflected forms.

### data/details.json (the "More" section behind each answer)

Each entry is keyed by word id (as a string). Every field is optional, but there must be at least one:

- `ex`: 1–2 example sentences as `[Norwegian, English]` pairs, in everyday situations. Keep A1 sentences short. Show something useful, such as an irregular form, the right preposition, or adjective agreement.
- `tip`: one short English note, **only** where there's a real trap. Examples: confusable words (synes/tro/mene, ligge/legge), false friends, irregular forms, register, cultural points.
- `phr`: common combinations, fixed phrases or other meanings, as `[Norwegian, English]` pairs.
- `rel`: related words or opposites as a short string, e.g. `↔ å legge`.

Leave out weak content rather than padding. The 39 pilot entries (People & family, plus words like jo, synes, gjerne, ligge and legge) are the reference for tone and length. `tests/details.test.js` checks the shape and that every id exists.

**Process that worked:**
1. A writer subagent drafts a batch of about 100 words to a scratch file.
2. A separate reviewer subagent checks every entry: grammar, naturalness, translation, and whether each claim is true. Give it the file, not your own conclusions.
3. Apply the reviewer's fixes, merge into `data/details.json`, run the tests, and check a card in the browser.
4. Ask the user, then push.
