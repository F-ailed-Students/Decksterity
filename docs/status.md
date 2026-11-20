# Status

**Snapshot:** 2026-11-20 · branch `main` @ `805cd7e` · 61 Vitest tests; Podman stack verified; `/db` schema still absent; browser paths not exercised.
Update this file whenever work lands. Add a dated line under “Log”, and do not remove unresolved items without exercising the real path.

## Verified this snapshot

| Check | Command | Result |
| --- | --- | --- |
| Frontend build | `npm run build` (in `frontend/`) | **Passes** — 553.97 kB JS (173.32 kB gzip), chunk-size warning |
| Frontend lint | `npm run lint` (in `frontend/`) | **Passes** — 0 errors, 0 warnings |
| Frontend tests | `npm test` (in `frontend/`) | **Passes** — 17 files, 61 tests |
| Backend import | `$env:DECKSTERITY_SECRET_KEY='dev-only'; py -c "import main"` (in `backend/app/`) | **Passes** |
| Backend runtime / `/db` | curl or TestClient | **Partial** — API up; `/db/login` 500 because tables do not exist |
| Compose stack | `podman compose up --build --force-recreate --detach` | **Passes** — all three containers up; `:3000/api/decks` 200 |
| DB connection | `podman exec card_backend python -c ...` | **Passes** — `DATABASE_URL` reaches Postgres |
| Local runner | `.\run.ps1 -Tests` | **Passes** — 61 tests, lint, build, backend import |
| LTI | — | **Not implemented**; research only |

Build, lint, Vitest, the local runner, and the Podman stack pass. Dev persistence, `addCard`, direct `/study/:id`, and production API mapping are covered by unit/component tests, but the real browser paths are not exercised. `/db` connects to Postgres but remains unusable without a schema.

## What exists

- SPA with Dashboard, CourseDetail, Study, Editor, Login, 404, theme toggle, KaTeX flashcards.
- `/api` prototype: in-memory decks, FSRS reviews, statistics. Works until restart; no auth.
- `/db` code: Postgres accounts/cards, Argon2, JWT, role hierarchy. Not wired to the UI and not schema-managed.
- Dev seed data for three medical courses.
- Podman stack for frontend/backend/Postgres; compose, nginx, and same-origin API paths now run.

No real authentication, no course membership, no UI persistence, no backend tests, no migrations, no LTI. Frontend Vitest tests and shared UI/hooks now exist.

## Known issues

Severity: P0 = blocks running/security-critical, P1 = core feature broken, P2 = correctness/robustness, P3 = cleanliness. Issue numbers are stable IDs; resolved entries are removed.

### P0 — broken or dangerous

| # | Issue | Evidence |
| --- | --- | --- |
| 1 | `POST /db/users/admin/setup` is unauthenticated and creates a `GlobalAdmin` | `db.py:293-302` |
| 2 | `/api` has no authentication; anyone can create/review cards, and `created_by` is spoofable | `model.py:198-203`, `model.py:239-252` |
| 3 | `/db` JWTs have no `exp`, so they never expire and cannot be revoked | `db.py:192-198` |
| 4 | `/db` fails on a fresh database because there is no schema/migration | `db.py:91-101`, `db.py:208-214` |

### P1 — core behavior

| # | Issue | Evidence |
| --- | --- | --- |
| 7 | Dev `load()` double-parsed JSON; code now parses once, but reload persistence is not runtime-tested | `store.js:10-19` |
| 8 | `addCard()` called undefined `getCards()`; code now uses `dev_getCards()`, but saving is not runtime-tested | `store.js:125-148` |
| 9 | Rating scale is now mapped in `store.rateCard` (UI/dev 0–3 → `/api` 1–4); production path is unit-tested, browser path is not | `FlashCard.jsx:57-72`, `store.js:160-168`, `model.py:82-95` |
| 10 | Direct `/study/:id` crashed because `getCourse()` assumed `coursesCache` was populated; `Study` now awaits `fetchCourses`/`fetchCards`, but direct navigation is not runtime-tested | `Study.jsx:22-58`, `Editor.jsx:15-22`, `store.js:103-111` |
| 11 | Prod stats now unwrap the Axios response; unit-tested with a mocked API, not exercised against a running backend | `store.js:216-229`, `CourseCard.jsx:9-14` |
| 12 | Prod dashboard shows only the backend `default` deck; seed courses are dev-only and there is no course creation/join UI | `model.py:221`, `store.js:37-64` |
| 13 | Auth is a localStorage mock; no token is stored and no backend login is called. `AccountMenu` now reflects the mock user but has no account/logout page | `AuthProvider.jsx:41-59`, `AccountMenu.jsx:7-18`, `api.js:7-13` |
| 14 | Lint, Vitest, and Podman builds pass; there is still no CI workflow | `npm run lint`, `npm test`, `podman compose up` |

### P2 — correctness/robustness

| # | Issue | Evidence |
| --- | --- | --- |
| 16 | Seed cards still use `dueDate`; `getDueTime` now falls back to it, with dev tests covering the seeded data | `seed.js:33`, `store.js:121-125` |
| 17 | `/api` cards have no `new` flag, so `getNewCards()` is empty in prod | `model.py:145-158`, `store.js:127-129` |
| 18 | Card fetches are now deduped per course; concurrent-course test added | `store.js:75-100` |
| 19 | `GET /api/cards` annotates `List[Flashcard]` but returns dicts; shape is unreliable | `model.py:263-266` |
| 20 | `PATCH` uses deprecated Pydantic v1 `.dict()` | `model.py:342` |
| 21 | `promote` requires exactly `Teacher`; `GlobalAdmin` gets 403 | `db.py:265-275` |
| 22 | CORS allows `*`, and no CSRF/rate-limit strategy exists | `main.py:11-16` |
| 23 | Dev `fetchCourses` now preloads cards by real course id; seed tests cover due/new counts | `store.js:37-45` |
| 24 | README/Specification document endpoints and behavior that do not exist | `README.md:138-153`, `Specification.txt` |

### P3 — cleanliness

| # | Issue | Evidence |
| --- | --- | --- |
| 25 | `ThemeProvider` is now mounted once in `App`; `main.jsx` only renders `App` | `main.jsx:1-4`, `App.jsx:15-16` |
| 26 | Course/card debug logs removed from `store.js` and `CourseDetail.jsx`; remaining `console.error` calls are error paths | `store.js`, `CourseDetail.jsx` |
| 27 | `App.css` unused; styling is all in `index.css` | `frontend/src/App.css` |
| 28 | `StudyService` and account models in `model.py` are unused | `model.py:70-104` |

## Active work / ownership

Frontend and deployment changes are committed. Claim areas here before parallel work:

| Area | Owner | State |
| --- | --- | --- |
| Project docs (`AGENTS.md`, `docs/*`) | this session | Updated for runner and deployment |
| Infra (compose, nginx, env) | this session | Podman stack verified; `/db` schema pending |
| Persistence/auth unification | unclaimed | Not started |
| Frontend refactor/tests | this session | Shared components/hooks extracted; 61 tests; lint/build pass; runtime untested |
| Frontend data layer fixes | this session | Unit/component-tested; runtime untested |
| Canvas LTI integration | unclaimed | Design only (`lti-canvas.md`) |

## Next steps (recommended order)

1. **Decide the target:** Postgres + `/db` is the intended persistence path. Freeze `/api` as a prototype or adapt it behind the same models; do not maintain two review models.
2. **Finish persistence:** add a schema/migration (accounts, courses, cards, reviews, LTI tables); `/db/login` still 500s on the empty volume. Add a `/health` endpoint.
3. **Unify auth:** replace the mock with backend auth or LTI session; add JWT `exp`/refresh or HttpOnly sessions; remove client-supplied identity.
4. **Repair the data layer:** finish per-course fetch dedupe, rating mapping (choose 0–3 or 1–4 end-to-end), seeded `due`, prod stats unwrapping, and verify the changed dev paths.
5. **Implement LTI:** follow the phases in `lti-canvas.md`; identity/roles first, then progress persistence, then NRPS, then AGS/deep linking.
6. **Add guardrails:** keep the frontend Vitest suite green, add a minimal `pytest` suite for FSRS/roles/launch validation, and run both in CI.

## Open questions

- What is the public HTTPS URL/domain for the tool (needed for Canvas developer key, redirect URIs, cookies)?
- Which Canvas environment is available for testing (Free-for-Teacher, beta, institution)? Who can create the developer key?
- Should TA and Professor both edit cards, or should TA be read-only/grade-only? Current role model only has Student/Teacher.
- Grade passback policy: one grade per course or per deck? Based on completion, accuracy, or FSRS mastery?
- Is third-party-cookie behavior in the Canvas iframe acceptable, or should the app open top-level/new tab?

## Log

- **2026-11-19** — Added `AGENTS.md` and `docs/architecture.md`, `docs/api.md`, `docs/status.md`, `docs/lti-canvas.md`. Recorded build/lint/import results. No application code changed.
- **2026-11-19** — Canvas LTI 1.3 research completed; chose LTI Advantage (NRPS + AGS) and `(iss, client_id, sub)` identity. Canvas cloud endpoints: OIDC `sso.canvaslms.com/api/lti/authorize_redirect`, JWKS `.../api/lti/security/jwks`, token `.../login/oauth2/token`; `iss` remains `canvas.instructure.com`.
- **2026-11-19** — Fixed all 21 lint errors and 2 warnings. Removed dead imports/state/params, split `AuthContext`/`ThemeContext` out of provider files, made `Study` load data asynchronously, fixed `load()`/`addCard()`, and corrected the LaTeX regex escape. `npm run lint` and `npm run build` pass. Runtime not exercised.
- **2026-11-19** — Added Vitest/jsdom/Testing Library characterization tests, extracted scheduling logic, fixed dev due/new counts, production stats unwrapping, rating mapping, per-course fetch dedupe, and study-session progress. `npm test` and lint pass.
- **2026-11-19** — Refactored frontend pages around shared layout/header/stat/rating/summary components and `useStudySession`; fixed loading/error states, duplicate `ThemeProvider`, account label, empty-card save, and card-stat failures. Added tests for error/empty states. 61 tests, lint, and build pass; browser/runtime paths still unverified.
- **2026-11-19** — Cleaned `store.js`: unified API error handling, normalized API paths, returned prod `addCard`/`rateCard` requests, parallelized dev aggregate stats, and added prod-store tests.
- **2026-11-20** — Added root `__pycache__` ignore rules, removed the tracked `.pyc`, and added `run.ps1` for local Vite + API. Verified default startup, `-NoBackend`, and `-Tests` (61 tests, lint, build, backend import).
- **2026-11-20** — Fixed Podman deployment wiring: compose service names/`DATABASE_URL`, nginx upstream and `/api` prefix, same-origin production API calls, env-driven DB config, non-reload container command, `npm ci`, and Docker build ignores. `podman compose up --build --force-recreate --detach` succeeds; `:3000`, `:3000/api/decks`, and Postgres connectivity verified. `/db` needs schema before its endpoints work.
