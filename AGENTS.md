# AGENTS.md

Decksterity is a spaced-repetition flashcard app (FSRS scheduling): React 19 + Vite SPA, FastAPI backend, Postgres. This file is the shared briefing for humans and AI agents. Keep it short; put detail in `docs/` and update `docs/status.md` whenever work lands.

## Read first

- `docs/architecture.md` — how the pieces actually fit together
- `docs/api.md` — the real API (vs the aspirational README/spec)
- `docs/status.md` — dated snapshot, known breakage, next steps, ownership
- `docs/lti-canvas.md` — Canvas LTI 1.3 identity/roster/grade integration research

`README.md` and `Specification.txt` describe an intended product, not current behavior. When they disagree with the code, the code wins; `docs/api.md` records the truth.

## Commands

Run from the repo root unless noted. Windows/PowerShell examples.

Frontend (`frontend/`):

- `npm install`
- `npm run dev` — Vite; dev mode uses localStorage + `src/seed.js`, no backend needed
- `npm test` — Vitest/jsdom/Testing Library
- `npm run test:watch`
- `npm run lint`
- `npm run build` — production build (`build:debug` adds sourcemaps)

Backend (`backend/app/`):

- `$env:DECKSTERITY_SECRET_KEY='dev-only'; python main.py` — serves `:8000` with reload
- Import check: `$env:DECKSTERITY_SECRET_KEY='dev-only'; python -c "import main"`
- If `python` resolves to the Windows Store alias, use `py` instead of `python`.
- `db.py` uses `DATABASE_URL` when set; otherwise falls back to Postgres on `localhost:5432`, database `mydb`, user/password `user`/`password`. `/db` still has no schema/migrations.

Full stack:

- `.\run.ps1` — local dev: Vite `:5173` + API `:8000`; flags `-Tests`, `-NoBackend`, `-Open`
- `podman compose up --build --force-recreate --detach` — Podman deployment stack; verified 2026-11-20
- Ports: frontend `:3000`, API `:8000`, Postgres `:5432`

There is a frontend Vitest suite, no backend tests, and no migration tool. Do not claim runtime behavior is verified based on lint/build/unit tests alone.

## Repo map

```text
backend/app/main.py      master FastAPI app; mounts /api and /db
backend/app/model.py     /api: in-memory decks + FSRS review engine, no auth, no DB
backend/app/db.py        /db: Postgres accounts/cards, JWT + Argon2, role hierarchy
frontend/src/store.js    data layer: dev localStorage path vs prod Axios path
frontend/src/api.js      Axios baseURL (dev localhost:8000, prod /api) + bearer interceptor
frontend/src/logic/      pure scheduling/counting/rating helpers + tests
frontend/src/hooks/      useStudySession
frontend/src/pages/      Login, Dashboard, CourseDetail, Study, Editor, Error404
frontend/src/components/ shared layout/header/stats/rating/summary + cards
frontend/src/test/       Vitest setup (jest-dom + cleanup)
frontend/vitest.config.js jsdom test config
frontend/src/seed.js     demo courses/cards for dev
frontend/src/index.css   real styling (927 lines); App.css is unused
frontend/nginx.conf      SPA fallback + /api proxy to card_backend
podman-compose.yml       card_db, card_backend, card_frontend
run.ps1                  local Vite + API runner; -Tests, -NoBackend, -Open
docs/                    architecture, API, status, Canvas LTI research
```

## Data-layer truth

- Vite dev (`import.meta.env.DEV`) → `store.js` uses `localStorage` + seeds. Production build → Axios to `/api`.
- `main.py` mounts two **independent** apps: `/api` = `model.py`, `/db` = `db.py`. Their schemas and auth models are incompatible.
- The current UI only calls `/api`. Nothing in the frontend calls `/db`; auth is a localStorage mock.
- Treat `/db` + Postgres as the intended persistence path and `/api` as the prototype. Do not casually merge their models; unify deliberately (architecture.md has a proposal).
- `db.py` raises at import if `DECKSTERITY_SECRET_KEY` is unset; `model.py` data resets on restart.

## Conventions

- Frontend: JS/JSX, function components + hooks, no TypeScript. Icons via `lucide-react`. HTTP only through `src/api.js`. Styling is plain CSS in `index.css` using CSS variables; theme via `data-theme`. Keep tests near the code they cover; use Vitest/Testing Library. Do not add dependencies without a concrete need.
- Backend: FastAPI, Pydantic v2 (`model_dump()`, not `.dict()`), timezone-aware UTC datetimes. Never log secrets, tokens, or launch JWTs.
- Identity is `(issuer, client_id, sub)` — never email. Course roles come from the signed LTI launch or NRPS, never from a request body or the frontend.
- Config/secrets via environment variables only. Never commit `.env`, private keys, tokens, or DB dumps.
- Do not add comments to code unless the surrounding file already relies on them.

## Agent safety protocol

Permission rules are not enforced per command under T3 (its session overrides `opencode.json`), so these are self-imposed:

- Ask the user before editing `AGENTS.md` or any other agent/config policy file.
- Ask before deleting anything (no recursive delete, `git clean`, or untracked/ignored removal), and before force-push, history rewrites, publish/deploy, or dependency installs/upgrades.
- Prefer reversible actions: move instead of delete, `git restore` instead of overwrite, and a commit or worktree before risky changes.
- Plan first on destructive or wide-reaching work: list the exact commands and targets, then wait.
- Stay in the workspace: no `~/.ssh`, external `.env` or credential files, registry, services, or system settings.
- Dry-run (`-WhatIf`, `--dry-run`), verify paths with `Test-Path`, work in small batches, run lint/build after changes.
- When in doubt, ask.

## Known landmines (details in docs/status.md)

1. `/db` schema is auto-created at startup but is not migration-managed; `setup_global_admin` is unauthenticated (`db.py:293-302`).
2. `/api` has no auth and accepts a client-supplied `created_by` (`model.py:198-203`). `/db` issues JWTs with no `exp` (`db.py:192-198`).
3. README/Specification claim `/register`, `/auto-login`, `/courses`, `PUT /cards/{id}` — they do not exist. `docs/api.md` is authoritative.
4. Prod `/api` has no `new` flag and only a `default` deck, so new-card counts and multi-course UX are dev-only (`model.py:221`, `store.js`).
5. Frontend fixes are unit/component-tested but not browser-verified: dev persistence, direct `/study/:id`, add-card saving, and prod review/stats calls.
6. Auth is a localStorage mock in Vite dev; production reads `/api/me` from the LTI session. LTI Phase 0/1 is implemented and locally smoke-tested, but not verified in Canvas.

## Definition of done

- Frontend: `npm test`, `npm run lint`, and `npm run build` pass.
- Backend: import check passes and the touched endpoint works (TestClient or curl).
- Data/API change: update `docs/api.md`; add a dated line to `docs/status.md`.
- LTI change: verify in Canvas beta/test with at least one teacher and one student; update `docs/lti-canvas.md`.
- Do not mark a known issue fixed without exercising the actual path.

## Working with other agents

- Read `docs/status.md` before starting; claim files/areas there if working in parallel.
- Keep changes scoped. Do not rewrite unrelated modules or “clean up” the CSS/data models in the same PR.
- Record decisions and gotchas in `docs/`, not only in chat.
- Only commit when the user asks.
