from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class Sector(BaseModel):
    __tablename__ = "sectors"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
