from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def ensure_email_verification_columns():
    """Add verification fields for existing databases created before email verification."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("users")}
    unique_email_constraints = inspector.get_unique_constraints("users")
    unique_email_indexes = inspector.get_indexes("users")
    with engine.begin() as connection:
        if "is_email_verified" not in columns:
            connection.execute(text(
                "ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN NOT NULL DEFAULT TRUE"
            ))
        if "email_verification_token" not in columns:
            connection.execute(text(
                "ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(128)"
            ))
            connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_verification_token "
                "ON users (email_verification_token)"
            ))
        for constraint in unique_email_constraints:
            if constraint.get("column_names") == ["email"]:
                name = engine.dialect.identifier_preparer.quote(constraint["name"])
                connection.execute(text(f"ALTER TABLE users DROP CONSTRAINT {name}"))
        for index in unique_email_indexes:
            if index.get("unique") and index.get("column_names") == ["email"]:
                name = engine.dialect.identifier_preparer.quote(index["name"])
                connection.execute(text(f"DROP INDEX IF EXISTS {name}"))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_role "
            "ON users (email, role)"
        ))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)"
        ))

def ensure_room_count_column():
    inspector = inspect(engine)
    if "rooms" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("rooms")}
    if "room_count" not in columns:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE rooms ADD COLUMN room_count INTEGER NOT NULL DEFAULT 1"
            ))

def ensure_available_count_column():
    inspector = inspect(engine)
    if "rooms" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("rooms")}
    if "available_count" not in columns:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE rooms ADD COLUMN available_count INTEGER NOT NULL DEFAULT 1"
            ))
            connection.execute(text(
                "UPDATE rooms SET available_count = CASE WHEN available THEN room_count ELSE 0 END"
            ))

def ensure_room_street_length():
    inspector = inspect(engine)
    if "rooms" not in inspector.get_table_names():
        return
    street = next((column for column in inspector.get_columns("rooms") if column["name"] == "street"), None)
    if street is not None and getattr(street["type"], "length", None) != 500:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE rooms ALTER COLUMN street TYPE VARCHAR(500)"))
