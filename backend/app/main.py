import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import app as db_app
from lti import api_router as lti_api_router
from lti import init_schema as init_lti_schema
from lti import lti_router
from model import app as model_app

# 2. Create the Master Application
master_app = FastAPI(title="Master Server")

# Add CORS for local dev. Production uses same-origin /api and /lti.
master_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Register LTI API routes before mounting the prototype app so /api/me is reachable.
master_app.include_router(lti_router, prefix="/lti")
master_app.include_router(lti_api_router, prefix="/api")
master_app.mount("/db", db_app)
master_app.mount("/api", model_app)


@master_app.on_event("startup")
def startup():
    try:
        init_lti_schema()
    except Exception as exc:
        print(f"LTI schema initialization skipped: {exc}")


if __name__ == "__main__":
    # 4. Tell Uvicorn to run the 'master_app'
    uvicorn.run("main:master_app", host="0.0.0.0", port=8000, reload=True)
