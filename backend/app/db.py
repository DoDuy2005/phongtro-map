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

def ensure_favorite_snapshots():
    inspector = inspect(engine)
    if "favorites" not in inspector.get_table_names() or "rooms" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("favorites")}
    with engine.begin() as connection:
        if "room_snapshot_id" not in columns:
            connection.execute(text("ALTER TABLE favorites ADD COLUMN room_snapshot_id UUID"))
        if "snapshot" not in columns:
            connection.execute(text("ALTER TABLE favorites ADD COLUMN snapshot JSON"))
        connection.execute(text(
            "UPDATE favorites SET room_snapshot_id = room_id WHERE room_snapshot_id IS NULL"
        ))
        connection.execute(text("""
            UPDATE favorites AS f SET snapshot = json_build_object(
                'title', r.title,
                'source', r.source,
                'source_url', CASE WHEN r.source = 'nhatot' THEN r.source_url ELSE NULL END,
                'price', r.price,
                'area', r.area,
                'region', r.region,
                'district', r.district,
                'ward', r.ward,
                'street', r.street,
                'address', r.address,
                'images', r.images,
                'room_count', r.room_count
            ) FROM rooms AS r WHERE f.room_id = r.id AND f.snapshot IS NULL
        """))
        for foreign_key in inspector.get_foreign_keys("favorites"):
            if foreign_key.get("constrained_columns") == ["room_id"] and foreign_key.get("name"):
                name = engine.dialect.identifier_preparer.quote(foreign_key["name"])
                connection.execute(text(f"ALTER TABLE favorites DROP CONSTRAINT {name}"))
        connection.execute(text("ALTER TABLE favorites ALTER COLUMN room_id DROP NOT NULL"))
        connection.execute(text(
            "ALTER TABLE favorites ADD CONSTRAINT fk_favorites_room_set_null "
            "FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL"
        ))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_favorite_snapshot "
            "ON favorites (user_id, room_snapshot_id)"
        ))
