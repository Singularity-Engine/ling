"""
Port 初始化器 — 根据配置自动注册所有记忆源

在 Soul System 启动时调用, 根据环境变量决定启用哪些 Port。
"""

from loguru import logger
from threading import Lock


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
