"""
MongoDB 集合访问器 + 索引初始化
"""

import asyncio

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
# Memory Fabric 控制平面
MEMORY_ATOMS = "soul_memory_atoms"
MEMORY_TRACES = "soul_memory_traces"
CORE_BLOCKS = "soul_core_blocks"
PROCEDURAL_RULES = "soul_procedural_rules"
SAFETY_SHADOW = "soul_safety_shadow"
BENCHMARK_RUNS = "soul_benchmark_runs"
SLO_METRICS = "soul_slo_metrics"

_indexes_created = False
_indexes_lock = asyncio.Lock()


async def get_collection(name: str):
    """获取 MongoDB 集合, 不可用时返回 None"""
    from .mongo_client import get_soul_db
    db = await get_soul_db()
    if db is None:
        return None
    return db[name]


async def ensure_indexes():
    """创建必要的索引 (仅执行一次, asyncio.Lock 防并发)"""
    global _indexes_created
    if _indexes_created:
        return

    async with _indexes_lock:
        if _indexes_created:  # double-check inside lock
            return

        from ..config import get_soul_config
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

            # P1: importance 衰减查询加速
            await db[IMPORTANCE].create_index(
                [("user_id", 1), ("decayed", 1)],
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

            # Memory Fabric: MemoryAtom 事件溯源
            await db[MEMORY_ATOMS].create_index(
                "memory_id",
                unique=True,
                background=True,
            )
            await db[MEMORY_ATOMS].create_index(
                [("tenant_id", 1), ("user_id", 1), ("idempotency_key", 1)],
                unique=True,
                sparse=True,
                background=True,
            )
            await db[MEMORY_ATOMS].create_index(
                [("tenant_id", 1), ("user_id", 1), ("event_time", -1)],
                background=True,
            )
            await db[MEMORY_ATOMS].create_index(
                [("state", 1), ("ingest_time", -1)],
                background=True,
            )

            # Memory Fabric: 审计追踪链
            await db[MEMORY_TRACES].create_index(
                [("memory_id", 1), ("created_at", -1)],
                background=True,
            )
            await db[MEMORY_TRACES].create_index(
                [("user_id", 1), ("created_at", -1)],
                background=True,
            )

            # Phase 1: Letta Core Blocks (persona/human/policy)
            await db[CORE_BLOCKS].create_index(
                [("tenant_id", 1), ("user_id", 1), ("block_type", 1)],
                unique=True,
                background=True,
            )

            # Phase 1: LangMem 程序性记忆规则
            await db[PROCEDURAL_RULES].create_index(
                [("tenant_id", 1), ("user_id", 1), ("active", 1), ("priority", -1)],
                background=True,
            )

            # Phase 2: 安全影子记忆 (投毒隔离区)
            await db[SAFETY_SHADOW].create_index(
                [("tenant_id", 1), ("user_id", 1), ("state", 1), ("created_at", -1)],
                background=True,
            )
            await db[SAFETY_SHADOW].create_index(
                [("related_memory_id", 1), ("created_at", -1)],
                background=True,
            )

            # Phase 3: 评测与 SLO
            await db[BENCHMARK_RUNS].create_index(
                [("suite", 1), ("created_at", -1)],
                background=True,
            )
            await db[SLO_METRICS].create_index(
                [("metric_name", 1), ("created_at", -1)],
                background=True,
            )
            await db[SLO_METRICS].create_index(
                [("metric_name", 1), ("stage", 1), ("created_at", -1)],
                background=True,
            )

            # Phase 3: 数据保留 TTL 索引
            # emotions/importance 改用 expires_at 字段做 TTL：
            # - 普通记录写入 expires_at=created_at+180d
            # - flashbulb/no_expire 不写 expires_at，因此不会被 TTL 删除
            ttl_seconds = 0  # expires_at 是绝对过期时间，TTL 必须为 0
            cfg = get_soul_config()
            fabric_retention_seconds = max(1, int(cfg.memory_event_retention_days)) * 86400

            for coll_name in (EMOTIONS, IMPORTANCE):
                coll = db[coll_name]
                idx_info = await coll.index_information()
                # 清理旧 TTL 索引
                for old_idx in ("created_at_1", "ttl_created_at_expirable", "ttl_created_at"):
                    if old_idx in idx_info:
                        await coll.drop_index(old_idx)

                current_ttl = idx_info.get("ttl_expires_at")
                if current_ttl and current_ttl.get("expireAfterSeconds") != ttl_seconds:
                    await coll.drop_index("ttl_expires_at")

                if "ttl_expires_at" not in idx_info:
                    await coll.create_index(
                        "expires_at",
                        name="ttl_expires_at",
                        expireAfterSeconds=ttl_seconds,
                        background=True,
                    )

            # Memory Fabric retention: atom 使用 ingest_time TTL
            # 隔离态(quarantined)需长期保留做安全取证：TTL 仅作用于非隔离态。
            atoms_coll = db[MEMORY_ATOMS]
            atoms_idx_info = await atoms_coll.index_information()
            ttl_filter = {
                "state": {
                    "$in": ["raw", "consolidated", "active", "retired"],
                }
            }
            atoms_current_ttl = atoms_idx_info.get("ttl_ingest_time_retained")
            if atoms_current_ttl and (
                atoms_current_ttl.get("expireAfterSeconds") != fabric_retention_seconds
                or atoms_current_ttl.get("partialFilterExpression") != ttl_filter
            ):
                await atoms_coll.drop_index("ttl_ingest_time_retained")
            await atoms_coll.create_index(
                "ingest_time",
                name="ttl_ingest_time_retained",
                expireAfterSeconds=fabric_retention_seconds,
                partialFilterExpression=ttl_filter,
                background=True,
            )

            # Memory traces retention: 跟随 MemoryAtom 保留窗口
            traces_coll = db[MEMORY_TRACES]
            traces_idx_info = await traces_coll.index_information()
            traces_current_ttl = traces_idx_info.get("ttl_created_at_retained")
            if traces_current_ttl and traces_current_ttl.get("expireAfterSeconds") != fabric_retention_seconds:
                await traces_coll.drop_index("ttl_created_at_retained")
            await traces_coll.create_index(
                "created_at",
                name="ttl_created_at_retained",
                expireAfterSeconds=fabric_retention_seconds,
                background=True,
            )

            _indexes_created = True
            logger.info("[Soul] MongoDB indexes ensured")
        except Exception as e:
            logger.warning(f"[Soul] Index creation failed (non-fatal): {e}")


def reset_soul_collections_state_for_testing():
    """测试辅助: 重置索引初始化标记。"""
    global _indexes_created
    _indexes_created = False
