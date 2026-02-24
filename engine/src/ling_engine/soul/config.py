"""
灵魂系统配置 — 环境变量驱动的单例
"""

import os
from loguru import logger

_soul_config = None


class SoulConfig:
    """灵魂系统配置单例"""

    def __init__(self):
        self.enabled = os.environ.get("SOUL_ENABLED", "false").lower() in ("true", "1", "yes")
        self.mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        self.mongo_database = os.environ.get("MONGO_DB", "ling_soul")

        # LLM 提取配置
        self.extraction_model = os.environ.get("SOUL_EXTRACTION_MODEL", "gpt-4o-mini")
        self.extraction_timeout = float(os.environ.get("SOUL_EXTRACTION_TIMEOUT", "10"))

        # 召回配置
        self.recall_timeout_ms = int(os.environ.get("SOUL_RECALL_TIMEOUT_MS", "500"))
        self.recall_top_k = int(os.environ.get("SOUL_RECALL_TOP_K", "3"))

        # 缓存配置
        self.profile_cache_ttl = int(os.environ.get("SOUL_PROFILE_CACHE_TTL", "3600"))

        # Phase 3: 知识图谱
        self.graph_max_depth = int(os.environ.get("SOUL_GRAPH_MAX_DEPTH", "2"))
        self.graph_trace_timeout_ms = int(os.environ.get("SOUL_GRAPH_TRACE_TIMEOUT_MS", "200"))

        # Phase 3b: 记忆整理
        self.decay_base_rate = float(os.environ.get("SOUL_DECAY_BASE_RATE", "0.03"))
        self.decay_emotion_weight = float(os.environ.get("SOUL_DECAY_EMOTION_WEIGHT", "0.5"))
        self.decay_flashbulb_intensity = float(os.environ.get("SOUL_FLASHBULB_INTENSITY", "0.8"))
        self.consolidation_batch_size = int(os.environ.get("SOUL_CONSOLIDATION_BATCH_SIZE", "100"))

        # SOTA: Graphiti 时序知识图谱
        self.graphiti_enabled = os.environ.get("GRAPHITI_ENABLED", "false").lower() in ("true", "1", "yes")
        self.graphiti_url = os.environ.get("GRAPHITI_URL", "bolt://localhost:7687")
        self.graphiti_timeout_ms = int(os.environ.get("GRAPHITI_TIMEOUT_MS", "200"))

        # SOTA: Mem0 语义记忆
        self.mem0_enabled = os.environ.get("MEM0_ENABLED", "false").lower() in ("true", "1", "yes")
        self.mem0_api_url = os.environ.get("MEM0_API_URL", "http://localhost:8050")
        self.mem0_timeout_ms = int(os.environ.get("MEM0_TIMEOUT_MS", "300"))

        # SOTA: 召回扩展
        self.recall_timeout_ms_extended = int(os.environ.get("SOUL_RECALL_TIMEOUT_MS", "600"))  # 12 路需更多时间
        self.enable_port_registry = os.environ.get("SOUL_PORT_REGISTRY", "false").lower() in ("true", "1", "yes")

        if self.enabled:
            extras = []
            if self.graphiti_enabled:
                extras.append(f"Graphiti: {self.graphiti_url}")
            if self.mem0_enabled:
                extras.append(f"Mem0: {self.mem0_api_url}")
            extra_str = f", {', '.join(extras)}" if extras else ""
            logger.info(f"[Soul] 灵魂系统已启用 (MongoDB: {self.mongo_url}/{self.mongo_database}{extra_str})")
        else:
            logger.info("[Soul] 灵魂系统未启用 (SOUL_ENABLED != true)")


def get_soul_config() -> SoulConfig:
    """获取灵魂系统配置单例"""
    global _soul_config
    if _soul_config is None:
        _soul_config = SoulConfig()
    return _soul_config
