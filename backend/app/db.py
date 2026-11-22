import os
import jwt
from fastapi import FastAPI, HTTPException, Header, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# --- 1. CONFIGURATION & SECURITY ---
SECRET_KEY = os.getenv("DECKSTERITY_SECRET_KEY") 
if not SECRET_KEY:
    raise ValueError("FATAL: No DECKSTERITY_SECRET_KEY set in the environment!")
ALGORITHM = "HS256"
security = HTTPBearer()

# PH(password hasher)
ph = PasswordHasher()

# --- 2. DYNAMIC DATABASE POOL SETUP ---
connection_pools = {}
ALLOWED_DATABASES = ["mydb"]
DATABASE_URL = os.getenv("DATABASE_URL")

def get_pool_for_db(db_name: str):
    """Retrieves an existing pool for a database, or creates one if it doesn't exist."""
    if db_name not in ALLOWED_DATABASES:
        raise HTTPException(status_code=403, detail="Database access not allowed")

    if db_name not in connection_pools:
        try:
            if DATABASE_URL:
                connection_pools[db_name] = psycopg2.pool.SimpleConnectionPool(
                    1, 20, dsn=DATABASE_URL
                )
            else:
                connection_pools[db_name] = psycopg2.pool.SimpleConnectionPool(
                    1, 20,
                    user="user",
                    password="password",
                    host="localhost",
                    port="5432",
                    database=db_name
                )
            print(f"Created new connection pool for: {db_name}")
        except Exception as e:
            print(f"Failed to connect to {db_name}: {e}")
            raise HTTPException(status_code=500, detail="Database connection failed")
            
    return connection_pools[db_name]

app = FastAPI(title="Flashcard API")

# --- 3. DEPENDENCIES & HELPERS ---

def get_db(x_database_name: str = Header("mydb", description="The target database")):
    """Dependency to get a DB connection from the dynamically requested pool."""
    target_pool = get_pool_for_db(x_database_name)
    conn = target_pool.getconn()
    try:
        yield conn
    finally:
        target_pool.putconn(conn)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency to decode the JWT and return the real user's ID and Role."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        actual_account_id = payload.get("sub")
        role = payload.get("role")
        
        if actual_account_id is None or role is None:
            raise HTTPException(status_code=401, detail="Invalid token structure")
            
        return {"id": actual_account_id, "role": role}
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def hash_password(password: str) -> str:
    """Hashes a password using Argon2 (includes automatic salting)"""
    return ph.hash(password)

def create_new_user(db_conn, email, plain_password, display_name, role):
    """Creates a new user with a specific role."""
    # Ensure the role is valid
    if role not in ROLE_HIERARCHY:
        raise ValueError("Invalid role provided.")
        
    hashed_pwd = hash_password(plain_password) 
    
    with db_conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            INSERT INTO accounts (email_address, password, display_name, type)
            VALUES (%s, %s, %s, %s)
            RETURNING id, email_address, display_name, type;
            """,
            (email, hashed_pwd, display_name, role)
        )
        new_user = cursor.fetchone()
        db_conn.commit()
        return new_user

def enforce_deletion_hierarchy(db_conn, target_user_id, requester_role):
    """
    Deletes a user only if the requester has a strictly higher role level 
    than the target user.
    """
    with db_conn.cursor(cursor_factory=RealDictCursor) as cursor:
        # 1. Find out the role of the person we are trying to delete
        cursor.execute("SELECT type FROM accounts WHERE id = %s;", (target_user_id,))
        target_user = cursor.fetchone()
        
        if not target_user:
            raise ValueError("Target user does not exist.")
            
        target_role = target_user["type"]
        
        # 2. Compare the hierarchy levels
        requester_level = ROLE_HIERARCHY.get(requester_role, 0)
        target_level = ROLE_HIERARCHY.get(target_role, 0)
        
        # A requester must be strictly greater (>) to delete.
        if requester_level <= target_level:
            raise PermissionError(f"A {requester_role} cannot delete a {target_role}.")
            
        # 3. If authorized, perform the deletion
        cursor.execute("DELETE FROM accounts WHERE id = %s RETURNING id;", (target_user_id,))
        db_conn.commit()
        return True
    
# --- 4. PYDANTIC MODELS ---

class LoginRequest(BaseModel):
    email_address: str
    password: str

class CardCreate(BaseModel):
    course_id: int
    tag: str
    is_public: bool
    front_text: str  
    back_text: str   

ROLE_HIERARCHY = {
    "Student": 1,
    "Teacher": 2,
    "GlobalAdmin": 3
}

class UserCreateRequest(BaseModel):
    email: str
    password: str
    display_name: str
    role: str

# --- 5. REST API ENDPOINTS ---

@app.post("/login", summary="Authenticate a user")
def login(req: LoginRequest, db = Depends(get_db)):
    with db.cursor(cursor_factory=RealDictCursor) as cursor:
        # Fetch the user by EMAIL ONLY, pulling the stored password hash
        cursor.execute(
            """
            SELECT id, email_address, display_name, type, password 
            FROM accounts 
            WHERE email_address = %s;
            """,
            (req.email_address,)
        )
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        # Verify the password using Argon2
        try:
            ph.verify(user["password"], req.password)
        except VerifyMismatchError:
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        # Optional: Rehash password if Argon2 parameters have changed
        if ph.check_needs_rehash(user["password"]):
            new_hash = ph.hash(req.password)
            cursor.execute("UPDATE accounts SET password = %s WHERE id = %s", (new_hash, user["id"]))
            db.commit()

        # Delete the password from the dictionary so it doesn't leak into the JWT or response
        del user["password"]

        # Generate the real JWT with their actual ID and Role
        token_payload = {
            "sub": user["id"],
            "role": user["type"]
        }
        real_token = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)
        
        return {"message": "Login successful", "access_token": real_token, "token_type": "bearer"}

@app.post("/cards", summary="Create a new local card")
def create_card(
    card: CardCreate, 
    current_user: dict = Depends(get_current_user), 
    db = Depends(get_db)
):
    with db.cursor(cursor_factory=RealDictCursor) as cursor:
        try:
            cursor.execute(
                """
                INSERT INTO cards (created_by, course_id, tag, is_public, front_text, back_text, date_created)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                RETURNING id, created_by, course_id, tag, is_public, front_text, back_text, date_created;
                """,
                (current_user["id"], card.course_id, card.tag, card.is_public, card.front_text, card.back_text)
            )
            new_card = cursor.fetchone()
            db.commit()
            return new_card
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/cards/{card_id}", summary="Get a specific card")
def get_card(card_id: int, db = Depends(get_db)):
    with db.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT id, date_created, created_by, course_id, tag, is_public, front_text, back_text 
            FROM cards 
            WHERE id = %s;
            """,
            (card_id,)
        )
        card = cursor.fetchone()
        
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
            
        return card

@app.delete("/cards/{card_id}", summary="Delete a local card")
def delete_card(
    card_id: int, 
    current_user: dict = Depends(get_current_user), 
    db = Depends(get_db)
):
    with db.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            DELETE FROM cards 
            WHERE id = %s AND created_by = %s
            RETURNING id;
            """,
            (card_id, current_user["id"])
        )
        deleted_card = cursor.fetchone()
        
        if not deleted_card:
            db.rollback()
            raise HTTPException(status_code=403, detail="Card not found or you do not have permission to delete it")
            
        db.commit()
        return {"message": f"Card {card_id} successfully deleted"}
    
@app.patch("/cards/{card_id}/promote", summary="Promote to public card (Educators Only)")
def promote_card(
    card_id: int, 
    current_user: dict = Depends(get_current_user), 
    db = Depends(get_db)
):
    if current_user["role"] != "Teacher":
        raise HTTPException(
            status_code=403, 
            detail="Permission denied. Only Educators can promote cards."
        )
        
    with db.cursor() as cursor:
        cursor.execute(
            """
            UPDATE cards 
            SET is_public = TRUE 
            WHERE id = %s
            RETURNING id;
            """,
            (card_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Card not found")
            
        db.commit()
        return {"message": f"Card {card_id} is now public."}
    
@app.post("/users/admin/setup", summary="Create the initial Global Admin")
def setup_global_admin(req: UserCreateRequest, db = Depends(get_db)):
    """
    WARNING: In a real app, this endpoint should be heavily protected.
    """
    try:
        admin_user = create_new_user(db, req.email, req.password, req.display_name, "GlobalAdmin")
        return {"message": "Global Admin created", "user": admin_user}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/users", summary="Create standard users")
def create_standard_user(
    req: UserCreateRequest, 
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    requester_role = current_user["role"]
    
    if req.role == "Teacher" and requester_role != "GlobalAdmin":
        raise HTTPException(status_code=403, detail="Only Global Admins can create Teachers.")
    
    if req.role == "GlobalAdmin":
        raise HTTPException(status_code=403, detail="Cannot create Global Admins via this endpoint.")
        
    try:
        new_user = create_new_user(db, req.email, req.password, req.display_name, req.role)
        return {"message": "User created", "user": new_user}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/users/{target_user_id}", summary="Delete a user based on hierarchy")
def delete_user_endpoint(
    target_user_id: int, 
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    requester_role = current_user["role"]
    
    try:
        enforce_deletion_hierarchy(db, target_user_id, requester_role)
        return {"message": f"User {target_user_id} successfully deleted."}
        
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred during deletion.")
import os
import psycopg2

def init_schema():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        conn = psycopg2.connect(database_url)
    else:
        conn = psycopg2.connect(
            user="user",
            password="password",
            host="localhost",
            port=5432,
            dbname="mydb",
        )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS accounts (
                    id SERIAL PRIMARY KEY,
                    email_address TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL,
                    display_name TEXT,
                    type TEXT NOT NULL DEFAULT 'Student'
                );
                CREATE TABLE IF NOT EXISTS courses (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_by INTEGER REFERENCES accounts(id),
                    date_created TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS cards (
                    id SERIAL PRIMARY KEY,
                    created_by INTEGER REFERENCES accounts(id),
                    course_id INTEGER,
                    tag TEXT,
                    is_public BOOLEAN NOT NULL DEFAULT FALSE,
                    front_text TEXT NOT NULL,
                    back_text TEXT NOT NULL,
                    date_created TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                """
            )
        conn.commit()
    finally:
        conn.close()
