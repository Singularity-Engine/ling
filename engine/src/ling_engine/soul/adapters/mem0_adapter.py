"""
Mem0 适配器 — 语义记忆 + 实体搜索 MemoryPort 实现

提供 Soul System 缺少的能力:
- Entity-level memory: "小明是用户的大学同学，去年换了工作"
- Graph Memory: 实体间关系网络
- Hybrid search: 语义 + 图谱混合检索

大师建议:
- 🤖对话: Entity Search 对对话价值最大 (用户说"小明"能立即知道是谁)
- 🏗️架构: 作为第 11 路搜索源, 不替换任何现有组件
- 🔐安全: user_id 强制校验, 所有操作带 user_id 隔离
- ⚡性能: 300ms 超时, 本地部署优先
"""

import os
import re
from typing import List, Optional, Dict, Any

from loguru import logger

from ..ports.memory_port import MemoryPort, MemoryResult, MemorySource, MemoryWriteRequest

_USER_ID_PATTERN = re.compile(r'^[\w\-.:]{1,128}$')

# Mem0 配置
MEM0_API_URL = os.environ.get("MEM0_API_URL", "http://localhost:8050")
MEM0_TIMEOUT = float(os.environ.get("MEM0_TIMEOUT", "0.3"))  # 300ms


class Mem0Adapter(MemoryPort):
    """Mem0 语义记忆适配器

    search: Entity search + semantic search 混合
    write: 通过 Mem0 API 写入记忆
    Mem0 不可用时静默返回空结果 (不影响其他路)
    """

    def __init__(self):
        self._client = None
        self._initialized = False
        self._available = False

    @property
    def section_name(self) -> str:
        return "entity-context"

    @property
    def priority(self) -> float:
        return 4.5  # 在 user-profile(4) 和 graph-insights(5) 之间

    @property
    def port_name(self) -> str:
        return "mem0"

    @property
    def timeout_seconds(self) -> float:
        return MEM0_TIMEOUT

    async def _ensure_client(self):
        """懒初始化 Mem0 客户端"""
        if self._initialized:
            return
        self._initialized = True
        try:
            from mem0 import MemoryClient
            api_key = os.environ.get("MEM0_API_KEY", "")
            if api_key:
                # 云端模式
                self._client = MemoryClient(api_key=api_key)
            else:
                # 本地模式 (self-hosted)
                from mem0 import Memory
                config = {
                    "graph_store": {
                        "provider": "neo4j",
                        "config": {
                            "url": os.environ.get("NEO4J_URL", "bolt://localhost:7687"),
                            "username": os.environ.get("NEO4J_USER", "neo4j"),
                            "password": os.environ.get("NEO4J_PASSWORD", ""),
                        },
                    },
                    "vector_store": {
                        "provider": "qdrant",
                        "config": {
                            "host": os.environ.get("QDRANT_HOST", "localhost"),
                            "port": int(os.environ.get("QDRANT_PORT", "6333")),
                        },
                    },
                }
                self._client = Memory.from_config(config)
            self._available = True
            logger.info("[Mem0] Client initialized")
        except ImportError:
            logger.info("[Mem0] mem0 not installed, adapter disabled")
            self._available = False
        except Exception as e:
            logger.warning(f"[Mem0] Init failed: {e}")
            self._available = False

    async def search(
        self,
        query: str,
        user_id: str,
        top_k: int = 3,
        **kwargs,
    ) -> List[MemoryResult]:
        """搜索 Mem0 记忆 — 语义 + 实体混合"""
        if not user_id or not _USER_ID_PATTERN.match(user_id):
            return []

        await self._ensure_client()
        if not self._available or self._client is None:
            return []

        try:
            return await self._search_inner(query, user_id, top_k)
        except Exception as e:
            logger.debug(f"[Mem0] Search failed: {e}")
            return []

    async def _search_inner(
        self, query: str, user_id: str, top_k: int,
    ) -> List[MemoryResult]:
        """Mem0 搜索内部实现"""
        import asyncio
        loop = asyncio.get_event_loop()

        # 1. 语义搜索
        search_results = await loop.run_in_executor(
            None,
            lambda: self._client.search(query, user_id=user_id, limit=top_k),
        )

        results = []
        if search_results:
            memories = search_results if isinstance(search_results, list) else search_results.get("results", [])
            for mem in memories:
                content = ""
                if isinstance(mem, dict):
                    content = mem.get("memory", mem.get("content", ""))
                elif hasattr(mem, "memory"):
                    content = mem.memory
                else:
                    content = str(mem)

                if not content:
                    continue

                # 敏感内容过滤 (🔐安全)
                from ..ethics.sensitive_filter import check_sensitivity
                if check_sensitivity(content) == "block":
                    continue

                score = 0.0
                if isinstance(mem, dict):
                    score = mem.get("score", mem.get("relevance", 0.5))
                elif hasattr(mem, "score"):
                    score = mem.score

                results.append(MemoryResult(
                    content=content,
                    source=MemorySource.MEM0,
                    confidence=min(float(score), 1.0) if score else 0.6,
                    metadata={"type": "semantic"},
                ))

        return results[:top_k]

    async def write(self, request: MemoryWriteRequest) -> bool:
        """写入 Mem0 记忆"""
        await self._ensure_client()
        if not self._available or self._client is None:
            return False

        if not request.user_id or not _USER_ID_PATTERN.match(request.user_id):
            return False

        # 敏感内容过滤
        from ..ethics.sensitive_filter import check_sensitivity
        sensitivity = check_sensitivity(request.content)
        if sensitivity == "block":
            return False

        content = request.content
        if sensitivity == "caution":
            content = "[用户分享了健康相关信息]"

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self._client.add(
                    content,
                    user_id=request.user_id,
                    metadata=request.metadata,
                ),
            )
            return True
        except Exception as e:
            logger.debug(f"[Mem0] Write failed: {e}")
            return False

    async def write_conversation(
        self,
        user_input: str,
        ai_response: str,
        user_id: str,
    ) -> bool:
        """从对话中提取记忆写入 Mem0

        Mem0 内部会自动提取实体和事实。
        """
        await self._ensure_client()
        if not self._available or self._client is None:
            return False

        # 敏感内容过滤
        from ..ethics.sensitive_filter import check_sensitivity
        if check_sensitivity(user_input) == "block":
            return False

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            messages = [
                {"role": "user", "content": user_input},
                {"role": "assistant", "content": ai_response},
            ]
            await loop.run_in_executor(
                None,
                lambda: self._client.add(
                    messages,
                    user_id=user_id,
                ),
            )
            return True
        except Exception as e:
            logger.debug(f"[Mem0] Conversation write failed: {e}")
            return False

    async def delete_user_data(self, user_id: str) -> int:
        """GDPR: 删除用户在 Mem0 中的所有记忆"""
        await self._ensure_client()
        if not self._available or self._client is None:
            return 0

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self._client.delete_all(user_id=user_id),
            )
            return 1  # Mem0 批量删除不返回计数
        except Exception as e:
            logger.warning(f"[Mem0] GDPR delete failed: {e}")
            return -1

    async def health_check(self) -> bool:
        """Mem0 健康检查"""
        await self._ensure_client()
        return self._available

    def format_section(self, results: List[MemoryResult]) -> Optional[str]:
        """格式化实体上下文 — 🤖对话设计师风格"""
        if not results:
            return None
        items = "\n".join(f"- {r.content}" for r in results)
        return (
            f"<entity-context>\n"
            f"你记得的关于用户提到的人和事:\n"
            f"{items}\n"
            f"这些是你对用户世界中具体人物和事件的了解，自然地融入对话。\n"
            f"</entity-context>"
        )


# 单例
_mem0_adapter: Optional[Mem0Adapter] = None


def get_mem0_adapter() -> Mem0Adapter:
    global _mem0_adapter
    if _mem0_adapter is None:
        _mem0_adapter = Mem0Adapter()
    return _mem0_adapter
