"""集体智慧伦理框架 — Phase 4

确保集体智慧系统不侵犯个人隐私:
- k-anonymity ≥ 50: 每个模式至少来自 50 个用户
- min_sample_size = 100: 至少 100 个用户数据才开始生成
- 审计日志: 记录每次模式生成的过程
- 无法追溯: 从模式无法还原到任何个体
"""

from datetime import datetime, timezone
from typing import Dict, Optional

from loguru import logger

from .models import CollectiveEthicsPolicy

_DEFAULT_POLICY = CollectiveEthicsPolicy()


async def validate_pattern_anonymity(
    sample_size: int,
    unique_users: int,
    policy: Optional[CollectiveEthicsPolicy] = None,
) -> Dict:
    """验证模式是否满足匿名化要求

    Returns:
        {"valid": bool, "reason": str}
    """
    p = policy or _DEFAULT_POLICY

    if sample_size < p.min_sample_size:
        return {
            "valid": False,
            "reason": f"sample_size={sample_size} < min={p.min_sample_size}",
        }
    if unique_users < p.k_anonymity:
        return {
            "valid": False,
            "reason": f"unique_users={unique_users} < k={p.k_anonymity}",
        }
    return {"valid": True, "reason": "ok"}


async def audit_pattern_creation(
    pattern_id: str,
    situation: str,
    sample_size: int,
    action: str = "created",
) -> None:
    """记录模式创建/更新审计日志

    写入 consolidation_log 集合 (复用已有的 TTL 索引, 90 天自动清理)。
    只记录元数据, 不记录任何用户信息。
    """
    try:
        from ..storage.soul_collections import get_collection, CONSOLIDATION_LOG
        coll = await get_collection(CONSOLIDATION_LOG)
        if coll is None:
            return

        await coll.insert_one({
            "run_date": datetime.now(timezone.utc),
            "type": "collective_audit",
            "action": action,
            "pattern_id": pattern_id,
            "situation_preview": situation[:50],
            "sample_size": sample_size,
        })
    except Exception as e:
        logger.debug(f"[CollectiveEthics] Audit log failed: {e}")
