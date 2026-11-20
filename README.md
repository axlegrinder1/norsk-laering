# Norsk

A Norwegian grammar cheat sheet and vocabulary flashcards (A1–B2). It's a static site: plain HTML, CSS and JavaScript with no build step, hosted on GitHub Pages.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Start page linking the two tools |
| `grammatikk.html` | Grammar cheat sheet (content lives in the HTML) |
| `ordkort.html` | Flashcards |
| `data/words.json` | The word list: themes, plus one entry per word |
| `assets/common.css` | Fonts, colours and light/dark theme shared by every page |
| `assets/srs.js` | Spaced-repetition scheduling, with no DOM code, so it's unit-tested |
| `assets/ordkort.js`, `assets/grammatikk.js` | Page scripts |
| `assets/fonts/` | Self-hosted fonts (no Google Fonts requests) |
| `sw.js`, `manifest.webmanifest`, `assets/icons/` | Offline support and the home-screen app |
| `tests/` | `node --test` suites for the scheduler and the word list |

## Running it locally

The flashcards load `data/words.json`, and browsers block that when you open the page straight from disk. Serve the folder instead:

```sh
python -m http.server 8000
# or: npx serve
```

Then open http://localhost:8000. Offline caching is switched off on localhost, so you always see your latest edits.

## Editing words

Each word in `data/words.json` looks like this:

```json
{"id":1,"level":"A1","theme":"people","no":"en mann","forms":"mannen – menn – mennene","en":"a man; a husband"}
```

- `id`: a number. Learners' progress is stored against it, so **never change or reuse an id**, even after deleting a word. You can fix the spelling in `no` freely.
  - To add a word, give it the number in `nextId` at the top of the file, then add 1 to `nextId`.
  - Leave `nextId` alone when deleting a word, so its number is never handed out again.
- `level`: `A1`, `A2`, `B1` or `B2`.
- `theme`: one of the `themes[].id` values at the top of the file. Themes appear in the order listed.
- `forms`: optional, for the inflected forms.

Run `node --test` after editing. It catches duplicate ids, unknown themes and missing fields.

## Saved progress

Progress lives in the browser's `localStorage` under `norsk.ordkort.v3`. **Export progress** and **Import progress** on the flashcards page move it between devices. Earlier formats are converted automatically the first time the new version loads:

- `ordkort`: the original single-file version, keyed by Norwegian headword.
- `norsk.ordkort.v2`: briefly keyed by text ids such as `"mann"`. These are converted through `data/legacy-ids-v2.json`. Don't edit that file. It can be deleted once nobody has v2 progress left.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then pick your branch and `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/`. Every path is relative, so it works from a sub-folder.

When you deploy changes, anyone online gets them on their next page load, because everything except fonts and icons is fetched fresh and the cache is only used offline. If you add, rename or remove a file, update the `PRECACHE` list in `sw.js` and bump `VERSION`.
