from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

# SQLite needs check_same_thread=False for FastAPI's async workers
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {
        "check_same_thread": False,
        "timeout": 30.0,
    }

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,
)

if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.execute("PRAGMA synchronous=NORMAL")
        finally:
            cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def ensure_sqlite_schema(db_engine=None):
    """Ensure backward-compatible columns exist in SQLite database without data loss."""
    target_engine = db_engine or engine
    try:
        from sqlalchemy import text
        with target_engine.connect() as conn:
            # 1. users table
            user_cols_res = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            user_cols = [r[1] for r in user_cols_res]
            if user_cols:
                if "preferred_currency" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN preferred_currency VARCHAR(3) DEFAULT 'INR'"))
                if "show_converted_prices" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN show_converted_prices BOOLEAN DEFAULT 1"))
                conn.execute(text("UPDATE users SET preferred_currency = 'INR' WHERE preferred_currency IS NULL"))
                conn.execute(text("UPDATE users SET show_converted_prices = 1 WHERE show_converted_prices IS NULL"))

            # 2. group_members table
            gm_res = conn.execute(text("PRAGMA table_info(group_members)")).fetchall()
            gm_cols = [r[1] for r in gm_res]
            if gm_cols and "is_active" not in gm_cols:
                conn.execute(text("ALTER TABLE group_members ADD COLUMN is_active BOOLEAN DEFAULT 1"))

            conn.commit()
    except Exception:
        pass


if settings.DATABASE_URL.startswith("sqlite"):
    ensure_sqlite_schema(engine)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


def get_db():
    """FastAPI dependency — yields a database session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
