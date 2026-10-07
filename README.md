<p align="center">
  <img src="app/public/favicon.svg" alt="Vocabook logo" width="88" height="88">
</p>

<h1 align="center">Vocabook</h1>

<p align="center">
  A living vocabulary notebook: every word you met, where you met it.<br>
  <a href="https://dmrgveli.github.io/vocabook/"><strong>Open Vocabook →</strong></a>
</p>

---

Vocabook is a notebook for English words you pick up from shows, books, podcasts and
conversations. It is not a test app. You write a word down in a few seconds, note where
you met it, and the notebook fills in the rest: definitions, pronunciation, how common the
word is and the words it is usually used with. Coming back to your words is an invitation,
never a quiz.

It runs in the browser on desktop and on phones, works offline, and can sync across your
devices with a Google account.

## Features

- **Quick add** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>): type a word, pick a suggestion, say where you met it. Adding a word you already have records a new encounter instead.
- **Word pages** with definitions and examples, IPA, read-aloud with the browser's own voices (normal and slow), recordings when available, and real-world clips on demand.
- **How common is it?** Every word shows the thousand its word family falls in (1K–25K) on Paul Nation's BNC/COCA lists.
- **Used together with:** a compact map of the words that most often come right before and after it.
- **Your own layer:** your translation, your own sentence, every encounter (source, sentence, date), notes, and a simple self-rating: *Seen it → Know it → Use it*.
- **Look-ups everywhere:** click any word in a definition for a small card with its level, pronunciation and meaning, and add it in one step.
- **Notebook views:** search, filter by level, mastery or source, sort and group your words.
- **Gentle reminders:** once you have 10 words, opening the app may suggest a few you haven't looked at in a while. Easy to dismiss or turn off.
- **Profile:** streaks, a six-month activity map and achievements, all derived from your notebook.
- **Sync:** sign in with Google to keep the notebook in sync. Local-first: everything is saved in your browser first.
- Light and dark themes, desktop-first layout that also works on phones.

## How it is built

```
app/      React + TypeScript + Vite single-page app      → GitHub Pages
worker/   Cloudflare Worker (sync API)                   → Cloudflare, R2 storage
```

- **App:** React 19, TypeScript, Vite, React Router (hash routes), IndexedDB via `idb`, Motion for animation, Lucide icons. Words are written to IndexedDB first; sync runs in the background.
- **Sync:** the Worker verifies the Google ID token on every request (signature, audience, issuer, expiry), stores one JSON document per user in R2 under a path derived only from the token's subject, allows only the app's origin (CORS), caps bodies at 2 MB, validates their shape and uses ETag-conditional writes. Clients merge per entry, per encounter and per note.
- **Dictionary data** is copied into each word when it is added, so the notebook keeps working if an API is down. It is a per-device cache and is not synced.

## Running it locally

Requirements: Node.js 24 and npm.

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test
npm run build
```

Without any configuration the app works fully on your device; sign-in and sync are simply
switched off. To enable them locally, copy `app/.env.example` to `app/.env.local` and fill in
your own values (see [Configuration](#configuration)).

### Worker

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # local-only settings, git-ignored
npm test
npm run dev
```

## Configuration

Nothing secret is stored in this repository. Account-specific values live in the services
that need them:

| Value | Where it is set | Secret? |
|---|---|---|
| Google OAuth client ID (app) | GitHub → Settings → Secrets and variables → Actions → **Variables** → `GOOGLE_CLIENT_ID` | No, but kept out of the repo |
| Sync API URL (app) | GitHub Actions variable `SYNC_URL` | No |
| Google OAuth client ID (Worker) | `wrangler secret put GOOGLE_CLIENT_ID` | Stored as a Worker secret |
| Allowed origins (Worker) | `worker/wrangler.jsonc` → `ALLOWED_ORIGINS` | No |
| Cloudflare account ID | GitHub Actions variable `CLOUDFLARE_ACCOUNT_ID` | No |
| Cloudflare API token (for CI deploys) | GitHub Actions **secret** `CLOUDFLARE_API_TOKEN` | **Yes** |
| Local overrides | `app/.env.local`, `worker/.dev.vars` | Git-ignored |

A Google OAuth client ID is public by design (the browser needs it), but this repository
does not hard-code one so forks use their own.

## Deployment

- Pushing to `main` builds, tests and deploys the app to GitHub Pages (`.github/workflows/pages.yml`).
- Changes under `worker/` are type-checked and tested by `.github/workflows/worker.yml`; they are deployed when the `CLOUDFLARE_API_TOKEN` secret exists, or manually with `npx wrangler deploy`.
- The word-level table is generated from the BNC/COCA lists with `node app/scripts/build-levels.mjs <folder with basewrd*.txt>`.

## Data sources and credits

- [Free Dictionary API](https://dictionaryapi.dev/) — definitions, examples, recordings and origins (from Wiktionary, CC BY-SA)
- [Datamuse API](https://www.datamuse.com/api/) — suggestions, collocations, related words, backup definitions
- [BNC/COCA word family lists](https://www.wgtn.ac.nz/lals/resources/paul-nations-resources/vocabulary-analysis-programs) — Nation, I.S.P. (2017). *The BNC/COCA Level 6 word family lists* (Version 1.0.0). Victoria University of Wellington. Licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); `app/public/bnc-coca-levels.json` is a derived work under the same licence.
- [YouGlish](https://youglish.com/) — pronunciation in real YouTube videos (loaded only after consent; [YouTube Terms](https://www.youtube.com/t/terms), [Google Privacy Policy](https://policies.google.com/privacy))
- [Google Identity Services](https://developers.google.com/identity/gsi/web) and [Cloudflare Workers & R2](https://developers.cloudflare.com/workers/)
- Typefaces [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) and [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) (SIL OFL), icons by [Lucide](https://lucide.dev/) (ISC)

## Creator

Made by **[@dmrgveli](https://instagram.com/dmrgveli)**.
