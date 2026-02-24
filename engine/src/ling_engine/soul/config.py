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

        if self.enabled:
            logger.info(f"[Soul] 灵魂系统已启用 (MongoDB: {self.mongo_url}/{self.mongo_database})")
        else:
            logger.info("[Soul] 灵魂系统未启用 (SOUL_ENABLED != true)")


def get_soul_config() -> SoulConfig:
    """获取灵魂系统配置单例"""
    global _soul_config
    if _soul_config is None:
        _soul_config = SoulConfig()
    return _soul_config
