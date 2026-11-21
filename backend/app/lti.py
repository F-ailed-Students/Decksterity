import base64
import hashlib
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import jwt
import psycopg2
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import APIRouter, Form, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from jwt import PyJWKClient
from psycopg2.extras import RealDictCursor

PUBLIC_BASE_URL = os.getenv("LTI_PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
APP_BASE_URL = os.getenv("LTI_APP_BASE_URL", os.getenv("APP_BASE_URL", "http://localhost:3000")).rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL")
KEY_ID = os.getenv("LTI_KEY_ID", "decksterity-key-1")
SESSION_COOKIE = "decksterity_session"
SESSION_TTL_MINUTES = int(os.getenv("LTI_SESSION_TTL_MINUTES", "60"))
STATE_TTL_MINUTES = int(os.getenv("LTI_STATE_TTL_MINUTES", "10"))
COOKIE_SECURE = os.getenv("LTI_COOKIE_SECURE", "false").lower() == "true" or PUBLIC_BASE_URL.startswith("https")
COOKIE_SAMESITE = "none" if COOKIE_SECURE else "lax"

REGISTRATION = {
    "issuer": os.getenv("LTI_ISSUER", "https://canvas.instructure.com"),
    "client_id": os.getenv("LTI_CLIENT_ID", ""),
    "deployment_id": os.getenv("LTI_DEPLOYMENT_ID", ""),
    "oidc_auth_url": os.getenv("LTI_OIDC_AUTH_URL", "https://sso.canvaslms.com/api/lti/authorize_redirect"),
    "token_url": os.getenv("LTI_TOKEN_URL", "https://sso.canvaslms.com/login/oauth2/token"),
    "jwks_url": os.getenv("LTI_JWKS_URL", "https://sso.canvaslms.com/api/lti/security/jwks"),
}


def load_private_key():
    pem = os.getenv("LTI_PRIVATE_KEY_PEM")
    path = os.getenv("LTI_PRIVATE_KEY_PATH")
    if pem:
        return serialization.load_pem_private_key(pem.encode("utf-8"), password=None)
    if path and os.path.exists(path):
        with open(path, "rb") as handle:
            return serialization.load_pem_private_key(handle.read(), password=None)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    print("WARNING: LTI_PRIVATE_KEY_PEM/PATH is unset; using an ephemeral RSA key. Set a stable key for Canvas.")
    return key


_PRIVATE_KEY = load_private_key()


def _b64url_int(value):
    length = (value.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(value.to_bytes(length, "big")).rstrip(b"=").decode("ascii")


def public_jwk():
    numbers = _PRIVATE_KEY.public_key().public_numbers()
    return {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": KEY_ID,
        "n": _b64url_int(numbers.n),
        "e": _b64url_int(numbers.e),
    }


def get_conn():
    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL)
    return psycopg2.connect(
        user="user",
        password="password",
        host="localhost",
        port=5432,
        dbname="mydb",
    )


def init_schema():
    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS lti_platforms (
                    id BIGSERIAL PRIMARY KEY,
                    issuer TEXT NOT NULL,
                    client_id TEXT NOT NULL,
                    deployment_id TEXT NOT NULL DEFAULT '',
                    oidc_auth_url TEXT NOT NULL,
                    token_url TEXT NOT NULL,
                    jwks_url TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE (issuer, client_id, deployment_id)
                );
                CREATE TABLE IF NOT EXISTS lti_contexts (
                    id BIGSERIAL PRIMARY KEY,
                    platform_id BIGINT NOT NULL REFERENCES lti_platforms(id),
                    context_id TEXT NOT NULL,
                    label TEXT,
                    title TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE (platform_id, context_id)
                );
                CREATE TABLE IF NOT EXISTS lti_users (
                    id BIGSERIAL PRIMARY KEY,
                    platform_id BIGINT NOT NULL REFERENCES lti_platforms(id),
                    sub TEXT NOT NULL,
                    email TEXT,
                    display_name TEXT,
                    sis_id TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE (platform_id, sub)
                );
                CREATE TABLE IF NOT EXISTS lti_memberships (
                    context_id BIGINT NOT NULL REFERENCES lti_contexts(id),
                    user_id BIGINT NOT NULL REFERENCES lti_users(id),
                    role TEXT NOT NULL CHECK (role IN ('Student', 'TA', 'Teacher', 'Admin')),
                    raw_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
                    status TEXT NOT NULL DEFAULT 'Active',
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (context_id, user_id)
                );
                CREATE TABLE IF NOT EXISTS lti_auth_states (
                    state TEXT PRIMARY KEY,
                    nonce TEXT NOT NULL,
                    platform_id BIGINT NOT NULL REFERENCES lti_platforms(id),
                    target_link_uri TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    consumed_at TIMESTAMPTZ
                );
                CREATE TABLE IF NOT EXISTS lti_sessions (
                    id TEXT PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES lti_users(id),
                    context_id BIGINT REFERENCES lti_contexts(id),
                    csrf_token TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                """
            )
        conn.commit()
    finally:
        conn.close()


def find_registration(issuer, client_id):
    if issuer == REGISTRATION["issuer"] and client_id == REGISTRATION["client_id"]:
        return REGISTRATION
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT issuer, client_id, deployment_id, oidc_auth_url, token_url, jwks_url FROM lti_platforms WHERE issuer=%s AND client_id=%s LIMIT 1",
                (issuer, client_id),
            )
            row = cursor.fetchone()
            if row:
                return {
                    "issuer": row["issuer"],
                    "client_id": row["client_id"],
                    "deployment_id": row["deployment_id"],
                    "oidc_auth_url": row["oidc_auth_url"],
                    "token_url": row["token_url"],
                    "jwks_url": row["jwks_url"],
                }
    finally:
        conn.close()
    return None


def ensure_platform(registration):
    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO lti_platforms (issuer, client_id, deployment_id, oidc_auth_url, token_url, jwks_url)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (issuer, client_id, deployment_id) DO NOTHING
                """,
                (
                    registration["issuer"],
                    registration["client_id"],
                    registration["deployment_id"],
                    registration["oidc_auth_url"],
                    registration["token_url"],
                    registration["jwks_url"],
                ),
            )
            cursor.execute(
                "SELECT id FROM lti_platforms WHERE issuer=%s AND client_id=%s AND deployment_id=%s",
                (registration["issuer"], registration["client_id"], registration["deployment_id"]),
            )
            platform_id = cursor.fetchone()[0]
        conn.commit()
        return platform_id
    finally:
        conn.close()


def create_auth_state(registration, target_link_uri):
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=STATE_TTL_MINUTES)
    platform_id = ensure_platform(registration)
    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO lti_auth_states (state, nonce, platform_id, target_link_uri, expires_at) VALUES (%s, %s, %s, %s, %s)",
                (state, nonce, platform_id, target_link_uri, expires_at),
            )
        conn.commit()
    finally:
        conn.close()
    return state, nonce


def consume_auth_state(state):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM lti_auth_states WHERE state=%s", (state,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=400, detail="Invalid state")
            if row["consumed_at"] is not None:
                raise HTTPException(status_code=400, detail="State already used")
            if row["expires_at"] < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="State expired")
            cursor.execute(
                "UPDATE lti_auth_states SET consumed_at=now() WHERE state=%s AND consumed_at IS NULL",
                (state,),
            )
            if cursor.rowcount != 1:
                raise HTTPException(status_code=400, detail="State already used")
        conn.commit()
        return row
    finally:
        conn.close()


def normalize_role(roles):
    normalized = [str(role).lower().replace("https://", "").replace("http://", "").rstrip("/") for role in roles]
    if any(item.endswith("membership/instructor#teachingassistant") for item in normalized):
        return "TA"
    if any(item.endswith("membership#teachingassistant") for item in normalized):
        return "TA"
    if any(item.endswith("membership#instructor") for item in normalized):
        return "Teacher"
    if any(item.endswith("membership#learner") for item in normalized):
        return "Student"
    return None


def upsert_launch(registration, claims):
    platform_id = ensure_platform(registration)
    context_claim = claims.get("https://purl.imsglobal.org/spec/lti/claim/context") or {}
    context_id = context_claim.get("id")
    if not context_id:
        raise HTTPException(status_code=400, detail="Missing context")
    roles = claims.get("https://purl.imsglobal.org/spec/lti/claim/roles") or []
    role = normalize_role(roles) or "Student"
    custom = claims.get("https://purl.imsglobal.org/spec/lti/claim/custom") or {}
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO lti_users (platform_id, sub, email, display_name, sis_id)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (platform_id, sub) DO UPDATE SET
                    email = COALESCE(EXCLUDED.email, lti_users.email),
                    display_name = COALESCE(EXCLUDED.display_name, lti_users.display_name),
                    sis_id = COALESCE(EXCLUDED.sis_id, lti_users.sis_id)
                RETURNING id
                """,
                (
                    platform_id,
                    claims["sub"],
                    claims.get("email"),
                    claims.get("name") or claims.get("https://purl.imsglobal.org/spec/lti/claim/custom", {}).get("canvas_user_id"),
                    custom.get("canvas_user_id") or claims.get("https://purl.imsglobal.org/spec/lti/claim/lis", {}).get("person_sourcedid"),
                ),
            )
            user_id = cursor.fetchone()["id"]

            cursor.execute(
                """
                INSERT INTO lti_contexts (platform_id, context_id, label, title)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (platform_id, context_id) DO UPDATE SET
                    label = COALESCE(EXCLUDED.label, lti_contexts.label),
                    title = COALESCE(EXCLUDED.title, lti_contexts.title)
                RETURNING id
                """,
                (platform_id, context_id, context_claim.get("label"), context_claim.get("title")),
            )
            context_row_id = cursor.fetchone()["id"]

            cursor.execute(
                """
                INSERT INTO lti_memberships (context_id, user_id, role, raw_roles, status, updated_at)
                VALUES (%s, %s, %s, %s, 'Active', now())
                ON CONFLICT (context_id, user_id) DO UPDATE SET
                    role = EXCLUDED.role,
                    raw_roles = EXCLUDED.raw_roles,
                    status = 'Active',
                    updated_at = now()
                """,
                (context_row_id, user_id, role, json.dumps(roles)),
            )
        conn.commit()
        return user_id, context_row_id, role
    finally:
        conn.close()


def create_session(user_id, context_id):
    session_id = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    session_hash = hashlib.sha256(session_id.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)
    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO lti_sessions (id, user_id, context_id, csrf_token, expires_at) VALUES (%s, %s, %s, %s, %s)",
                (session_hash, user_id, context_id, csrf_token, expires_at),
            )
        conn.commit()
    finally:
        conn.close()
    return session_id, csrf_token, expires_at


def get_session(request):
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id:
        return None
    session_hash = hashlib.sha256(session_id.encode("utf-8")).hexdigest()
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT s.id, s.user_id, s.context_id, s.csrf_token, s.expires_at,
                       u.sub, u.email, u.display_name, u.platform_id,
                       c.context_id AS canvas_context_id, c.label, c.title,
                       m.role
                FROM lti_sessions s
                JOIN lti_users u ON u.id = s.user_id
                LEFT JOIN lti_contexts c ON c.id = s.context_id
                LEFT JOIN lti_memberships m ON m.context_id = s.context_id AND m.user_id = s.user_id
                WHERE s.id=%s AND s.expires_at > now()
                """,
                (session_hash,),
            )
            return cursor.fetchone()
    finally:
        conn.close()


def permissions_for(role):
    author = role in {"TA", "Teacher"}
    return {
        "canStudy": True,
        "canAuthor": author,
        "canViewRoster": author,
        "canSyncGrades": author,
    }


lti_router = APIRouter()
api_router = APIRouter()


@lti_router.get("/jwks")
def jwks():
    return {"keys": [public_jwk()]}


@lti_router.get("/login")
@lti_router.post("/login")
def login(
    request: Request,
    iss: str = None,
    login_hint: str = None,
    target_link_uri: str = None,
    client_id: str = None,
    lti_deployment_id: str = None,
    deployment_id: str = None,
    lti_message_hint: str = None,
):
    supplied_client_id = client_id or REGISTRATION["client_id"]
    registration = find_registration(iss, supplied_client_id)
    if registration is None:
        raise HTTPException(status_code=400, detail="Unknown platform registration")
    if not target_link_uri:
        target_link_uri = f"{PUBLIC_BASE_URL}/lti/launch"
    if not target_link_uri.startswith(PUBLIC_BASE_URL):
        raise HTTPException(status_code=400, detail="Invalid target_link_uri")

    state, nonce = create_auth_state(registration, target_link_uri)
    params = {
        "scope": "openid",
        "response_type": "id_token",
        "response_mode": "form_post",
        "prompt": "none",
        "client_id": registration["client_id"],
        "redirect_uri": target_link_uri,
        "state": state,
        "nonce": nonce,
    }
    if login_hint:
        params["login_hint"] = login_hint
    if lti_message_hint:
        params["lti_message_hint"] = lti_message_hint
    supplied_deployment = lti_deployment_id or deployment_id or registration["deployment_id"]
    if supplied_deployment:
        params["lti_deployment_id"] = supplied_deployment
    redirect_url = f"{registration['oidc_auth_url']}?{urlencode(params)}"
    return RedirectResponse(redirect_url, status_code=302)


@lti_router.post("/launch")
def launch(request: Request, id_token: str = Form(...), state: str = Form(...)):
    state_row = consume_auth_state(state)
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT issuer, client_id, deployment_id, jwks_url FROM lti_platforms WHERE id=%s", (state_row["platform_id"],))
            platform_row = cursor.fetchone()
    finally:
        conn.close()
    if not platform_row:
        raise HTTPException(status_code=400, detail="Unknown platform")
    registration = {
        "issuer": platform_row["issuer"],
        "client_id": platform_row["client_id"],
        "deployment_id": platform_row["deployment_id"],
        "jwks_url": platform_row["jwks_url"],
    }

    try:
        jwks_client = PyJWKClient(registration["jwks_url"], cache_keys=True)
        signing_key = jwks_client.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=registration["client_id"],
            issuer=registration["issuer"],
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
            leeway=60,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid launch token")

    if claims.get("nonce") != state_row["nonce"]:
        raise HTTPException(status_code=401, detail="Invalid nonce")
    if state_row["target_link_uri"] and claims.get("https://purl.imsglobal.org/spec/lti/claim/target_link_uri"):
        if claims["https://purl.imsglobal.org/spec/lti/claim/target_link_uri"] != state_row["target_link_uri"]:
            raise HTTPException(status_code=401, detail="Invalid target link")
    deployment_id = claims.get("https://purl.imsglobal.org/spec/lti/claim/deployment_id")
    if registration["deployment_id"] and deployment_id != registration["deployment_id"]:
        raise HTTPException(status_code=401, detail="Invalid deployment")
    message_type = claims.get("https://purl.imsglobal.org/spec/lti/claim/message_type")
    if message_type not in {"LtiResourceLinkRequest", "LtiDeepLinkingRequest"}:
        raise HTTPException(status_code=401, detail="Unsupported message type")
    version = claims.get("https://purl.imsglobal.org/spec/lti/claim/version")
    if version not in {None, "1.3.0"}:
        raise HTTPException(status_code=401, detail="Unsupported LTI version")
    if not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Missing subject")
    context_claim = claims.get("https://purl.imsglobal.org/spec/lti/claim/context")
    if not isinstance(context_claim, dict) or not context_claim.get("id"):
        raise HTTPException(status_code=401, detail="Missing context")

    registration_full = {
        **registration,
        "oidc_auth_url": REGISTRATION["oidc_auth_url"],
        "token_url": REGISTRATION["token_url"],
    }
    user_id, context_row_id, role = upsert_launch(registration_full, claims)

    session_id, csrf_token, expires_at = create_session(user_id, context_row_id)
    response = RedirectResponse(APP_BASE_URL, status_code=303)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_id,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=SESSION_TTL_MINUTES * 60,
        path="/",
    )
    return response


@lti_router.get("/logout")
def logout(request: Request, response: Response):
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        session_hash = hashlib.sha256(session_id.encode("utf-8")).hexdigest()
        conn = get_conn()
        try:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM lti_sessions WHERE id=%s", (session_hash,))
            conn.commit()
        finally:
            conn.close()
    response = RedirectResponse(APP_BASE_URL, status_code=303)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@api_router.get("/me")
def me(request: Request):
    session = get_session(request)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    role = session.get("role") or "Student"
    name = session.get("display_name") or session.get("sub")
    return {
        "authenticated": True,
        "user": {
            "id": session["sub"],
            "name": name,
            "email": session.get("email"),
            "role": role,
        },
        "context": {
            "id": session.get("canvas_context_id"),
            "label": session.get("label"),
            "title": session.get("title"),
        },
        "permissions": permissions_for(role),
    }