# Tasks HQ

Private task board at **https://pezzamedia.com/hq/** (page code in `dist/hq/`), with all data in a
Cloudflare Worker (`hq-worker/`). Read this before changing anything.

## Pieces
- `dist/hq/index.html`, `tq.css`, `tq.js`: the page. Plain HTML/CSS/JS, `noindex, nofollow`, all classes start `tq-`.
- `dist/hq/config.js`: `window.TQ_API` = the Worker address (not secret; useless without the password).
- `dist/hq/logos/`: project logos (transparent PNGs).
- `hq-worker/src/index.js`: the Worker + one Durable Object `Board` (SQLite-backed, free plan) that holds everything as one JSON document under the storage key `board`.
- `.github/workflows/deploy-hq-worker.yml`: deploys the Worker on every push to main that touches `hq-worker/`, or by hand (Actions > Deploy Tasks HQ Worker > Run workflow).

## Secrets (never in this repo)
- GitHub repo secrets: `CLOUDFLARE_API_TOKEN` (Cloudflare token from the "Edit Cloudflare Workers" template), `HQ_KEY` (the HQ password; same as the Jobs HQ password so one password opens both).
- Worker secrets: `KEY` (set from `HQ_KEY` by the deploy) and `ANTHROPIC_API_KEY` (set from the GitHub secret of the same name by the deploy, if present).
- Local testing: `hq-worker/.dev.vars` with `KEY=...` (git-ignored), then `npx wrangler dev`.

## API
Every call needs header `X-Key: <password>`. 10 wrong tries from one IP = locked for 10 minutes.
- `GET /` health check (no password).
- `GET /api/ping` password check.
- `GET /api/board` → `{ projects, tasks, notes, suggestions, lastSweep, updated }`.
- `GET /api/export` → everything (backup). The page's footer "Backup" link downloads it.
- `POST /api/projects` upsert a project by `id`.
- `POST /api/tasks` add `{ project, kind, text, due?, who?, asked?, repeat?, detail?, link?, source? }`.
- `PUT /api/tasks/:id` edit (same fields). `DELETE /api/tasks/:id` → bin (response has `trashed` = bin id for Undo).
- `POST /api/tasks/:id/done` `{ done: true|false }`. Ticking a repeat adds the next copy (due + period) and stores `nextId`; unticking removes that copy if it wasn't touched.
- `POST /api/tasks/:id/chased` resets `asked` to today.
- `POST /api/notes` `{ project, text, detail? }` (Always remember rules), `PUT/DELETE /api/notes/:id`.
- `POST /api/trash/:tid/restore` puts a binned item back.
- `POST /api/suggestions` `{ items: [{ project, kind, text, why, source, due?, who?, repeat?, detail?, link?, by? }] }` → `{ posted, skipped }`. Skips anything that looks the same (80% word overlap) as an open suggestion, the suggestion log (added + dismissed) or an open task.
- `GET /api/suggestions/log` → `{ log, open }` (the sweep reads this so nothing reworded comes back).
- `POST /api/suggestions/:id/add` | `/dismiss` | `/comment {text}` | `/reply {comment, reply, changes?}` (reply = the sweep answering a comment the instant fix missed; open comments have `pending: true`).
- Comment fix: Worker calls Claude (`claude-opus-5-5`, effort low, structured JSON, server-side fallback) with the suggestion + comment, applies the changes, can accept/dismiss only if she clearly says so, and pins a rule to Always remember when the comment is a lasting rule.
- `PUT /api/settings { claudeFolder }` (folder for Start ▶). `POST /api/sweep { lastSweep, summary }` for the background sweep.
- Start ▶ = `claude://code/new?q=<prompt>&folder=<claudeFolder>`; the prompt carries the task id and how to tick it done via the API.
- All change calls send `today` (her local YYYY-MM-DD) and return the whole board.
- `DELETE /api/projects/:id` moves it to trash.
- `GET /api/trash` → last 500 deleted items `{ kind, item, deleted }`.

## Data shapes
- Project: `{ id, name, group: "work"|"tools"|"personal", blurb, logo, color, dashboard, order }`.
- Task (stage 2): `{ id, project, kind: "task"|"waiting"|"repeat", text, due?, detail?, link?, source?, who?, asked?, repeat?, done?, created }`.
- Counters: open = not done and (no due date or due within 7 days); waiting-on counts once 5+ days old. Red when due within 2 days or someone needs chasing.

## Jobs HQ
`pezzamedia.com/jobs/` stays its own page with its own encrypted data and sweep (see `/mnt/project-files/upwork/hq/README.md`).
The "Looking for a job" work card on Tasks HQ opens it (its counter = Today items still to do; red if one is marked hot). If both use the same password, Tasks HQ decrypts the jobs file to show the open-jobs badge and hands the password over, so Jobs HQ opens without asking again. Tasks HQ is the main HQ; Jobs HQ is a sub-part of it and has no link back (Nicky, 2026-11-17).

## Deploying
- Page: commit to `main` (GitHub Pages). Bump `?v=` on `tq.css` / `tq.js` in `index.html` to bust caches.
- Worker: commit to `main` under `hq-worker/` (or run the workflow by hand). Check the Actions log for the `workers.dev` address.

## Testing rules
Use clearly marked TEST items and delete them afterwards. Never tick or delete real tasks to test.

## Stages
1. ✅ Worker + Board + password + lock screen + project cards (logos, counters, empty panel). Work row: SN, Tmrw, Pezza Media, Looking for a job (opens Jobs HQ). Personal row: Study, Family research, Tallulah writing, Frolicking Nicky. New default cards reach the live Board by bumping SEED_VERSION in the Worker.
2. ✅ Tasks, waiting-on, repeating, Later, Done (14 days, untick), Always remember, add/edit/tick/delete (tap twice), Bin + restore, Undo toasts, export.
3. ✅ Suggestions tray (Add / Dismiss / Comment with instant AI fix) + Start ▶ + Settings. 4. Scheduled sweep + review. 5. Scoreboard, headline, animations, dark mode.
6. Life Admin + habits. 7. Tools (Nicky 2026-11-17; no invoices/expenses/tax/subscriptions): Notes → Tasks, Brand kits, Proof bank, Content calendar, Swipe file, Tallulah tracker, Pitch tracker, Focus timer. 8. 30-day remember-me + Touch ID.
