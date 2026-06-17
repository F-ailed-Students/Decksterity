import uvicorn
from fastapi import FastAPI
from model import app as model_app
from db import app as db_app
from fastapi.middleware.cors import CORSMiddleware

# 2. Create the Master Application
master_app = FastAPI(title="Master Server")

# Add CORS such that frontend can communicate with backend
master_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Mount the sub-applications to specific URL paths
master_app.mount("/db", db_app)
master_app.mount("/api", model_app)

if __name__ == "__main__":
    # 4. Tell Uvicorn to run the 'master_app'
    uvicorn.run("main:master_app", host="0.0.0.0", port=8000, reload=True)
