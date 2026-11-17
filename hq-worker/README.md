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
- Worker secrets: `KEY` (set from `HQ_KEY` by the deploy), later `ANTHROPIC_API_KEY` (`npx wrangler secret put ANTHROPIC_API_KEY`, or add it as a GitHub secret and to the workflow).
- Local testing: `hq-worker/.dev.vars` with `KEY=...` (git-ignored), then `npx wrangler dev`.

## API
Every call needs header `X-Key: <password>`. 10 wrong tries from one IP = locked for 10 minutes.
- `GET /` health check (no password).
- `GET /api/ping` password check.
- `GET /api/board` → `{ projects, tasks, notes, suggestions, lastSweep, updated }`.
- `GET /api/export` → everything (backup). The page's footer "Backup" link downloads it.
- `POST /api/projects` upsert a project by `id`.
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
2. Tasks, waiting-on, repeating, Later, Always remember, add/edit/tick/delete, trash, export.
3. Suggestions tray + Start ▶. 4. Scheduled sweep + review. 5. Scoreboard, headline, animations, dark mode.
6. Life Admin + habits. 7. Tools (Nicky 2026-11-17; no invoices/expenses/tax/subscriptions): Notes → Tasks, Brand kits, Proof bank, Content calendar, Swipe file, Tallulah tracker, Pitch tracker, Focus timer. 8. 30-day remember-me + Touch ID.
