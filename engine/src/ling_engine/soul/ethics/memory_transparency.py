"""
记忆透明度 — Phase 2 Stub

让用户了解灵记住了什么、如何使用记忆、以及如何删除记忆。
Phase 1 暂不实现完整功能，仅提供 API 接口 stub。
"""

from typing import List, Dict, Any, Optional
from loguru import logger


async def get_user_memory_summary(user_id: str) -> Optional[Dict[str, Any]]:
    """获取用户的记忆摘要 — Phase 2 实现

    返回灵记住了什么（分类统计），不返回原始内容。
    """
    # Phase 2: 查询 MongoDB 和 EverMemOS 统计
    logger.debug(f"[Transparency] Memory summary requested for {user_id} (stub)")
    return None


async def list_user_memories(
    user_id: str,
    category: str = "all",
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """列出用户的记忆条目 — Phase 2 实现

    用户可以查看灵记住的具体内容。
    """
    logger.debug(f"[Transparency] Memory list requested for {user_id} (stub)")
    return []


async def delete_user_memory(user_id: str, memory_id: str) -> bool:
    """删除指定记忆 — Phase 2 实现

    用户有权删除灵对自己的任何记忆。
    """
    logger.debug(f"[Transparency] Memory delete requested: {memory_id} (stub)")
    return False


async def delete_all_user_memories(user_id: str) -> int:
    """删除用户的所有记忆 — Phase 2+ 实现

    GDPR 式的 "被遗忘权"。
    覆盖范围: soul_emotions, soul_importance, soul_relationships, soul_stories
    """
    logger.debug(f"[Transparency] Full memory wipe requested for {user_id} (stub)")
    return 0
