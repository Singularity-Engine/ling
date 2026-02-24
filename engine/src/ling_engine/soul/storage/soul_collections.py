"""
MongoDB 集合访问器 + 索引初始化
"""

from loguru import logger

EMOTIONS = "soul_emotions"
STORIES = "soul_stories"
IMPORTANCE = "soul_importance"
RELATIONSHIPS = "soul_relationships"

_indexes_created = False


async def get_collection(name: str):
    """获取 MongoDB 集合, 不可用时返回 None"""
    from .mongo_client import get_soul_db
    db = await get_soul_db()
    if db is None:
        return None
    return db[name]


async def ensure_indexes():
    """创建必要的索引 (仅执行一次)"""
    global _indexes_created
    if _indexes_created:
        return

    from .mongo_client import get_soul_db
    db = await get_soul_db()
    if db is None:
        return

    try:
        # soul_emotions: (user_id, created_at)
        await db[EMOTIONS].create_index(
            [("user_id", 1), ("created_at", -1)],
            background=True,
        )

        # Phase 2: 情感共振复合索引
        await db[EMOTIONS].create_index(
            [("user_id", 1), ("user_emotion", 1), ("emotion_intensity", -1), ("created_at", -1)],
            background=True,
        )

        # soul_stories: (user_id, status)
        await db[STORIES].create_index(
            [("user_id", 1), ("status", 1)],
            background=True,
        )

        # soul_importance: (user_id, created_at)
        await db[IMPORTANCE].create_index(
            [("user_id", 1), ("created_at", -1)],
            background=True,
        )

        # soul_relationships: user_id unique
        await db[RELATIONSHIPS].create_index(
            "user_id",
            unique=True,
            background=True,
        )

        _indexes_created = True
        logger.info("[Soul] MongoDB indexes ensured")
    except Exception as e:
        logger.warning(f"[Soul] Index creation failed (non-fatal): {e}")
