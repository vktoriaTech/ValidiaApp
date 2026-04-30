from app.models.base import Base
from app.db.session import engine

# Import all models so SQLAlchemy registers them before create_all
from app.models import (  # noqa: F401
    audit_log,
    campaign,
    invoice,
    participant,
    participation,
    pos,
    tenant,
    user,
)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
