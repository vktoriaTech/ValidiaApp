from app.db.session import engine
from app.models.base import Base

# Import all models so SQLAlchemy registers them before create_all.
import app.models  # noqa: F401


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
