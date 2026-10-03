"""HTTP contracts for one-shot BuildingOps assistant messages."""

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    message: str = Field(min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    answer: str
    model: str
    grounded: bool
    sources: list[str]
