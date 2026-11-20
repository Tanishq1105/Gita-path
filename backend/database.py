"""One small database interface over SQLite (default, a single file) and PostgreSQL (DATABASE_URL).

SQLite is perfect on your own computer or a server with a disk. PostgreSQL is for hosts whose disk is erased on
every deploy (free plans): the data then lives in a separate hosted database. Queries are written once with
``?`` placeholders; this module adapts them.
"""
import os
import sqlite3


class Record(dict):
    """A row readable by column name (row["id"]) or position (row[0]), like sqlite3.Row."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def url(app):
    value = app.config.get("DATABASE_URL") or os.environ.get("GITA_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    value = value.strip().strip("'\"")
    return value if value.startswith(("postgres://", "postgresql://")) else ""


class Database:
    def __init__(self, conn, dialect):
        self.conn, self.dialect = conn, dialect

    def execute(self, sql, params=()):
        if self.dialect == "postgres":
            sql = sql.replace("?", "%s")
        return self.conn.execute(sql, params)

    def insert(self, sql, params=()):
        """Run an INSERT into a table with an `id` column and return the new id."""
        if self.dialect == "postgres":
            return self.execute(sql + " RETURNING id", params).fetchone()["id"]
        return self.execute(sql, params).lastrowid

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


def connect(app, sqlite_path):
    address = url(app)
    if address:
        try:
            import psycopg
        except ImportError as error:
            raise SystemExit("DATABASE_URL is set but the PostgreSQL driver is missing. Run: pip install -r backend/requirements.txt") from error

        def factory(cursor):
            names = [column.name for column in cursor.description or []]
            return lambda values: Record(zip(names, values))

        return Database(psycopg.connect(address, row_factory=factory, connect_timeout=20, prepare_threshold=None), "postgres")
    conn = sqlite3.connect(sqlite_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return Database(conn, "sqlite")


SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  daily_email INTEGER NOT NULL DEFAULT 1,
  last_sent TEXT
);
CREATE TABLE IF NOT EXISTS email_codes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS thoughts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  author_id INTEGER REFERENCES users(id)
);
"""

POSTGRES_SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      daily_email INTEGER NOT NULL DEFAULT 1,
      last_sent TEXT)""",
    """CREATE TABLE IF NOT EXISTS email_codes (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at BIGINT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS thoughts (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      author_id BIGINT REFERENCES users(id))""",
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
]


def create_schema(db):
    """Create tables (and, for old SQLite files, add columns that newer versions need)."""
    if db.dialect == "postgres":
        for statement in POSTGRES_SCHEMA:
            db.execute(statement)
        db.commit()
        return
    db.execute("PRAGMA journal_mode = WAL")
    db.conn.executescript(SQLITE_SCHEMA)
    columns = {row[1] for row in db.execute("PRAGMA table_info(users)")}
    if "email_verified" not in columns:  # file made before e-mail verification existed
        db.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
        db.execute("UPDATE users SET email_verified = 1")
    if "daily_email" not in columns:
        db.execute("ALTER TABLE users ADD COLUMN daily_email INTEGER NOT NULL DEFAULT 1")
    if "last_sent" not in columns:
        db.execute("ALTER TABLE users ADD COLUMN last_sent TEXT")
    db.commit()
