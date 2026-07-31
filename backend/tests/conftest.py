"""Test DB fixtures.

Points at a dedicated `validia_test` database on the same Postgres instance
used by docker-compose (validia-db, exposed on host port 5433) — separate
from the dev database so tests never touch real data. Schema is created
directly from the ORM models (mirrors what app.db.init_db.init_db() does at
app startup) rather than via Alembic, since the first Alembic revision
assumes a baseline schema already exists.

One-time setup (the database itself, not the schema — this fixture creates
the tables automatically):
    docker exec validia-db psql -U validia_user -d postgres \
        -c "CREATE DATABASE validia_test OWNER validia_user;"
"""
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — registers all models on Base.metadata
from app.models.base import Base

TEST_DATABASE_URL = "postgresql://validia_user:ValidiaDB2026!@localhost:5433/validia_test"

engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Truncated before every test, in FK-safe order (children first). CASCADE
# covers anything not listed, so this is a belt-and-suspenders ordering.
_TABLES_TO_CLEAR = [
    "campaign_participant_accumulations",
    "participations",
    "campaign_terms_acceptances",
    "invoices",
    "participants",
    "prizes",
    "campaign_pos",
    "pos",
    "campaigns",
    "users",
    "tenants",
]


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    session.execute(text(f"TRUNCATE TABLE {', '.join(_TABLES_TO_CLEAR)} RESTART IDENTITY CASCADE"))
    session.commit()
    yield session
    session.close()
