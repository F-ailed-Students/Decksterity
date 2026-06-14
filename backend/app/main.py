import uvicorn
from model import app

if __name__ == '__main__':
    uvicorn.run("model:app", host="0.0.0.0", port=8000)
