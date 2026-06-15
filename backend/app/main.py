import uvicorn
from fastapi import FastAPI
from model import app as model_app
from db import app as db_app

# 2. Create the Master Application
master_app = FastAPI(title="Master Server")

# 3. Mount the sub-applications to specific URL paths
master_app.mount("/db", db_app)
master_app.mount("/model", model_app)

<<<<<<< HEAD
if __name__ == "__main__":
    # 4. Tell Uvicorn to run the 'master_app'
    uvicorn.run("main:master_app", host="0.0.0.0", port=8000, reload=True)
=======
if __name__ == '__main__':
    uvicorn.run("model:app", host="0.0.0.0", port=8000)
>>>>>>> 861d235cf80e62d80c070454d2c6e31048a9033b
