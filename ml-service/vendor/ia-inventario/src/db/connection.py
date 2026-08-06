import os
from contextlib import contextmanager

import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv

load_dotenv()

_pool = pooling.MySQLConnectionPool(
    pool_name="ai_inventory_pool",
    pool_size=5,
    host=os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("DB_PORT", "3306")),
    user=os.getenv("DB_USER", "root"),
    password=os.getenv("DB_PASSWORD", ""),
    database=os.getenv("DB_NAME", "ai_inventory"),
    autocommit=True,
)


@contextmanager
def get_connection():
    conn = _pool.get_connection()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def get_cursor(dictionary: bool = True):
    with get_connection() as conn:
        cursor = conn.cursor(dictionary=dictionary)
        try:
            yield cursor
        finally:
            cursor.close()
