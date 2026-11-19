# Architecture

Snapshot: 2026-11-19, `main` @ `2dd1871`. This describes the code as it exists, then the intended direction. For bugs and current work see `status.md`.

## System context

```text
┌──────────────────────────────┐
│ Browser                      │
│ React 19 SPA (Vite build)    │
│  localStorage: theme, mock   │
│  auth, dev courses/cards     │
└──────────────┬───────────────┘
               │ HTTP (Axios)
               │ dev: :8000/api
               │ prod: same-origin /api (nginx)
┌──────────────▼───────────────┐        ┌────────────────────┐
│ FastAPI master app (:8000)   │        │ Postgres 15        │
│  /api  → model.py            │        │  localhost:5432    │
│         in-memory FSRS decks │        │  db: mydb          │
│  /db   → db.py               │───────▶│  user/password     │
│         accounts + cards     │        │  (hardcoded)       │
└──────────────────────────────┘        └────────────────────┘
```

There is no LTI integration yet. `lti-canvas.md` is the design for adding one.

## Runtime topology

| Mode | Frontend | Backend | Postgres |
| --- | --- | --- | --- |
| Vite dev (`npm run dev`) | Vite dev server, default `:5173` | Optional; only needed for prod-style API calls | Optional |
| Local backend | `npm run dev` | `python main.py` on `:8000` | Needed for `/db` |
| Compose (intended) | nginx `:3000` → `:80` | `:8000` | `:5432` |

Compose is currently broken because service names and `DATABASE_URL` disagree (`status.md`). CORS is `allow_origins=["*"]` in `main.py`, so the SPA can call either prefix.

## Backend

### `backend/app/main.py`

- Creates `master_app` and mounts two complete FastAPI apps at `/db` and `/api` (`main.py:19-20`). Each sub-app has its own OpenAPI schema, models, and error behavior.
- Runs with `uvicorn.run("main:master_app", host="0.0.0.0", port=8000, reload=True)` only when executed directly.
- Imports `db.py`, which requires `DECKSTERITY_SECRET_KEY` at import time; `model.py` does not.

### `/api` — `model.py` (prototype)

- In-memory `decks: Dict[str, Deck]` seeded with one `"default"` deck; all data is lost on restart (`model.py:221`).
- Uses the `fsrs` package (`Scheduler`, `Card`, `Rating`, `ReviewLog`) with 21 custom parameters, 0.9 desired retention, learning steps, fuzzing (`model.py:38-67`).
- Cards are `Flashcard` dataclasses holding Pydantic `AccountPublic` creator data; responses expose `due` as epoch milliseconds and FSRS `stability`/`difficulty` (`model.py:145-158`).
- No authentication, no users, no course membership, no persistence.
- Rating is 1–4 in the endpoint/scheduler; unknown values silently become `Rating.Good` (`model.py:82-95`).
- `StudyService` (`model.py:70-104`) is unused; endpoints call `Flashcard.process_review` with the module-level scheduler.
- `CardCreate.created_by` is accepted from the request body (`model.py:198-203`), so creator attribution is spoofable.
- `PATCH /decks/{deck_id}/cards/{card_id}` still calls Pydantic v1 `.dict()` (`model.py:342`).

### `/db` — `db.py` (intended persistence path)

- Postgres via `psycopg2.pool.SimpleConnectionPool`; pool created lazily per database name. Credentials and host are hardcoded (`db.py:33-40`), and `DATABASE_URL` from compose is ignored.
- Only `mydb` is allowed (`ALLOWED_DATABASES`). Clients choose the DB with `X-Database-Name` (default `mydb`).
- Auth: email/password login, Argon2 hashing, HS256 JWT with payload `{sub: account_id, role}` and **no expiry** (`db.py:192-198`).
- Roles: `Student` (1), `Teacher` (2), `GlobalAdmin` (3) (`db.py:145-149`).
- Assumed schema (not created by code):
  - `accounts(id, email_address, password, display_name, type)`
  - `cards(id, created_by, course_id, tag, is_public, front_text, back_text, date_created)`
- The UI does not call this app. `frontend/src/api.js` points only at `/api`.
- Endpoint behavior: `/login`, card create/get/delete/promote, admin setup, user create/delete. There is no `/register`, no `/auto-login`, and no course or review endpoint.
- `POST /users/admin/setup` is unauthenticated by design apology (`db.py:293-302`), and `promote` requires exactly `Teacher`, so `GlobalAdmin` is denied (`db.py:271`).

### Model mismatch

The two sub-apps do not share:

| Concern | `/api` | `/db` |
| --- | --- | --- |
| Card fields | `front`, `back`, `subject`, `is_public`, `created_by`, `due`, `stability`, `difficulty` | `front_text`, `back_text`, `tag`, `course_id`, `is_public`, `created_by`, `date_created` |
| Identity | none | `accounts.id` + JWT |
| Scheduling | FSRS package state | none |
| Decks/courses | in-memory `Deck` | `courses` table absent; `cards.course_id` assumed |
| Ratings | 1–4 | no review endpoint |

Do not merge these incrementally. Pick `/db` + Postgres as the source of truth, define the review model deliberately, and keep `/api` only as a compatibility shim if needed.

## Frontend

### Composition

- `main.jsx` renders `App` directly; `App.jsx` mounts `ThemeProvider` and `AuthProvider` once.
- Providers: `ThemeProvider` (`sr_theme`, `data-theme` on `<html>`) and `AuthProvider` (`sr_account_profile`). Their contexts/hooks live in `ThemeContext.js`/`AuthContext.js` so the provider files export only components.
- Routes (`App.jsx:19-27`): `/login`, `/`, `/courses/:id`, `/courses/:id/edit`, `/study/:id`, `/404`, fallback redirect.
- `AccountMenu` is rendered globally, shows the mock user's name when signed in, and always links to `/login`; there is no account/logout page (`AccountMenu.jsx:6-20`).

### Data layer (`store.js`)

Two completely separate paths selected by `import.meta.env.DEV`:

- Dev: `localStorage` keys `sr_courses`/`sr_cards`, seeded from `seed.js`. A module-level `coursesCache` and `cardCache` mirror data in memory.
- Prod: Axios calls through `api.js` to `http://localhost:8000/api`; caches are still module-level. `fetchPromise` dedupes the deck request, and a per-course `cardFetchPromises` map dedupes card requests.

Current effective behavior:

- `load()` reads and parses `localStorage` once and falls back to seeds only when the key is missing or parsing fails (`store.js:10-19`). Dev persistence is still not runtime-tested.
- `fetchCourses()` dev preloads each course's cards by real course id; dev-store tests cover the resulting due/new counts (`store.js:31-45`).
- `getCourse()` assumes `coursesCache` is populated. `Study` awaits `fetchCourses`/`fetchCards` before calling it; `Editor`/`CourseDetail` do the same and render errors when the course is missing (`store.js`, `useStudySession.js`).
- `getDueTime()` in `logic/scheduling.js` falls back to legacy `dueDate`, so seeded cards are classified correctly. Dev tests cover seed due/new counts.
- `getNewCards()` reads `card.new`; the `/api` response never includes `new`, so it is still empty in prod.
- `addCard()` uses `dev_getCards()` and saves the updated array in dev (`store.js:125-148`); saving is not runtime-tested. The editor disables saving until both sides are non-empty.
- `rateCard()` maps the UI's 0–3 rating to `/api`'s 1–4 scale; dev uses its own scheduler with 0–3 (`store.js:157-205`, `logic/scheduling.js`).
- `getCourseStatistics()` awaits cards in dev, computes `{due,new,reviewedToday}`, and unwraps the Axios response in prod (`store.js:216-229`, `CourseCard.jsx`). Failure falls back to a caught-up card.
- `fetchStats()` (`store.js:231-257`) feeds `Sidebar`; it is also used by tests.

### Auth

- `AuthProvider` is a localStorage mock. `signIn` assigns `Student` if a password was typed, otherwise `Guest`; `signUp` assigns `Member` (`AuthProvider.jsx:41-54`).
- No backend call, no password check, no token storage. `api.js` reads `localStorage.token`, which nothing writes (`api.js:7-13`).
- `/db` login exists but is unreachable from the UI.

### UI behavior

- `Dashboard` fetches courses and renders `CourseCard`s; “Clear all memory” is dev-only and calls `resetData()`.
- `CourseDetail` fetches courses and cards, shows due/new/total, starts study with a limit. It does not render a card list despite the README description.
- `Study` uses `useStudySession` to load/queue cards and `StudyHeader`/`StudySummary` for layout; it builds a shuffle of due + new cards and calls `rateCard` per rating. Direct navigation is no longer expected to race the caches, but this was not runtime-tested.
- `Editor` only adds cards; there is no edit/delete/promote UI. It now has loading/error states and requires both sides before saving.
- Shared page UI lives in `PageLayout`, `BackButton`, `CourseHeader`, `CourseStats`, `RatingButtons`, `StudyHeader`, and `StudySummary`.
- `FlashCard` renders KaTeX via `utils/latex.jsx` and collects an optional typed answer.
- Styling lives in `index.css` (927 lines, CSS variables, dark/light via `data-theme`); `App.css` is unused.

## Intended direction

A single, deliberately unified backend:

```text
Browser (same origin)
  ├── /api/*      app API, session-cookie auth, Postgres
  ├── /lti/*      OIDC login, launch, JWKS, deep linking, AGS/NRPS helpers
  └── /           SPA fallback
FastAPI
  ├── auth sessions (HttpOnly cookie) or dev mock
  ├── courses/decks + cards + reviews (FSRS state per user)
  ├── LTI platform/deployment config + identity mapping
  └── Postgres (migrations checked in)
```

Principles:

1. `(issuer, client_id, sub)` is the durable identity for LTI users. Course role is per `(platform, context, user)`.
2. Postgres is the only durable store; `model.py` is retired or reduced to a thin adapter over it.
3. The SPA calls one API origin. Remove the localhost base URL and mock auth for production.
4. Keep the seeded dev mode behind `import.meta.env.DEV`; verify the fixed `load()` persistence in a browser before relying on it.
5. LTI progress is stored in detail locally; gradebook passback is a separate, rate-limited projection (see `lti-canvas.md`).
6. Add schema migrations (Alembic or plain SQL files) before adding LTI tables. There is no migration tool today.

## Cross-cutting concerns

- Configuration: only `DECKSTERITY_SECRET_KEY` is read; DB credentials, JWT lifetime, LTI keys, and the public base URL need env config.
- Security: CORS `*`, no CSRF strategy, no token expiry, no rate limiting, no request-size limits.
- Errors: `/api` raises `HTTPException` with `detail`; the frontend often logs and swallows. Standardize one error envelope if the API is rewritten.
- Observability: `print()` pool logs remain in the backend; frontend course/card debug logs were removed, with `console.error` left on error paths. Do not add PII/token logging.
- Testing: frontend Vitest/jsdom tests cover logic, dev store, production store mapping, and page/component flows. There is no CI or backend test suite; use FastAPI `TestClient` or curl for backend changes.
- Privacy: nothing currently stores student data beyond localStorage; LTI/NRPS will add FERPA-relevant PII, so define retention and access rules with the integration.

## Decision log

- 2026-11-19: Documented `/api` as prototype and `/db` as intended persistence; no code unification yet.
- 2026-11-19: Chose LTI 1.3 + LTI Advantage (NRPS/AGS) over LTI 1.1; see `lti-canvas.md`.
- 2026-11-19: Keep Canvas role detection server-side from signed launch/NRPS only.
- 2026-11-19: Refactored frontend pages around shared components/hooks; added Vitest/jsdom/Testing Library and 61 tests; fixed loading/error states and data-layer count/rating/stats issues.
