"""集体智慧数据模型 — Phase 4

CollectivePattern: 匿名跨用户模式 (从 ≥100 用户中提炼)
所有模式满足 k-anonymity (k≥50), 无法追溯到个体。
"""

from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class CollectivePattern(BaseModel):
    """匿名跨用户模式 — 从大量用户交互中提炼的通用智慧"""
    pattern_id: str = ""
    situation: str = ""                                     # "用户经历分手/感情结束"
    common_phases: List[str] = Field(default_factory=list)  # ["震惊", "否认", "愤怒", "悲伤", "接受"]
    helpful_approaches: str = ""                            # 有效方法文本
    avg_duration: str = ""                                  # "2-4周"
    sample_size: int = 0                                    # 基于用户数 (≥100)
    confidence: float = 0.0                                 # 0-1 置信度
    category: str = "emotional"                             # emotional/career/relationship/growth
    tags: List[str] = Field(default_factory=list)           # 检索标签
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CollectiveEthicsPolicy(BaseModel):
    """集体智慧伦理策略 — 确保隐私安全"""
    min_sample_size: int = 100          # 最少 100 用户样本
    k_anonymity: int = 50               # k-anonymity ≥ 50
    user_consent_required: bool = True  # 需要用户知情同意
    no_individual_trace: bool = True    # 从模式无法追溯个体
    audit_enabled: bool = True          # 记录所有模式生成
