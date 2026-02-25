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
        self.graphiti_llm_model = os.environ.get("GRAPHITI_LLM_MODEL", "gpt-4o-mini")
        self.neo4j_url = os.environ.get("NEO4J_URL", self.graphiti_url)
        self.neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
        self.neo4j_password = os.environ.get("NEO4J_PASSWORD", "")

        # SOTA: Mem0 语义记忆
        self.mem0_enabled = os.environ.get("MEM0_ENABLED", "false").lower() in ("true", "1", "yes")
        self.mem0_api_url = os.environ.get("MEM0_API_URL", "http://localhost:8050")
        self.mem0_api_key = os.environ.get("MEM0_API_KEY", "")
        self.mem0_timeout_ms = int(os.environ.get("MEM0_TIMEOUT_MS", "300"))
        self.qdrant_host = os.environ.get("QDRANT_HOST", "localhost")
        self.qdrant_port = int(os.environ.get("QDRANT_PORT", "6333"))
        self.adapter_retry_interval_sec = float(os.environ.get("SOUL_ADAPTER_RETRY_INTERVAL_SEC", "30"))

        # SOTA: 召回扩展
        self.recall_timeout_ms_extended = int(
            os.environ.get("SOUL_RECALL_TIMEOUT_MS_EXTENDED", "600")
        )  # 12 路需更多时间
        self.enable_port_registry = os.environ.get("SOUL_PORT_REGISTRY", "false").lower() in ("true", "1", "yes")

        # Memory Fabric 控制平面
        self.fabric_enabled = os.environ.get("SOUL_FABRIC_ENABLED", "true").lower() in ("true", "1", "yes")
        self.fabric_strict_mode = os.environ.get("SOUL_FABRIC_STRICT_MODE", "false").lower() in ("true", "1", "yes")
        self.memory_event_retention_days = int(os.environ.get("SOUL_MEMORY_EVENT_RETENTION_DAYS", "3650"))

        # Phase 1: 能力层插件 (Letta / LangMem)
        self.letta_enabled = os.environ.get("SOUL_LETTA_ENABLED", "true").lower() in ("true", "1", "yes")
        self.langmem_enabled = os.environ.get("SOUL_LANGMEM_ENABLED", "true").lower() in ("true", "1", "yes")
        self.letta_mode = os.environ.get("SOUL_LETTA_MODE", "local").lower()  # local/http/auto
        self.letta_url = os.environ.get("SOUL_LETTA_URL", "").strip()
        self.letta_api_key = os.environ.get("SOUL_LETTA_API_KEY", "").strip()
        self.letta_timeout_sec = float(os.environ.get("SOUL_LETTA_TIMEOUT_SEC", "3"))
        self.langmem_mode = os.environ.get("SOUL_LANGMEM_MODE", "local").lower()  # local/http/auto
        self.langmem_url = os.environ.get("SOUL_LANGMEM_URL", "").strip()
        self.langmem_api_key = os.environ.get("SOUL_LANGMEM_API_KEY", "").strip()
        self.langmem_timeout_sec = float(os.environ.get("SOUL_LANGMEM_TIMEOUT_SEC", "3"))

        # Phase 2: 记忆演化与安全
        self.amem_enabled = os.environ.get("SOUL_AMEM_ENABLED", "true").lower() in ("true", "1", "yes")
        self.memguard_enabled = os.environ.get("SOUL_MEMGUARD_ENABLED", "true").lower() in ("true", "1", "yes")
        self.memguard_quarantine_threshold = float(
            os.environ.get("SOUL_MEMGUARD_QUARANTINE_THRESHOLD", "0.75")
        )

        # Phase 3: 评测与 SLO 自动调参
        self.benchmark_enabled = os.environ.get("SOUL_BENCHMARK_ENABLED", "true").lower() in ("true", "1", "yes")
        self.autotune_enabled = os.environ.get("SOUL_AUTOTUNE_ENABLED", "true").lower() in ("true", "1", "yes")
        self.slo_recall_p95_ms = int(os.environ.get("SOUL_SLO_RECALL_P95_MS", "450"))
        self.slo_window_size = int(os.environ.get("SOUL_SLO_WINDOW_SIZE", "200"))
        self.slo_min_samples = int(os.environ.get("SOUL_SLO_MIN_SAMPLES", "30"))
        self.benchmark_require_real = os.environ.get("SOUL_BENCHMARK_REQUIRE_REAL", "false").lower() in ("true", "1", "yes")
        self.benchmark_timeout_sec = float(os.environ.get("SOUL_BENCHMARK_TIMEOUT_SEC", "1800"))
        self.benchmark_cmd_longmemeval = os.environ.get("SOUL_BENCHMARK_CMD_LONGMEMEVAL", "").strip()
        self.benchmark_cmd_locomo = os.environ.get("SOUL_BENCHMARK_CMD_LOCOMO", "").strip()
        self.benchmark_cmd_memoryarena = os.environ.get("SOUL_BENCHMARK_CMD_MEMORYARENA", "").strip()
        self.benchmark_cmd_locomo_plus = os.environ.get("SOUL_BENCHMARK_CMD_LOCOMO_PLUS", "").strip()
        self.benchmark_min_improvement = float(os.environ.get("SOUL_BENCHMARK_MIN_IMPROVEMENT", "0.15"))
        self.benchmark_baseline_longmemeval = float(
            os.environ.get("SOUL_BENCHMARK_BASELINE_LONGMEMEVAL", "0")
        )
        self.benchmark_baseline_locomo = float(os.environ.get("SOUL_BENCHMARK_BASELINE_LOCOMO", "0"))
        self.benchmark_baseline_memoryarena = float(
            os.environ.get("SOUL_BENCHMARK_BASELINE_MEMORYARENA", "0")
        )
        self.benchmark_baseline_locomo_plus = float(
            os.environ.get("SOUL_BENCHMARK_BASELINE_LOCOMO_PLUS", "0")
        )

        # Phase 4 (试点): MemOS 风格控制平面
        self.memos_pilot_enabled = os.environ.get("SOUL_MEMOS_PILOT_ENABLED", "false").lower() in ("true", "1", "yes")

        if self.enabled:
            extras = []
            if self.graphiti_enabled:
                extras.append(f"Graphiti: {self.graphiti_url}")
            if self.mem0_enabled:
                extras.append(f"Mem0: {self.mem0_api_url}")
            if self.fabric_enabled:
                extras.append("Fabric: on")
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


def reset_soul_config_for_testing():
    """测试辅助: 重置配置单例，便于每个用例重新读取环境变量。"""
    global _soul_config
    _soul_config = None
