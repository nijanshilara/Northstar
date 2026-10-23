"""
Pydantic schemas for Memory Capsules and Travel Memories.
"""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, field_validator


# ── Memory schemas ────────────────────────────────────────────────────────────


class MemoryCreateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = None
    memory_date: Optional[date] = None
    location: Optional[str] = Field(default=None, max_length=200)
    media_type: str = Field(default="image", pattern="^(image|video)$")
    media_url: str = Field(..., max_length=500)
    thumbnail_url: Optional[str] = Field(default=None, max_length=500)
    file_size_bytes: Optional[int] = None
    display_order: int = 0


class MemoryUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = None
    memory_date: Optional[date] = None
    location: Optional[str] = Field(default=None, max_length=200)
    media_type: Optional[str] = Field(default=None, pattern="^(image|video)$")
    media_url: Optional[str] = Field(default=None, max_length=500)
    thumbnail_url: Optional[str] = Field(default=None, max_length=500)
    display_order: Optional[int] = None


class MemoryOut(BaseModel):
    id: int
    capsule_id: int
    title: Optional[str] = None
    note: Optional[str] = None
    memory_date: Optional[date] = None
    location: Optional[str] = None
    media_type: str
    media_url: str
    thumbnail_url: Optional[str] = None
    file_size_bytes: Optional[int] = None
    display_order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)



class ReorderMemoriesRequest(BaseModel):
    memory_ids: List[int] = Field(..., description="Ordered list of memory IDs")


# ── Capsule schemas ───────────────────────────────────────────────────────────

class CapsuleCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    destination: Optional[str] = Field(default=None, max_length=200)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    cover_image_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("end_date")
    @classmethod
    def end_date_after_start(cls, v: Optional[date], info) -> Optional[date]:
        if v and info.data.get("start_date") and v < info.data["start_date"]:
            raise ValueError("End date cannot be earlier than start date.")
        return v


class CapsuleUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    destination: Optional[str] = Field(default=None, max_length=200)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    cover_image_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("end_date")
    @classmethod
    def end_date_after_start(cls, v: Optional[date], info) -> Optional[date]:
        if v and info.data.get("start_date") and v < info.data["start_date"]:
            raise ValueError("End date cannot be earlier than start date.")
        return v


class CapsuleSummaryOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    cover_image_url: Optional[str] = None
    memory_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)



class CapsuleDetailOut(CapsuleSummaryOut):
    memories: List[MemoryOut] = []
