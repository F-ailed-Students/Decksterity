# API Reference (actual behavior)

Snapshot: 2026-11-20, `main` @ `805cd7e`. Derived from `backend/app/main.py`, `model.py`, and `db.py`. This file is authoritative over `README.md` and `Specification.txt`.

Base URL: `http://localhost:8000` in local dev. In the Podman stack, use same-origin `/api` on `http://localhost:3000`; nginx proxies it to `card_backend`. The master app mounts two independent apps:

- `/api` — in-memory decks/cards/FSRS prototype, **no auth**
- `/db` — Postgres accounts/cards, **JWT auth** on some routes

Errors are FastAPI’s standard `{"detail": "..."}`. Validation failures are `422` with a detail array. There is no versioning and no OpenAPI customization per sub-app.

## `/api` endpoints

| Method | Path | Auth | Purpose | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/decks` | none | List decks | Only `{"id","name"}`; starts with `default` |
| POST | `/api/deck_create` | none | Create deck | Returns a message string containing the generated id, not JSON fields |
| GET | `/api/decks/{deck_id}/cards` | none | List cards in a deck | Card shape below |
| POST | `/api/decks/{deck_id}/cards/add` | none | Add card | `created_by` is accepted from the body |
| GET | `/api/cards` | none | All cards across decks | Return annotation is `List[Flashcard]` while the handler returns dicts; output shape is unreliable |
| GET | `/api/stats` | none | Global counts | `{due,new,reviewedToday}` |
| GET | `/api/decks/{deck_id}/stats` | none | Per-deck counts | Missing deck raises `KeyError` → 500 |
| POST | `/api/review` | none | Apply FSRS review | `rating` must be 1–4; invalid values silently become Good |
| PATCH | `/api/decks/{deck_id}/cards/{card_id}` | none | Edit card fields | Uses deprecated Pydantic `.dict()` |

Data resets whenever the backend process restarts.

### Card shape (`/api`)

`GET /decks/{id}/cards` returns, per card:

```json
{
  "id": 1,
  "front": "Question text",
  "back": "Answer text",
  "subject": null,
  "Created By": "",
  "due": 1760000000000,
  "stability": 1.2931,
  "difficulty": 5.0
}
```

- `due` is epoch **milliseconds**.
- There is no `new` field; `getNewCards()` in the frontend therefore never sees new cards in prod.
- `Created By` has a space and is derived from `created_by.display_name`.
- `stability`/`difficulty` may be `null`.

### Requests

`POST /api/deck_create`

```json
{ "name": "Neuroanatomy" }
```

Response:

```json
{ "message": "Deck Neuroanatomy created, id: Neuroana_ab12Cd" }
```

`POST /api/decks/{deck_id}/cards/add`

```json
{
  "front": "What is the blood supply to the head of the femur?",
  "back": "Medial circumflex femoral artery...",
  "subject": "Anatomy",
  "is_public": false,
  "created_by": { "id": 7, "email": "teacher@example.edu", "display_name": "Dr. Lee", "account_type": "Teacher" }
}
```

`created_by` is optional but entirely client-controlled; treat it as untrusted and remove it when auth lands.

`POST /api/review`

```json
{ "deck_id": "default", "card_id": 1, "rating": 3 }
```

Response: `{ "next_review": 1760000000000 }`. Rating mapping is `1=Again, 2=Hard, 3=Good, 4=Easy` (`model.py:82-95`). Anything else becomes Good.

`PATCH /api/decks/{deck_id}/cards/{card_id}` accepts any subset of `front`, `back`, `subject`, `is_public`.

### Example

```bash
curl http://localhost:8000/api/decks
curl -X POST http://localhost:8000/api/deck_create -H "Content-Type: application/json" -d "{\"name\":\"Test\"}"
curl http://localhost:8000/api/decks/default/cards
curl -X POST http://localhost:8000/api/review -H "Content-Type: application/json" -d "{\"deck_id\":\"default\",\"card_id\":1,\"rating\":3}"
```

## `/db` endpoints

All routes below are under `/db`. Most accept an optional `X-Database-Name` header; only `mydb` is allowed.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/db/login` | none | Email/password → HS256 JWT |
| POST | `/db/cards` | Bearer | Create card owned by current user |
| GET | `/db/cards/{card_id}` | none | Read one card |
| DELETE | `/db/cards/{card_id}` | Bearer | Delete own card |
| PATCH | `/db/cards/{card_id}/promote` | Bearer, role `Teacher` | Set `is_public = true` |
| POST | `/db/users/admin/setup` | none | Create the initial `GlobalAdmin` |
| POST | `/db/users` | Bearer | Create Student/Teacher (GlobalAdmin only for Teacher) |
| DELETE | `/db/users/{target_user_id}` | Bearer | Delete a user below the requester’s role |

Notes:

- `POST /db/login` body: `{"email_address":"...","password":"..."}`. Response: `{"message":"Login successful","access_token":"...","token_type":"bearer"}`.
- The JWT payload is `{"sub": account_id, "role": type}` and has **no `exp`** (`db.py:192-198`). Nothing revokes tokens.
- `POST /db/cards` body: `{"course_id":1,"tag":"...","is_public":false,"front_text":"...","back_text":"..."}`. The DB schema (`accounts`, `cards`) is assumed, not created.
- `POST /db/users/admin/setup` body: `{"email":"...","password":"...","display_name":"...","role":"..."}`; `role` is ignored and `GlobalAdmin` is always used. The route has no auth.
- `PATCH /db/cards/{id}/promote` checks `role != "Teacher"`, so `GlobalAdmin` gets 403.
- `DATABASE_URL` is used when set (compose: `postgresql://user:password@card_db:5432/mydb`); without it, credentials fall back to `user`/`password` on `localhost:5432`.
- The VM volume starts empty: there is no schema/migration, so `/db/login` currently returns 500 against a fresh database. This is not an authentication failure.

### Example

```bash
curl -X POST http://localhost:8000/db/login -H "Content-Type: application/json" -d "{\"email_address\":\"a@b.c\",\"password\":\"secret\"}"
curl -X POST http://localhost:8000/db/cards -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"course_id\":1,\"tag\":\"x\",\"is_public\":false,\"front_text\":\"Q\",\"back_text\":\"A\"}"
```

## Frontend usage matrix

| `store.js` function | Dev path | Prod path | Status |
| --- | --- | --- | --- |
| `fetchCourses` | localStorage (seed fallback) → `coursesCache` | `GET /api/decks` | Prod only ever sees the `default` deck |
| `fetchCards` | seeds filtered by `courseId` | `GET /api/decks/{id}/cards` | Per-course in-flight promise; not runtime-tested |
| `addCard` | localStorage via `dev_getCards()` | `POST /api/decks/{id}/cards/add` | Editor requires both sides; saving not runtime-tested |
| `rateCard` | local SM-2 with 0–3 | `POST /api/review` with 1–4 | UI 0–3 mapped to API 1–4; unit-tested |
| `getCourseStatistics` | local counts | `GET /api/decks/{id}/stats` | Unwraps `{due,new}`; unit-tested, not backend-tested |
| `fetchStats` | local counts | `GET /api/stats` | Used by `Sidebar` |

Nothing in the frontend calls `/db`, and nothing calls `PATCH /api/decks/{id}/cards/{id}`, `POST /api/deck_create`, or `GET /api/cards`.

## Documented but not implemented

`README.md` / `Specification.txt` describe a different product. These do **not** exist:

| Documented | Closest reality |
| --- | --- |
| `POST /register` | `POST /db/users/admin/setup` or `POST /db/users`; mock signup in the SPA |
| `POST /auto-login` | Nothing; JWT is returned by `POST /db/login` |
| `POST /courses`, `POST /courses/join` | No course endpoints at all |
| `PUT /cards/{id}` | `PATCH /api/decks/{deck_id}/cards/{card_id}` or `/db` promote |
| `POST /cards/{id}/promote` | `PATCH /db/cards/{card_id}/promote` |
| cookie-based sessions | JWT in a response body; `localStorage.token` is read but never set |

## Proposed LTI endpoints (not implemented)

For design detail see `lti-canvas.md`. These are placeholders, not a contract:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/lti/jwks` | Tool public keys for Canvas |
| GET, POST | `/lti/login` | OIDC third-party initiation from Canvas |
| POST | `/lti/launch` | Validate `id_token`, create session, redirect to SPA |
| POST | `/lti/deep-link` | Return deep-linking content-item form |
| GET | `/api/me` | Current LTI session identity + course role |
| GET | `/api/courses` | Courses visible to the current identity |
| POST | `/api/reviews` | Persist a review for the current identity |
| GET | `/api/courses/{id}/roster` | Teacher/TA-only NRPS roster |
| POST | `/api/courses/{id}/grade-sync` | Push aggregate score via AGS |

## LTI 1.3 endpoints (Phase 0/1)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/lti/jwks` | none | Tool public JWK for Canvas |
| GET, POST | `/lti/login` | none | OIDC login initiation |
| POST | `/lti/launch` | none | Validate launch JWT, create session, redirect to SPA |
| GET | `/lti/logout` | cookie | Clear the LTI session |
| GET | `/api/me` | cookie | Current identity, context, role, and permissions |

Notes:

- `LTI_PUBLIC_BASE_URL`, `LTI_ISSUER`, `LTI_CLIENT_ID`, `LTI_DEPLOYMENT_ID`, and `LTI_PRIVATE_KEY_PEM`/`LTI_PRIVATE_KEY_PATH` configure the registration and signing key.
- Role normalization follows the Canvas TA sub-role rules in `lti-canvas.md`.
- The endpoints create their own LTI tables on startup. Canvas itself has not been used to verify them yet.

## Development notes

- `api.js` uses `http://localhost:8000/api` in dev and same-origin `/api` in production. nginx proxies `/api/` to `card_backend` without stripping the prefix.
- `main.py` allows all origins/methods/headers. Tighten before exposing credentials or cookies.
- The frontend and backend are separate origins in dev. Use a Vite proxy (recommended) or HTTPS plus `SameSite=None; Secure`; `Secure` cookies will not work over plain HTTP.
- FastAPI’s generated docs are available at `/docs` and `/api/docs`; the `/db` docs are at `/db/docs`.
