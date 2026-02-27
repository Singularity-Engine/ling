"""记忆抽象层级数据模型 — Phase 3b 预留, 3b-beta 实现生成器

L1: WeeklyDigest  — 周摘要 (从当周 episode 压缩)
L2: MonthlyTheme  — 月度主题 (从周摘要进一步压缩)
L3: LifeChapter   — 人生章节 (用户生活的大段叙事)
"""

from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class WeeklyDigest(BaseModel):
    """L1: 周摘要 — 夜间整理时从当周 episode 压缩生成"""
    user_id: str
    week_start: datetime                                        # 周一日期
    summary: str = ""                                           # "本周主要聊了面试准备和吉他练习"
    dominant_emotion: str = "neutral"                           # 加权平均 (高强度>高频率)
    emotion_trend: str = "stable"                               # rising/falling/stable
    key_events: List[str] = Field(default_factory=list)         # 3-5 个关键事件
    emotional_peak: Optional[str] = None                        # 本周情感最高峰描述
    story_thread_updates: List[str] = Field(default_factory=list)
    source_episode_ids: List[str] = Field(default_factory=list) # Phase 4: 来源 episode 追溯
    source: str = "llm_generated"                               # 标记来源 (伦理透明)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MonthlyTheme(BaseModel):
    """L2: 月度主题 — 从周摘要进一步压缩"""
    user_id: str
    month: str = ""                                             # "2026-02"
    themes: List[str] = Field(default_factory=list)             # ["职业转型", "音乐探索"]
    emotional_arc: str = ""                                     # "焦虑→准备→挑战"
    key_milestones: List[str] = Field(default_factory=list)     # 2-3 个里程碑
    defining_quote: Optional[str] = None                        # 本月代表性原话
    source_weekly_ids: List[str] = Field(default_factory=list)  # Phase 4: 来源 WeeklyDigest 追溯
    source: str = "llm_generated"
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LifeChapter(BaseModel):
    """L3: 人生章节 — 用户生活的大段叙事"""
    user_id: str
    title: str = ""                                             # 描述性而非判断性 (伦理)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None                         # None = 进行中
    theme: str = ""
    emotional_arc: str = ""
    defining_moments: List[str] = Field(default_factory=list)
    lessons_learned: List[str] = Field(default_factory=list)    # v3: 这个阶段灵学到了什么
    source: str = "llm_generated"
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
