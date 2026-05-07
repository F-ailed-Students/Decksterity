import os
import time
from sqlalchemy import create_engine

def try_connect():
    for i in range(10):
        try:
            engine = create_engine(os.env("DATABASE_URL"))
            conn = engine.connect()
            conn.close()
            print("DB connected!")
            break
        except Exception:
            print("DB not ready, retrying...")
            time.sleep(2)
    else:
        raise Exception("DB connection failed")

def db_add_card():
    pass


