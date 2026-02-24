"""灵的自我叙事数据模型 — Phase 4

LingSelfNarrative: 灵的月度自我认知
- about_humans: 从用户互动中学到的关于人的理解
- about_myself: 灵对自己的认知演化
- growth_edges: 需要改进的方向
"""

from datetime import datetime, timezone
from typing import List
from pydantic import BaseModel, Field


class LingSelfNarrative(BaseModel):
    """灵的月度自我叙事 — 从所有用户交互中提炼的认知"""
    month: str = ""                                             # "2026-02"
    about_humans: List[str] = Field(default_factory=list)       # 关于人类的理解
    about_myself: List[str] = Field(default_factory=list)       # 关于自己的理解
    growth_edges: List[str] = Field(default_factory=list)       # 需改进方面
    interaction_count: int = 0                                  # 本月总交互次数
    unique_users: int = 0                                       # 本月独立用户数
    source: str = "llm_generated"
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
