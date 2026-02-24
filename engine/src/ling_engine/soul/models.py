"""
灵魂系统数据模型 — Pydantic v2
"""

from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class RelationshipStage(str, Enum):
    STRANGER = "stranger"
    ACQUAINTANCE = "acquaintance"
    FAMILIAR = "familiar"
    CLOSE = "close"
    SOULMATE = "soulmate"


# 阶段阈值: (min_score, min_days)
# 分数来源: PostProcessor 的 relationship_signals (casual_chat=1.0, humor=2.0, advice=3.0, vulnerability=5.0)
# 典型路径: 每日闲聊约 +2 分 → acquaintance ~5天, familiar ~25天, close ~75天
# v3 设计文档阈值较低 (5/30/100/300)，实际调高以防关系升级过快
STAGE_THRESHOLDS = {
    RelationshipStage.STRANGER: (0, 0),        # 初始状态
    RelationshipStage.ACQUAINTANCE: (10, 1),    # ~5 次对话
    RelationshipStage.FAMILIAR: (50, 7),        # ~25 次深度对话, 至少一周
    RelationshipStage.CLOSE: (150, 30),         # ~75 次, 至少一月
    RelationshipStage.SOULMATE: (500, 90),      # ~250 次, 至少三月
}


class EmotionAnnotation(BaseModel):
    """对话的情感标注"""
    episode_id: str = ""
    user_id: str
    user_emotion: str = "neutral"  # joy/sadness/anxiety/excitement/anger/neutral
    emotion_intensity: float = 0.0  # 0-1
    emotional_trajectory: str = "stable"  # rising/falling/stable/volatile
    ling_recommended_tone: str = "neutral"
    trigger_keywords: List[str] = Field(default_factory=list)
    is_emotional_peak: bool = False
    peak_description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StoryThread(BaseModel):
    """用户生活中的一条故事线"""
    thread_id: str = ""
    user_id: str
    title: str = ""
    status: str = "active"  # active / dormant / resolved
    theme: str = ""
    tension: str = ""
    arc_position: str = "setup"
    episode_ids: List[str] = Field(default_factory=list)
    key_moments: List[str] = Field(default_factory=list)
    expected_next: Optional[str] = None
    follow_up_after: Optional[datetime] = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ImportanceScore(BaseModel):
    """多因子重要度评分"""
    user_id: str
    score: float = 0.0  # 0-1
    emotional: float = 0.0
    novelty: float = 0.0
    personal: float = 0.0
    actionable: float = 0.0
    recency: float = 0.0
    summary: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserRelationship(BaseModel):
    """用户关系阶段"""
    user_id: str
    stage: RelationshipStage = RelationshipStage.STRANGER
    stage_entered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_conversations: int = 0
    total_days_active: int = 0
    accumulated_score: float = 0.0
    signal_history: List[Dict[str, Any]] = Field(default_factory=list)
    last_interaction: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_interaction_date: Optional[str] = None  # YYYY-MM-DD, for total_days_active tracking
    cooling_warned: bool = False
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StoryUpdate(BaseModel):
    """类型化故事线更新 — Phase 3: 替代 Dict[str, Any]"""
    title: str
    update_type: str = "continue"  # new/continue/resolve
    details: str = ""
    arc_position: str = "setup"
    expected_next: Optional[str] = None


class ExtractionResult(BaseModel):
    """LLM 合并提取结果"""
    emotion: Optional[EmotionAnnotation] = None
    importance: Optional[ImportanceScore] = None
    story_update: Optional[StoryUpdate] = None
    relationship_signals: List[Dict[str, Any]] = Field(default_factory=list)
    semantic_graph: Optional[Dict[str, Any]] = None  # Phase 3: 知识图谱提取


class SoulContext(BaseModel):
    """灵魂召回上下文 — SoulRecall 输出, ContextBuilder 输入"""
    qdrant_memories: List[str] = Field(default_factory=list)
    evermemos_memories: List[str] = Field(default_factory=list)
    triggered_foresights: List[str] = Field(default_factory=list)
    user_profile_summary: str = ""
    story_continuations: List[str] = Field(default_factory=list)
    relationship_stage: str = "stranger"
    stage_behavior_hint: str = ""
    conversation_count: int = 0  # Round 4: 从 relationship doc 读取
    # Phase 2: 叙事灵魂
    emotional_resonance: List[str] = Field(default_factory=list)      # 第 7 路: 情感共振记忆
    in_conversation_shift: Optional[str] = None                        # 对话内情绪突变提示
    breakthrough_hint: Optional[str] = None                            # 突破性事件提示
    # Phase 3: 深层灵魂
    graph_insights: List[str] = Field(default_factory=list)              # 第 8 路: 知识图谱推理
