from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CameraCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    area: str | None = Field(default=None, max_length=200)
    map_x: float | None = None
    map_y: float | None = None
    stream_url: str | None = None
    is_active: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class CameraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    area: str | None = Field(default=None, max_length=200)
    map_x: float | None = None
    map_y: float | None = None
    stream_url: str | None = None
    is_active: bool | None = None
    metadata: dict[str, Any] | None = None


class VectorMatchRequest(BaseModel):
    embedding: list[float] = Field(min_length=512, max_length=512)
    threshold: float = Field(default=0.65, ge=-1, le=1)
    limit: int = Field(default=20, ge=1, le=100)
    camera_id: UUID | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    model_version: str | None = None

    @model_validator(mode="after")
    def validate_time_range(self) -> "VectorMatchRequest":
        if self.start_time and self.end_time and self.end_time < self.start_time:
            raise ValueError("end_time must be greater than or equal to start_time")
        return self


class ApiMessage(BaseModel):
    message: str

