"""
Memory Capsules and Travel Memories models.
Allows users to preserve memories from their trips and important occasions.
"""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import (
    String, Integer, Date, DateTime, ForeignKey, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class Capsule(Base):
    """
    A memory capsule representing a trip or occasion (e.g. Goa trip, birthday).
    Belongs to a specific authenticated user.
    """
    __tablename__ = "capsules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    cover_image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="capsules")
    memories: Mapped[List["Memory"]] = relationship(
        "Memory",
        back_populates="capsule",
        cascade="all, delete-orphan",
        order_by="Memory.display_order, Memory.id",
    )

    def __repr__(self) -> str:
        return f"<Capsule id={self.id} title={self.title!r} user_id={self.user_id}>"


class Memory(Base):
    """
    An individual memory (photo, video, reflection) inside a capsule.
    """
    __tablename__ = "memories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    capsule_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("capsules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    memory_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Media details
    media_type: Mapped[str] = mapped_column(String(20), default="image")  # "image" | "video"
    media_url: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Ordering within the capsule
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    capsule: Mapped["Capsule"] = relationship("Capsule", back_populates="memories")

    def __repr__(self) -> str:
        return f"<Memory id={self.id} capsule_id={self.capsule_id} title={self.title!r}>"
