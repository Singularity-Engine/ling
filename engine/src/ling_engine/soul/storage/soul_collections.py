"""
MongoDB 集合访问器 + 索引初始化
"""

from loguru import logger

EMOTIONS = "soul_emotions"
STORIES = "soul_stories"
IMPORTANCE = "soul_importance"
RELATIONSHIPS = "soul_relationships"
# Phase 3: 知识图谱
SEMANTIC_NODES = "soul_semantic_nodes"
SEMANTIC_EDGES = "soul_semantic_edges"
# Phase 3b: 抽象层级 + 整理日志
WEEKLY_DIGESTS = "soul_weekly_digests"
MONTHLY_THEMES = "soul_monthly_themes"
LIFE_CHAPTERS = "soul_life_chapters"
CONSOLIDATION_LOG = "soul_consolidation_log"
# Phase 4: 集体灵魂
COLLECTIVE_PATTERNS = "soul_collective_patterns"
SELF_NARRATIVE = "soul_self_narrative"

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

        # Phase 3: 知识图谱索引
        # nodes: (user_id, label) unique — 去重
        await db[SEMANTIC_NODES].create_index(
            [("user_id", 1), ("label", 1)],
            unique=True,
            background=True,
        )
        # nodes: (user_id, category) — 分类查询
        await db[SEMANTIC_NODES].create_index(
            [("user_id", 1), ("category", 1)],
            background=True,
        )
        # nodes: (user_id, mention_count desc) — 频繁概念优先匹配
        await db[SEMANTIC_NODES].create_index(
            [("user_id", 1), ("mention_count", -1)],
            background=True,
        )
        # edges: (user_id, source_label) — $graphLookup 起点
        await db[SEMANTIC_EDGES].create_index(
            [("user_id", 1), ("source_label", 1)],
            background=True,
        )
        # edges: (user_id, target_label) — 反向查询
        await db[SEMANTIC_EDGES].create_index(
            [("user_id", 1), ("target_label", 1)],
            background=True,
        )
        # edges: (user_id, source_id) — 节点级联删除
        await db[SEMANTIC_EDGES].create_index(
            [("user_id", 1), ("source_id", 1)],
            background=True,
        )
        # edges: (user_id, target_id) — 节点级联删除
        await db[SEMANTIC_EDGES].create_index(
            [("user_id", 1), ("target_id", 1)],
            background=True,
        )

        # Phase 3b: 抽象层级索引
        await db[WEEKLY_DIGESTS].create_index(
            [("user_id", 1), ("week_start", -1)],
            unique=True, background=True)
        await db[MONTHLY_THEMES].create_index(
            [("user_id", 1), ("month", 1)],
            unique=True, background=True)
        await db[LIFE_CHAPTERS].create_index(
            [("user_id", 1), ("started_at", -1)],
            background=True)

        # Phase 3b: 整理日志 (只保留 TTL 索引, 不另建普通索引)
        await db[CONSOLIDATION_LOG].create_index(
            "run_date", expireAfterSeconds=90 * 86400, background=True)

        # Phase 4: 集体模式
        await db[COLLECTIVE_PATTERNS].create_index(
            "pattern_id", unique=True, background=True)
        await db[COLLECTIVE_PATTERNS].create_index(
            [("category", 1), ("confidence", -1)], background=True)
        await db[COLLECTIVE_PATTERNS].create_index(
            "tags", background=True)

        # Phase 4: 灵的自我叙事
        await db[SELF_NARRATIVE].create_index(
            "month", unique=True, background=True)

        # Phase 3: 数据保留 TTL 索引
        # soul_emotions: 180 天自动过期
        await db[EMOTIONS].create_index(
            "created_at",
            expireAfterSeconds=180 * 86400,
            background=True,
        )
        # soul_importance: 180 天自动过期
        await db[IMPORTANCE].create_index(
            "created_at",
            expireAfterSeconds=180 * 86400,
            background=True,
        )

        _indexes_created = True
        logger.info("[Soul] MongoDB indexes ensured")
    except Exception as e:
        logger.warning(f"[Soul] Index creation failed (non-fatal): {e}")
