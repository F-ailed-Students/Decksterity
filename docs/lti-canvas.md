# Canvas LTI 1.3 Integration — Research & Design

Status: **research/design only; nothing implemented.** Researched 2026-11-19 against Canvas/Instructure and 1EdTech documentation. Verify every platform-specific behavior in a Canvas test or beta instance before relying on it.

Goal: launch Decksterity from a Canvas course, identify the user, distinguish **Student / TA / Professor**, persist each student’s FSRS progress, optionally show a roster to instructors, and optionally pass a summary grade back to the Canvas gradebook.

## 1. Recommendation

Use **LTI 1.3 Core + LTI Advantage**:

- **LTI 1.3 launch** → identity (`sub`), course context, roles, service URLs.
- **NRPS 2.0** → course roster and roles for people who have not launched.
- **AGS 2.0** → line items (gradebook columns) and scores (grades).
- **Deep Linking 2.0** → let a teacher add a Decksterity deck as a Canvas assignment and create the matching gradebook column.

Keep detailed study data in Decksterity’s Postgres. Do **not** try to store per-card review state in Canvas. Canvas gets at most one aggregate score per course/deck.

Do **not** use LTI 1.1. It is deprecated, uses OAuth 1.0a/outcomes, and does not provide the modern roster/grade services. Canvas still supports older tools, but new work should be 1.3.

## 2. What LTI does and does not provide

| Requirement | LTI mechanism | Notes |
| --- | --- | --- |
| Know who launched | `sub` claim + issuer/client_id | Stable opaque ID, not email |
| Know the course | `context.id` claim | Per platform; map to a local course |
| Know Student vs TA vs Professor | `roles` claim, NRPS | Must use context roles, not institution roles |
| Course roster | NRPS | Read-only, on demand; no enrollment webhooks |
| Save progress | Your own DB | LTI has no progress storage |
| Grade passback | AGS scores | One score per user per line item |
| Create gradebook column | AGS line items or Deep Linking | Deep Linking is the clean assignment flow |
| Single sign-on | Launch only | LTI is not a general SSO for arbitrary visitors |

LTI does not tell you when someone enrolls/drops (NRPS is a snapshot), and it does not guarantee names/emails. Request only the data you need.

## 3. Identity and roles

### 3.1 Durable identity

Key users by:

```text
(platform issuer, LTI client_id, sub)
```

- `sub` is stable for a user within a platform–client registration. It is not an email, SIS ID, or Canvas numeric ID.
- `iss` identifies the platform (`https://canvas.instructure.com` for Instructure-hosted production Canvas).
- `client_id` identifies our developer key. The same Canvas user can have a different `sub` for a different client_id.
- Course membership is per `(platform, context.id, sub)`. A person can be a Teacher in one course and a Student in another.
- Store `deployment_id` and validate it. One Canvas instance can deploy the same key multiple times.
- Optional extra identifiers: `lis_person_sourcedid` (SIS ID), `email`, `name`, and Canvas custom fields. Treat them as attributes, never as the primary key.

### 3.2 Where roles come from

The signed launch contains:

```json
"https://purl.imsglobal.org/spec/lti/claim/roles": [
  "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"
]
```

Rules:

1. **Only `.../vocab/lis/v2/membership...` roles authorize course behavior.** Institution roles (`.../institution/person#Student`, `#Instructor`, `#Administrator`) and system roles (`.../system/person#User`, `#SysAdmin`) describe the account, not this course. A user who is institution-wide “Instructor” may be a Student in the current course.
2. Normalize the scheme and case before comparing. Canvas and other platforms have shipped both `http://` and `https://` forms and sometimes omit the scheme in documentation. Compare on the path after `purl.imsglobal.org`.
3. Canvas sends **TA as a context sub-role**, not a standalone role:
   - Teacher: `.../membership#Instructor`
   - TA: `.../membership#Instructor` **plus** `.../membership/Instructor#TeachingAssistant`
   - Student: `.../membership#Learner`
   - Designer: `.../membership#ContentDeveloper`
   - Observer: `.../membership#Mentor`
4. Some non-Canvas platforms use a standalone `.../membership#TeachingAssistant`. Accept it as a fallback, but for Canvas look for the sub-role.
5. Roles can be combined. Precedence for Decksterity:
   - `TeachingAssistant` sub-role or role → **TA**
   - otherwise `Instructor` → **Teacher**
   - otherwise `Learner` → **Student**
   - `Administrator` without a context teaching role → **Admin (read-only)** unless there is also `Instructor`/TA.
   - `ContentDeveloper` → treat as Teacher for authoring, but verify the institution’s intent.
   - `Mentor` → do not grant teacher access; treat as observer/Student unless a product decision says otherwise.
6. A `StudentViewEnrollment` appears as `Learner` plus `system/person#TestUser`. Treat it as a student but exclude it from analytics if possible.
7. Never accept a role, user id, or course id from the browser. The only trusted sources are the signed launch JWT and an authenticated NRPS response.

Suggested mapping function:

```python
def normalize(role):
    return role.lower().replace("https://", "").replace("http://", "").rstrip("/")

def role_for(roles):
    normalized = [normalize(r) for r in roles]
    if any(r.endswith("membership/instructor#teachingassistant") for r in normalized):
        return "TA"
    if any(r.endswith("membership#teachingassistant") for r in normalized):
        return "TA"
    if any(r.endswith("membership#instructor") for r in normalized):
        return "Teacher"
    if any(r.endswith("membership#learner") for r in normalized):
        return "Student"
    return None
```

Store the raw role list for debugging/audit, but authorize on the normalized mapping.

### 3.3 Canvas custom fields (optional)

Canvas can add signed custom parameters such as:

- `$Canvas.user.id` → Canvas numeric user ID
- `$Canvas.course.id` → Canvas course ID
- `$Canvas.assignment.id` → assignment ID
- `$Canvas.membership.roles` → Canvas enrollment name (`StudentEnrollment`, `TeacherEnrollment`, `TaEnrollment`, …)
- `$Person.email.primary`, `$Person.name.full`, `$Canvas.user.sisSourceId`, `$Canvas.course.sisSourceId`

These arrive under `https://purl.imsglobal.org/spec/lti/claim/custom` and are signed. They are useful for support/analytics, **not** as the primary identity or authorization source. `$Canvas.membership.roles` can serve as a secondary check for TA detection if the standard role list is ambiguous in a specific Canvas version.

## 4. Launch flow

```text
Canvas (course)                Browser                     Decksterity
     │                            │                            │
     │ 1. POST/GET login init     │                            │
     │    iss, login_hint,        │                            │
     │    target_link_uri,        │                            │
     │    client_id,              │                            │
     │    lti_deployment_id       │                            │
     ├───────────────────────────>│───────────────────────────>│ /lti/login
     │                            │                            │ validate client/deployment
     │                            │                            │ create state + nonce
     │                            │<───────────────────────────┤ 302 to Canvas OIDC auth
     │ 2. OIDC authorize redirect │                            │
     │<───────────────────────────┤                            │
     │ 3. user auth, then POST    │                            │
     │    form: id_token + state  │                            │
     ├───────────────────────────>│───────────────────────────>│ /lti/launch
     │                            │                            │ validate JWT, state, nonce
     │                            │                            │ upsert user/context/role
     │                            │                            │ create session
     │                            │<───────────────────────────┤ 303 to SPA
     │                            │ 4. SPA calls /api/me       │
```

### 4.1 Login initiation

Canvas sends a form POST (support GET too) to the developer key’s **OIDC Initiation URL**, e.g. `https://tool.example.edu/lti/login`. Parameters include:

- `iss`
- `login_hint`
- `target_link_uri`
- `client_id`
- `lti_deployment_id` (some platforms use `deployment_id`)
- `lti_message_hint`

The tool must:

1. Look up the platform registration by `iss` + `client_id` (and deployment if supplied). Reject unknown registrations.
2. Validate that `target_link_uri` is an allowed launch URL for this registration.
3. Generate a cryptographically random `state` and `nonce`. Store them server-side with a short TTL (about 10 minutes), the registration, the target link, and optionally a browser-binding value.
4. Redirect (302) to Canvas’s OIDC authorization endpoint with query parameters:
   - `scope=openid`
   - `response_type=id_token`
   - `response_mode=form_post`
   - `prompt=none`
   - `client_id`
   - `redirect_uri` (must exactly match a registered redirect URI)
   - `login_hint`
   - `lti_message_hint` (if present)
   - `state`
   - `nonce`

Canvas cloud authorization endpoint: `https://sso.canvaslms.com/api/lti/authorize_redirect`.

### 4.2 Launch validation

Canvas posts `id_token` and `state` to `/lti/launch`. Validate **before** creating a session:

- [ ] `state` exists, is unused, unexpired, and matches the stored record. Delete it atomically (single use).
- [ ] JWT signature verifies with a key from the registration’s JWKS. Select by `kid`; do not trust a `jku` header.
- [ ] `alg` is the expected asymmetric algorithm (`RS256`), not `none` and not an HMAC.
- [ ] `iss` exactly matches the registration.
- [ ] `aud` equals our `client_id` (or contains it if an array).
- [ ] If `aud` has multiple values, `azp` equals our `client_id`.
- [ ] `exp`/`iat` are present and valid; allow at most ~60 seconds clock skew.
- [ ] `nonce` matches the stored nonce exactly, then delete it.
- [ ] `https://purl.imsglobal.org/spec/lti/claim/deployment_id` matches the registration.
- [ ] `https://purl.imsglobal.org/spec/lti/claim/message_type` is `LtiResourceLinkRequest` or `LtiDeepLinkingRequest` as appropriate.
- [ ] `https://purl.imsglobal.org/spec/lti/claim/version` is `1.3.0`.
- [ ] `target_link_uri` is allowed for this registration.
- [ ] `sub` is present and non-empty.
- [ ] `context.id` is present for course launches.
- [ ] Roles are parsed from the context membership URIs only.

Reject with a generic `400`/`401` and log the reason with the `sub`/deployment (never the raw token). Do not reveal which check failed to the browser.

### 4.3 Session

- Never put the launch `id_token`, access token, or client assertion in the SPA, localStorage, or a URL.
- Create an opaque server-side session row and set an `HttpOnly` cookie:
  - `Secure`
  - `SameSite=None` for the Canvas iframe (plus `Partitioned` where supported)
  - short idle/absolute expiry, rotate the session ID after launch
- Because `SameSite=None`, add CSRF protection for state-changing API calls (double-submit token or `Origin`/`Sec-Fetch-Site` checks).
- Redirect to the SPA with no sensitive query parameters.
- If third-party cookies are blocked in the iframe, test Canvas’s storage/iframe behavior and consider opening the launch top-level or using a platform-storage/postMessage fallback. Do not assume cookies work in every browser.

## 5. Canvas configuration

### 5.1 Endpoints

| Environment | Issuer (`iss`) | OIDC auth | JWKS | Token |
| --- | --- | --- | --- | --- |
| Production (Instructure-hosted) | `https://canvas.instructure.com` | `https://sso.canvaslms.com/api/lti/authorize_redirect` | `https://sso.canvaslms.com/api/lti/security/jwks` | `https://sso.canvaslms.com/login/oauth2/token` |
| Beta | `https://canvas.beta.instructure.com` | `https://sso.beta.canvaslms.com/api/lti/authorize_redirect` | `https://sso.beta.canvaslms.com/api/lti/security/jwks` | `https://sso.beta.canvaslms.com/login/oauth2/token` |
| Test | `https://canvas.test.instructure.com` | `https://sso.test.canvaslms.com/api/lti/authorize_redirect` | `https://sso.test.canvaslms.com/api/lti/security/jwks` | `https://sso.test.canvaslms.com/login/oauth2/token` |

Important:

- The OIDC/JWKS/token hosts moved from `canvas.instructure.com` to `sso.canvaslms.com`; the **issuer did not change** for production.
- Institution-hosted Canvas uses its own domain for the OIDC/JWKS/token endpoints. Always use the URLs from the actual launch/registration; do not hardcode one institution’s domain.
- Some Canvas instances still use `<canvas-domain>/login/oauth2/token`; both forms are valid, but prefer the `sso.` endpoint for cloud.
- Store all platform URLs in the DB per registration so test/beta/institution instances can coexist.

### 5.2 Developer key

Create an LTI key (manual entry or paste JSON). Required tool-side values:

- **Target Link URI**: `https://tool.example.edu/lti/launch`
- **OpenID Connect Initiation URL**: `https://tool.example.edu/lti/login`
- **Redirect URIs**: `https://tool.example.edu/lti/launch` (exact match; add test/beta as needed)
- **JWK Method**: Public JWK URL → `https://tool.example.edu/lti/jwks`
- **LTI Advantage services**: NRPS, AGS (line items, scores, results as needed)
- **Privacy level**: `public` if you need names/emails; otherwise `name_only`/`anonymous`. NRPS fields are also filtered by this.
- **Placements**: `course_navigation` for the study app, `assignment_selection` for Deep Linking.
- Copy the resulting **Client ID** and **Deployment ID** into our registration record.
- Turn the key on.

Suggested paste-JSON shape (replace domains, IDs, and URLs):

```json
{
  "title": "Decksterity",
  "description": "FSRS spaced-repetition study app",
  "oidc_initiation_url": "https://tool.example.edu/lti/login",
  "target_link_uri": "https://tool.example.edu/lti/launch",
  "redirect_uris": ["https://tool.example.edu/lti/launch"],
  "public_jwk_url": "https://tool.example.edu/lti/jwks",
  "scopes": [
    "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
    "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly",
    "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
    "https://purl.imsglobal.org/spec/lti-ags/scope/score",
    "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly"
  ],
  "extensions": [
    {
      "platform": "canvas.instructure.com",
      "domain": "tool.example.edu",
      "tool_id": "decksterity",
      "privacy_level": "public",
      "settings": {
        "placements": [
          {
            "placement": "course_navigation",
            "message_type": "LtiResourceLinkRequest",
            "target_link_uri": "https://tool.example.edu/lti/launch",
            "text": "Decksterity",
            "enabled": true
          },
          {
            "placement": "assignment_selection",
            "message_type": "LtiDeepLinkingRequest",
            "target_link_uri": "https://tool.example.edu/lti/launch",
            "text": "Decksterity deck"
          }
        ],
        "custom_fields": {
          "canvas_user_id": "$Canvas.user.id",
          "canvas_course_id": "$Canvas.course.id",
          "canvas_assignment_id": "$Canvas.assignment.id",
          "canvas_membership_roles": "$Canvas.membership.roles"
        }
      }
    }
  ]
}
```

Notes:

- The `extensions[].platform` is `canvas.instructure.com` for Canvas cloud, including beta/test keys? Confirm in the target environment; the developer-key UI may generate the correct value. Keep platform-specific values per registration.
- Deep Linking is a launch message, not a scoped service; it does not need an OAuth scope.
- You can omit `lineitem` if you never create columns, but score posting needs an existing line item.
- Placements differ by Canvas version. Confirm the JSON in the developer-key UI before saving.
- Never commit a private key. The tool’s keypair is generated/hosted by us; Canvas only needs the public JWK.

## 6. NRPS — roster and roles

Launch claim:

```json
"https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice": {
  "context_memberships_url": "https://canvas.instructure.com/api/lti/courses/123/names_and_roles",
  "service_versions": ["2.0"]
}
```

### 6.1 Token

NRPS and AGS use OAuth2 **client_credentials** with a signed JWT assertion (RFC 7523), not the launch JWT:

1. Build an assertion signed with our private key:
   - header: `alg=RS256`, `kid`
   - `iss` = our `client_id`
   - `sub` = our `client_id`
   - `aud` = platform token URL
   - `iat`, `exp` (short, e.g. 1–5 minutes), `jti`
2. POST form to the platform token URL:
   - `grant_type=client_credentials`
   - `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`
   - `client_assertion=<signed JWT>`
   - `scope=https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly`
3. Cache the access token until shortly before `expires_in`. Canvas tokens are typically usable across courses for that registration; do not request one per page.
4. On `401`, discard and retry once. On `403`, the registration lacks the scope — degrade gracefully.

### 6.2 Request

```http
GET {context_memberships_url}
Authorization: Bearer <token>
Accept: application/vnd.ims.lti-nrps.v2.membershipcontainer+json
```

Optional query parameters: `role`, `limit`, `rlid` (resource-link filter), and Canvas may use `page`. Follow `Link: <...>; rel="next"` until exhausted. Put a page ceiling and timeout on the walk.

Response:

```json
{
  "id": "https://canvas.instructure.com/api/lti/courses/123/names_and_roles",
  "context": { "id": "abc123", "label": "BIOL 201", "title": "Human Anatomy" },
  "members": [
    {
      "status": "Active",
      "name": "Jane Doe",
      "email": "jane@example.edu",
      "user_id": "0ae836b9-...",
      "roles": [".../membership#Learner"],
      "lis_person_sourcedid": "123456"
    }
  ]
}
```

Rules:

- `user_id` is the same value as the launch `sub`; use it to join to `lti_users`.
- Only `user_id` and `roles` are guaranteed. Name/email depend on the platform/privacy level. Never require them.
- Filter `status == "Active"`; handle absent status as active.
- Map roles with the same function as the launch. Verify in Canvas beta whether a TA comes back as `Instructor` + `TeachingAssistant` sub-role or only `Instructor`. If NRPS loses the distinction, use the launch/custom field for the signed-in TA and mark roster-only TAs as “TA (unconfirmed)” until they launch.
- NRPS is read-only and snapshot-based. Do not treat it as an event stream. Refresh on instructor request or a bounded schedule, not on every student page load.
- Store the roster separately from enrollment decisions; the platform remains authoritative.

## 7. AGS — gradebook and progress

Launch claim:

```json
"https://purl.imsglobal.org/spec/lti-ags/claim/endpoint": {
  "scope": [
    "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
    "https://purl.imsglobal.org/spec/lti-ags/scope/score",
    "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly"
  ],
  "lineitems": "https://canvas.instructure.com/api/lti/courses/123/line_items",
  "lineitem": "https://canvas.instructure.com/api/lti/courses/123/line_items/456"
}
```

Presence of the claim means AGS is available for this launch. Absence is normal (feature not enabled, course concluded, etc.); do not fail the launch.

### 7.1 Token

Same client-credentials assertion as NRPS, with the required scope(s):

- `https://purl.imsglobal.org/spec/lti-ags/scope/lineitem` — list/create/update/delete line items
- `https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly` — read line items
- `https://purl.imsglobal.org/spec/lti-ags/scope/score` — post scores
- `https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly` — read results

Cache per registration/context until expiry; refresh on 401 once.

### 7.2 Line items

- For an assignment launch, use the claim’s `lineitem` URL if present. That is the gradebook column for this assignment.
- Otherwise list `lineitems` with:

```http
GET {lineitems}
Authorization: Bearer <token>
Accept: application/vnd.ims.lis.v2.lineitemcontainer+json
```

- Find a line item whose `resourceLinkId` matches the launch’s `resource_link.id` (Canvas assignment id). If none, create one:

```http
POST {lineitems}
Authorization: Bearer <token>
Content-Type: application/vnd.ims.lis.v2.lineitem+json
```

```json
{
  "scoreMaximum": 100,
  "label": "Decksterity: Anatomy deck",
  "resourceId": "deck:anatomy",
  "resourceLinkId": "123456",
  "tag": "grade"
}
```

- `resourceLinkId` must match the Canvas assignment. If omitted, Canvas may create a placeholder assignment rather than attach to the real one.
- Persist the returned line item URL (`id`) and its `scoreMaximum`. Do not construct Canvas URLs by hand.
- Read line items with `Accept: application/vnd.ims.lis.v2.lineitem+json`.
- Delete/update only line items our tool owns; do not touch unrelated columns.

### 7.3 Scores

POST to `{lineitem}/scores` with:

```http
Content-Type: application/vnd.ims.lis.v1.score+json
Authorization: Bearer <token>
```

```json
{
  "userId": "0ae836b9-...",
  "scoreGiven": 82,
  "scoreMaximum": 100,
  "comment": "Deck mastery",
  "activityProgress": "Completed",
  "gradingProgress": "FullyGraded",
  "timestamp": "2026-11-19T15:04:05.123Z"
}
```

Rules:

- `userId` is the launch `sub` for that platform, not our DB id and not an email.
- `scoreMaximum` is required when `scoreGiven` is present and must be positive.
- `activityProgress` ∈ `Initialized | Started | InProgress | Submitted | Completed`.
- `gradingProgress` ∈ `NotReady | Failed | Pending | PendingManual | FullyGraded`.
- **Only `FullyGraded` is shown as a final grade.** A score posted as `Pending` can be accepted and invisible in the gradebook.
- For progress without a grade, send `activityProgress: "InProgress"` and `gradingProgress: "NotReady"`, and omit `scoreGiven`. Canvas may not display anything until a final score.
- `timestamp` should be ISO 8601 UTC and must move forward. Keep one per score update; do not send two updates with the same/older timestamp.
- Post only for students; do not grade teachers/TAs.
- Handle `401` (refresh), `403` (missing scope or line item ownership), `404` (deleted assignment), `422` (invalid/concluded course). Retry transient failures with backoff; give up on permanent ones.
- AGS is not idempotent. A retry after a timeout can duplicate work; read results back if it matters.

### 7.4 What score to send

Keep it simple and explainable in the UI:

- Detailed FSRS state stays local: card strength, due date, stability, difficulty, review log.
- Canvas score is a summary, e.g. `completed_cards / total_cards * 100` or a weighted mastery metric. Decide with the instructor; document it in the course.
- Send at session completion or a periodic checkpoint, not on every button press.
- Store `last_sent_score`, `last_sent_at`, and the line item URL to avoid redundant posts.

## 8. Deep Linking — create assignments

Use the `assignment_selection` placement so a teacher can choose Decksterity while creating a Canvas assignment.

Launch message type: `LtiDeepLinkingRequest`. Relevant claims:

```json
"https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings": {
  "deep_link_return_url": "https://canvas.instructure.com/...",
  "accept_types": ["ltiResourceLink"],
  "accept_presentation_document_targets": ["iframe", "window"],
  "accept_multiple": false,
  "auto_create": true,
  "title": "Decksterity",
  "data": "..."
}
```

Flow:

1. Validate the launch like any other, but branch on `message_type`.
2. Show the teacher a deck picker (filtered to decks they can use).
3. Build a content item:

```json
{
  "type": "ltiResourceLink",
  "title": "Decksterity: Anatomy",
  "url": "https://tool.example.edu/lti/launch?deck=anatomy",
  "lineItem": {
    "scoreMaximum": 100,
    "label": "Decksterity: Anatomy",
    "resourceId": "deck:anatomy",
    "tag": "grade"
  },
  "custom": { "deck": "anatomy" }
}
```

4. Sign a JWT with our private key:
   - `iss` = client_id
   - `aud` = platform `iss`
   - `iat`, `exp` (short)
   - `nonce` = the nonce from the launch, if required by the platform
   - `https://purl.imsglobal.org/spec/lti-dl/claim/content_items` = `[item]`
   - `https://purl.imsglobal.org/spec/lti-dl/claim/data` = settings `data`
   - `https://purl.imsglobal.org/spec/lti-dl/claim/msg` = optional message
5. Return an HTML page that auto-submits a form to `deep_link_return_url` with `JWT=<signed>`.
6. Canvas creates the assignment and, because `lineItem` is present, the gradebook column. Later launches carry the matching `lineitem` URL.

Do not invent `deck` from untrusted launch URL parameters; resolve the signed `custom`/`resource_link` and authorize the teacher for the course.

## 9. Data model

Add LTI tables to Postgres. Names are illustrative; align with the final schema and use migrations.

```sql
CREATE TABLE lti_platforms (
  id            BIGSERIAL PRIMARY KEY,
  issuer        TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  oidc_auth_url TEXT NOT NULL,
  token_url     TEXT NOT NULL,
  jwks_url      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issuer, client_id, deployment_id)
);

CREATE TABLE lti_contexts (
  id          BIGSERIAL PRIMARY KEY,
  platform_id BIGINT NOT NULL REFERENCES lti_platforms(id),
  context_id  TEXT NOT NULL,
  label       TEXT,
  title       TEXT,
  course_id   BIGINT,                 -- local course/deck mapping
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform_id, context_id)
);

CREATE TABLE lti_users (
  id           BIGSERIAL PRIMARY KEY,
  platform_id  BIGINT NOT NULL REFERENCES lti_platforms(id),
  sub          TEXT NOT NULL,
  email        TEXT,
  display_name TEXT,
  sis_id       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform_id, sub)
);

CREATE TABLE lti_memberships (
  context_id BIGINT NOT NULL REFERENCES lti_contexts(id),
  user_id    BIGINT NOT NULL REFERENCES lti_users(id),
  role       TEXT NOT NULL CHECK (role IN ('Student','TA','Teacher','Admin')),
  status     TEXT NOT NULL DEFAULT 'Active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (context_id, user_id)
);

CREATE TABLE lti_line_items (
  id              BIGSERIAL PRIMARY KEY,
  context_id      BIGINT NOT NULL REFERENCES lti_contexts(id),
  resource_link_id TEXT,
  line_item_url   TEXT NOT NULL,
  score_maximum   NUMERIC NOT NULL,
  label           TEXT,
  last_synced_at  TIMESTAMPTZ,
  UNIQUE (context_id, line_item_url)
);

CREATE TABLE study_progress (
  user_id        BIGINT NOT NULL REFERENCES lti_users(id),
  card_id        BIGINT NOT NULL REFERENCES cards(id),
  fsrs_state     JSONB NOT NULL,      -- serialized FSRS Card
  due_at         TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  review_count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE review_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES lti_users(id),
  card_id     BIGINT NOT NULL REFERENCES cards(id),
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 4),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lti_sessions (
  id         TEXT PRIMARY KEY,        -- random opaque id, hashed if desired
  user_id    BIGINT NOT NULL REFERENCES lti_users(id),
  context_id BIGINT REFERENCES lti_contexts(id),
  csrf_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lti_auth_states (
  state       TEXT PRIMARY KEY,
  nonce       TEXT NOT NULL,
  platform_id BIGINT NOT NULL REFERENCES lti_platforms(id),
  target_link_uri TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
```

Implementation notes:

- The current `cards` table (in `db.py`) is assumed, not created. Add a real schema/migration before adding foreign keys.
- `lti_platforms` is unique per deployment. Login initiation may omit the deployment id, so look up by `iss` + `client_id`, then validate the deployment from the signed `id_token`.
- Store a hash of the session cookie value in `lti_sessions`, not the raw value.
- The current `accounts` table has no LTI columns. Either add `lti_users.account_id` and create shadow accounts for authoring, or add `created_by_lti_user_id` to cards. Do not overload `accounts` without checking its constraints.
- Store the raw role list in a separate JSONB/text column if needed for diagnosis; authorize on the normalized enum.
- Do not store launch JWTs or access tokens in plaintext. If caching is required, encrypt at rest with a dedicated key and short TTL.
- Index `study_progress(due_at)`, `review_log(user_id, reviewed_at)`, and `lti_memberships(user_id)`.

## 10. App behavior and permissions

Suggested matrix:

| Action | Student | TA | Teacher | Admin (no course role) |
| --- | --- | --- | --- | --- |
| Study own cards / save own progress | yes | yes | yes | no |
| See own stats | yes | yes | yes | no |
| See class aggregate stats | no | yes | yes | read-only |
| View NRPS roster | no | yes | yes | read-only |
| Create/edit/delete cards | no | yes* | yes | no |
| Promote public cards | no | yes* | yes | no |
| Change course settings | no | no | yes | no |
| Trigger grade sync | no | yes* | yes | no |

\* Product decision: if TAs should not author content, keep TA read-only for content but allow roster/grades. Confirm with the instructor.

API rules:

- `GET /api/me` returns only the signed-in identity, current context, normalized role, and permission flags.
- Course-scoped routes resolve `(platform, context)` from the session, never from a user-supplied `course_id` alone.
- Review writes take `card_id` and `rating` only; the server records the user and timestamp.
- Never return another student’s progress to a student. Teachers see aggregates; roster access is teacher/TA only.
- Direct browser navigation outside Canvas should show “Open Decksterity from Canvas” for LTI-only deployments, while keeping a local dev bypass.

## 11. FastAPI implementation notes

Add a separate `backend/app/lti.py` router/sub-app and mount it at `/lti`. Do not put LTI into the in-memory `model.py`.

Dependencies:

```text
PyJWT[crypto]
httpx
python-multipart
```

Replace the current `jwt` requirement (which is not the same package) with `PyJWT[crypto]`. FastAPI `Form(...)` requires `python-multipart`.

Validation sketch:

```python
import jwt

jwks = jwt.PyJWKClient(platform.jwks_url, cache_keys=True)
key = jwks.get_signing_key_from_jwt(id_token)
claims = jwt.decode(
    id_token,
    key.key,
    algorithms=["RS256"],
    audience=platform.client_id,
    issuer=platform.issuer,
    options={"require": ["exp", "iat", "aud", "iss", "sub"]},
)
# Then manually check nonce, deployment_id, message_type, version, target_link_uri.
```

Key/JWKS:

- Generate an RSA keypair (2048+ bits) once per environment. Store the private key outside the repo (secret mount/env/file).
- Serve `/lti/jwks` with the public key as a JWK including `kty`, `n`, `e`, `alg=RS256`, `use=sig`, and `kid`.
- Support at least two keys for rotation; publish both JWKS entries, switch signing, then retire.
- Canvas must be able to fetch the JWKS over HTTPS.

Libraries:

- **PyLTI1p3** (`mitodl/pylti1p3`) is the mature Python option, but its request/response adapters are Django/Flask-oriented. It has no native FastAPI adapter; either wrap its core with a custom adapter or implement the small validation/token layer directly.
- For this app’s scope, a thin layer (`PyJWT` + `httpx` + a few DB tables) is easier to audit than forcing a framework adapter.
- If using a library, still implement state/nonce replay protection and the authorization rules yourself.

Configuration (env vars, no secrets committed):

| Variable | Purpose |
| --- | --- |
| `LTI_PUBLIC_BASE_URL` | Public HTTPS origin, e.g. `https://tool.example.edu` |
| `LTI_PRIVATE_KEY_PEM` / `LTI_PRIVATE_KEY_PATH` | Tool signing key |
| `LTI_KEY_ID` | `kid` for the current key |
| `LTI_CLIENT_ID` | Canvas developer key client id (per registration) |
| `LTI_ISSUER` | Expected `iss` (per registration) |
| `LTI_DEPLOYMENT_ID` | Expected deployment id (per registration) |
| `LTI_SESSION_SECRET` / `LTI_COOKIE_DOMAIN` | Session/CSRF protection |
| `DATABASE_URL` | Postgres connection |
| `APP_BASE_URL` | SPA redirect target after launch |

Do not log `id_token`, access tokens, client assertions, or private keys. Log claim keys/IDs only when debugging, and never in production.

## 12. Frontend integration

- Remove the localStorage mock as the production auth source. After launch, call `GET /api/me` and hydrate the user/role/permissions.
- Keep `AuthProvider` for dev, but make it consume the real session in production.
- Gate authoring/roster/grade-sync UI on server-returned permissions, not on a localStorage role.
- Do not store Canvas tokens or launch JWTs in the browser.
- Use same-origin `/api` and `/lti` in production. In Vite dev, add proxy rules for `/api` and `/lti` to `http://localhost:8000` so cookies are first-party.
- If embedded in Canvas, set `Content-Security-Policy: frame-ancestors ...` to the allowed Canvas domains; do not send `X-Frame-Options: DENY`.
- Test the launch in Chrome, Firefox, and Safari. Third-party cookie policy can break the iframe session; decide whether to use partitioned cookies, Canvas platform storage, or a top-level launch.

## 13. Security checklist

- [ ] HTTPS everywhere; no launch over HTTP.
- [ ] Validate signature, `alg`, `kid`, `iss`, `aud`, `azp`, `exp`, `iat`, `nonce`, `state`, `deployment_id`, `message_type`, and `version`.
- [ ] State/nonce are random, single-use, expiring, and bound to the registration/target link.
- [ ] Reject replayed `id_token`s and unknown deployments/client ids.
- [ ] JWKS URLs come from the registration, never from token headers; cache keys but handle rotation.
- [ ] Authorize only context membership roles; ignore institution/system roles and request-body roles.
- [ ] Enforce teacher/TA/student permissions server-side on every route.
- [ ] Session cookies: `HttpOnly`, `Secure`, appropriate `SameSite`, rotation, expiry; CSRF protection.
- [ ] No tokens in URLs, localStorage, logs, or error responses.
- [ ] Validate `target_link_uri` and Deep Linking return flow against the signed claims/registration.
- [ ] Rate-limit login/launch, token requests, NRPS walks, and score posts.
- [ ] Encrypt cached access tokens if stored; delete them on expiry.
- [ ] Collect minimum PII; document retention/FERPA obligations; support deletion.
- [ ] Include security headers (HSTS, CSP, Referrer-Policy) and a Canvas-compatible frame policy.

## 14. Testing plan

Canvas cannot reach `localhost`. Use a staging HTTPS host or a tunnel (Cloudflare Tunnel, ngrok, etc.) and register that exact URL.

Minimum test course:

- 1 Teacher, 1 TA, 2 Students (TA enrollment may require an institution/test instance; Free-for-Teacher limitations vary).
- One `course_navigation` launch and one assignment created via Deep Linking.
- NRPS and AGS enabled on the developer key.

Cases:

1. Teacher launches: role = Teacher, context present, AGS line item claim available.
2. TA launches: role = TA; confirm the `TeachingAssistant` sub-role arrives; verify permission matrix.
3. Student launches: role = Student; cannot see roster/other progress.
4. Student in course A launches course B: role/context do not leak across courses.
5. NRPS: roster matches Canvas enrollments; TA appears correctly; paginated roster completes; privacy level hides name/email when expected.
6. AGS: create/find line item; post a score; student sees it; teacher sees it; only `FullyGraded` displays.
7. Deep Linking: create an assignment; launch it; score posts to the matching line item.
8. Concluded course: launches/grades fail gracefully.
9. Invalid state/nonce/deployment/signature: rejected, no session.
10. Session expiry/logout: no stale access.
11. Iframe: cookie/session works in each browser, or the fallback flow is documented.
12. Key rotation: new `kid` published; launches verify during overlap.

Add unit tests with synthetic JWTs for the validation matrix. Do not use production student data in development.

## 15. Phased implementation

| Phase | Scope | Acceptance |
| --- | --- | --- |
| 0 | Developer key, keypair, JWKS, `/lti/login`, `/lti/launch`, state/nonce | A launch reaches the SPA and `GET /api/me` returns the right `sub`, context, role |
| 1 | Postgres LTI tables, session cookie, CSRF, launch audit | Teacher/TA/Student launches are distinguishable and survive reload |
| 2 | Progress persistence keyed by `(platform, sub, card)`; role-based API | Study progress survives restart and is isolated per user |
| 3 | NRPS roster + role reconciliation | Teacher sees class roster; TA detection verified |
| 4 | AGS line items/scores | One summary score appears correctly in Canvas |
| 5 | Deep Linking assignment creation | Assignment + gradebook column created from Canvas |
| 6 | Hardening, key rotation, browser/iframe tests, retention | Security checklist passes; test matrix green |

Phases 0–2 deliver the user’s core request (“know who is who, save progress”). NRPS/AGS/Deep Linking can follow.

## 16. Sources

Checked 2026-11-19:

- LTI 1.3 Core (1EdTech): https://www.imsglobal.org/spec/lti/v1p3/
- LTI Advantage overview: https://www.imsglobal.org/spec/lti-ags/v2p0 and https://www.imsglobal.org/spec/lti-nrps/v2p0
- NRPS 2.0: https://www.imsglobal.org/spec/lti-nrps/v2p0
- AGS 2.0: https://www.imsglobal.org/spec/lti-ags/v2p0
- Deep Linking 2.0: https://www.imsglobal.org/spec/lti-dl/v2p0
- LTI security framework (OAuth2 client assertion): https://www.imsglobal.org/spec/security/v1p0/
- JWT client authentication (RFC 7523): https://datatracker.ietf.org/doc/html/rfc7523
- Canvas LTI developer key configuration: https://canvas.instructure.com/doc/api/file.lti_dev_key_config.html
- Canvas roles (including TA sub-role): https://developer.instructure.com/doc/api/file.canvas_roles.html
- Canvas user provisioning / NRPS notes: https://developer.instructure.com/doc/api/file.provisioning.html
- Canvas OIDC/JWKS/token host migration to `sso.canvaslms.com`: https://community.instructure.com/en/discussion/551677/minor-lti-1-3-changes-new-oidc-auth-endpoint-support-for-platform-storage
- PyLTI1p3: https://github.com/mitodl/pylti1p3
- MDN cookies (`SameSite`, `Partitioned`): https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
