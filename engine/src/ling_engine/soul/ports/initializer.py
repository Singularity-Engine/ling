"""
Port 初始化器 — 根据配置自动注册所有记忆源

在 Soul System 启动时调用, 根据环境变量决定启用哪些 Port。
"""

from loguru import logger
from threading import Lock


def _configure_memory_fabric():
    """将 ling-platform 的 recall/consolidation/deletion 实现注入到 soul_fabric。"""
    from soul_fabric import MemoryFabric, set_memory_fabric

    async def _recall_fn(query, user_id, top_k, timeout_ms, **kwargs):
        from ..recall.soul_recall import get_soul_recall
        return await get_soul_recall().recall(
            query=query, user_id=user_id, top_k=top_k, timeout_ms=timeout_ms,
        )

    async def _consolidation_fn(user_id, dry_run):
        if user_id:
            from ..consolidation.graph_maintenance import GraphMaintenance
            from ..consolidation.memory_decay import MemoryDecayProcessor
            decay_result = await MemoryDecayProcessor()._process_user(user_id, dry_run=dry_run)
            gm = GraphMaintenance()
            merged = await gm._merge_duplicate_nodes(user_id, dry_run=dry_run)
            contradictions = await gm._detect_contradictions(user_id)
            transitive = await gm._discover_transitive_relations(user_id, dry_run=dry_run)
            return {
                "scope": "user", "user_id": user_id, "dry_run": dry_run,
                "memory_decay": decay_result,
                "graph_merge": {"merged": merged, "contradictions": contradictions, "transitive_discovered": transitive},
            }
        else:
            from ..consolidation.nightly_consolidator import NightlyConsolidator
            result = await NightlyConsolidator(dry_run=dry_run).run()
            result["scope"] = "global"
            return result

    async def _deletion_fn(user_id):
        from ..services.memory_deletion import get_deletion_service
        return await get_deletion_service().delete_user(user_id)

    fabric = MemoryFabric(
        recall_fn=_recall_fn,
        consolidation_fn=_consolidation_fn,
        deletion_fn=_deletion_fn,
    )
    set_memory_fabric(fabric)
    logger.info("[Ports] Memory Fabric configured with ling-platform backends")


def initialize_ports():
    """根据配置注册所有可用的 MemoryPort

    调用时机: Soul System 首次 recall 时 (懒初始化)
    """
    from .registry import get_port_registry
    from ..config import get_soul_config

    registry = get_port_registry()
    cfg = get_soul_config()

    if not cfg.enabled:
        return

    # 0. Memory Fabric — 注入 ling-platform 实现
    if cfg.fabric_enabled:
        try:
            _configure_memory_fabric()
        except Exception as e:
            logger.warning(f"[Ports] Memory Fabric configuration failed: {e}")

    # 1. Graphiti — 时序知识图谱 (SOTA P0)
    if cfg.graphiti_enabled:
        try:
            from ..adapters.graphiti_adapter import get_graphiti_adapter
            registry.register(get_graphiti_adapter())
            logger.info("[Ports] Graphiti adapter registered")
        except Exception as e:
            logger.warning(f"[Ports] Graphiti registration failed: {e}")

    # 2. Mem0 — 实体记忆 (SOTA P1)
    if cfg.mem0_enabled:
        try:
            from ..adapters.mem0_adapter import get_mem0_adapter
            registry.register(get_mem0_adapter())
            logger.info("[Ports] Mem0 adapter registered")
        except Exception as e:
            logger.warning(f"[Ports] Mem0 registration failed: {e}")

    logger.info(f"[Ports] Initialized {len(registry.get_active_ports())} ports")


_initialized = False
_init_lock = Lock()


def ensure_ports_initialized():
    """确保 Port 已初始化 (幂等, 只执行一次)"""
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        initialize_ports()
        _initialized = True


def reset_ports_initializer_for_testing():
    """测试辅助: 重置初始化状态和 PortRegistry。"""
    global _initialized
    with _init_lock:
        _initialized = False
    from .registry import reset_port_registry_for_testing

    reset_port_registry_for_testing()
