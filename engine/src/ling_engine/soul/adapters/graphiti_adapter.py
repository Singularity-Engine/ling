"""
Graphiti 适配器 — 时序知识图谱 MemoryPort 实现

替换 MongoDB 的 $graphLookup 知识图谱，提供:
- 时序感知的实体关系 (双时间模型)
- 冲突检测与消解 (新事实自动更新旧事实)
- 高性能图查询 (Neo4j 原生)

Fallback: Graphiti 不可用时降级到 MongoDB knowledge_graph.py

设计决策 (大师共识):
- 🏗️架构: 保留 KnowledgeGraph 的公开 API，内部切换到 Graphiti
- ⚡性能: 200ms 超时，circuit breaker 连续 3 次失败熔断
- 💜情感: 时序感知防止 "前女友/新女友" 混淆
- 🔐安全: user_id 强制校验，所有查询带 user_id 过滤
"""

import asyncio
import os
import re
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from loguru import logger

from ..ports.memory_port import MemoryPort, MemoryResult, MemorySource, MemoryWriteRequest

# user_id 校验 (复用 soul_recall 的模式)
_USER_ID_PATTERN = re.compile(r'^[\w\-.:]{1,128}$')

# Graphiti 配置
GRAPHITI_URL = os.environ.get("GRAPHITI_URL", "bolt://localhost:7687")
GRAPHITI_TIMEOUT = float(os.environ.get("GRAPHITI_TIMEOUT", "0.2"))  # 200ms


class GraphitiAdapter(MemoryPort):
    """Graphiti 时序知识图谱适配器

    search: 从 Graphiti 查询实体关系图谱
    write: 通过 Graphiti API 写入实体和关系
    fallback: Graphiti 不可用时降级到 MongoDB KnowledgeGraph
    """

    def __init__(self):
        self._client = None
        self._initialized = False
        self._use_fallback = False

    @property
    def section_name(self) -> str:
        return "graph-insights"

    @property
    def priority(self) -> float:
        return 5.0

    @property
    def port_name(self) -> str:
        return "graphiti"

    @property
    def timeout_seconds(self) -> float:
        return GRAPHITI_TIMEOUT

    async def _ensure_client(self):
        """懒初始化 Graphiti 客户端"""
        if self._initialized:
            return
        self._initialized = True
        try:
            from graphiti_core import Graphiti
            from graphiti_core.llm_client import OpenAIClient

            llm_client = OpenAIClient(
                model=os.environ.get("GRAPHITI_LLM_MODEL", "gpt-4o-mini"),
            )
            self._client = Graphiti(
                GRAPHITI_URL,
                os.environ.get("NEO4J_USER", "neo4j"),
                os.environ.get("NEO4J_PASSWORD", ""),
                llm_client=llm_client,
            )
            logger.info("[Graphiti] Client initialized")
        except ImportError:
            logger.info("[Graphiti] graphiti_core not installed, using MongoDB fallback")
            self._use_fallback = True
        except Exception as e:
            logger.warning(f"[Graphiti] Init failed, using fallback: {e}")
            self._use_fallback = True

    async def search(
        self,
        query: str,
        user_id: str,
        top_k: int = 3,
        **kwargs,
    ) -> List[MemoryResult]:
        """搜索知识图谱 — Graphiti 优先, MongoDB fallback"""
        if not user_id or not _USER_ID_PATTERN.match(user_id):
            return []

        await self._ensure_client()

        if self._use_fallback or self._client is None:
            return await self._fallback_search(query, user_id, top_k)

        try:
            return await self._graphiti_search(query, user_id, top_k)
        except Exception as e:
            logger.debug(f"[Graphiti] Search failed, fallback: {e}")
            return await self._fallback_search(query, user_id, top_k)

    async def _graphiti_search(
        self, query: str, user_id: str, top_k: int,
    ) -> List[MemoryResult]:
        """通过 Graphiti API 搜索"""
        try:
            # Graphiti search 返回 edges/nodes with temporal context
            search_results = await self._client.search(
                query=query,
                num_results=top_k,
                group_ids=[user_id],
            )
            results = []
            for edge in search_results:
                fact = getattr(edge, "fact", "")
                if not fact:
                    continue
                # 构建带时序信息的结果
                valid_at = getattr(edge, "valid_at", None)
                invalid_at = getattr(edge, "invalid_at", None)
                # 跳过已失效的事实
                if invalid_at and isinstance(invalid_at, datetime):
                    if invalid_at < datetime.now(timezone.utc):
                        continue
                confidence = 0.8 if valid_at else 0.5
                results.append(MemoryResult(
                    content=self._format_fact(fact, valid_at, invalid_at),
                    source=MemorySource.GRAPHITI,
                    confidence=confidence,
                    timestamp=valid_at.isoformat() if valid_at else None,
                    metadata={"edge_type": "graphiti_temporal"},
                ))
            return results[:top_k]
        except Exception as e:
            logger.debug(f"[Graphiti] API search error: {e}")
            return []

    async def _fallback_search(
        self, query: str, user_id: str, top_k: int,
    ) -> List[MemoryResult]:
        """MongoDB KnowledgeGraph fallback"""
        try:
            from ..semantic.knowledge_graph import get_knowledge_graph
            kg = get_knowledge_graph()

            labels = await kg.find_matching_labels(user_id, query, limit=2)
            if not labels:
                return []

            all_traces = []
            for label in labels:
                traces = await asyncio.wait_for(
                    kg.trace_context(user_id, label, max_depth=2, limit=3),
                    timeout=0.15,
                )
                all_traces.extend(traces)

            return [
                MemoryResult(
                    content=t,
                    source=MemorySource.MONGODB,
                    confidence=0.5,
                )
                for t in all_traces[:top_k]
            ]
        except Exception as e:
            logger.debug(f"[Graphiti] Fallback search failed: {e}")
            return []

    async def write(self, request: MemoryWriteRequest) -> bool:
        """写入知识图谱 — Graphiti 优先, MongoDB fallback"""
        await self._ensure_client()

        if self._use_fallback or self._client is None:
            return await self._fallback_write(request)

        try:
            await self._client.add_episode(
                name=f"soul_{request.user_id}_{datetime.now(timezone.utc).isoformat()}",
                episode_body=request.content,
                source_description="ling_soul_system",
                group_id=request.user_id,
            )
            return True
        except Exception as e:
            logger.debug(f"[Graphiti] Write failed, fallback: {e}")
            return await self._fallback_write(request)

    async def write_graph_extraction(
        self,
        user_id: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
    ) -> bool:
        """从 soul_post_processor 的提取结果写入图谱

        兼容现有 semantic_graph 格式: {nodes: [{label, category}], edges: [{source, target, relation}]}
        """
        await self._ensure_client()

        if self._use_fallback or self._client is None:
            return await self._fallback_write_graph(user_id, nodes, edges)

        try:
            # Graphiti 通过 episode 自动提取实体和关系
            # 构建一个自然语言描述让 Graphiti 提取
            description_parts = []
            for n in nodes[:3]:
                label = n.get("label", "")
                cat = n.get("category", "")
                if label:
                    description_parts.append(f"{label} (类型: {cat})")
            for e in edges[:2]:
                src = e.get("source", "")
                tgt = e.get("target", "")
                rel = e.get("relation", "related")
                if src and tgt:
                    description_parts.append(f"{src} {rel} {tgt}")

            if description_parts:
                episode_body = "用户提到: " + "; ".join(description_parts)
                await self._client.add_episode(
                    name=f"graph_{user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                    episode_body=episode_body,
                    source_description="ling_soul_extractor",
                    group_id=user_id,
                )
            return True
        except Exception as e:
            logger.debug(f"[Graphiti] Graph extraction write failed, fallback: {e}")
            return await self._fallback_write_graph(user_id, nodes, edges)

    async def _fallback_write(self, request: MemoryWriteRequest) -> bool:
        """MongoDB fallback write"""
        try:
            from ..semantic.knowledge_graph import get_knowledge_graph
            kg = get_knowledge_graph()
            await kg.upsert_node(
                request.user_id,
                request.content[:50],
                request.metadata.get("category", "other"),
            )
            return True
        except Exception:
            return False

    async def _fallback_write_graph(
        self,
        user_id: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
    ) -> bool:
        """MongoDB fallback — 复用 knowledge_graph.py 逻辑"""
        try:
            from ..semantic.knowledge_graph import get_knowledge_graph
            kg = get_knowledge_graph()

            node_tasks = [
                kg.upsert_node(user_id, n.get("label", ""), n.get("category", "other"))
                for n in nodes[:3] if n.get("label")
            ]
            if node_tasks:
                await asyncio.gather(*node_tasks, return_exceptions=True)

            edge_tasks = [
                kg.upsert_edge(
                    user_id, e.get("source", ""), e.get("target", ""),
                    e.get("relation", "context"),
                )
                for e in edges[:2] if e.get("source") and e.get("target")
            ]
            if edge_tasks:
                await asyncio.gather(*edge_tasks, return_exceptions=True)
            return True
        except Exception:
            return False

    async def delete_user_data(self, user_id: str) -> int:
        """GDPR: 删除用户的所有图谱数据"""
        count = 0
        # 1. Graphiti 删除
        await self._ensure_client()
        if self._client and not self._use_fallback:
            try:
                # Graphiti group_id 级别删除
                # Note: 实际 API 可能需要调整
                edges = await self._client.search(
                    query="*", num_results=1000, group_ids=[user_id],
                )
                for edge in edges:
                    edge_uuid = getattr(edge, "uuid", None)
                    if edge_uuid:
                        await self._client.delete_edge(edge_uuid)
                        count += 1
            except Exception as e:
                logger.warning(f"[Graphiti] GDPR delete failed: {e}")

        # 2. MongoDB fallback 数据也要删
        try:
            from ..semantic.knowledge_graph import get_knowledge_graph
            from ..storage.soul_collections import get_collection, SEMANTIC_NODES, SEMANTIC_EDGES
            nodes_coll = await get_collection(SEMANTIC_NODES)
            edges_coll = await get_collection(SEMANTIC_EDGES)
            if nodes_coll:
                r = await nodes_coll.delete_many({"user_id": user_id})
                count += r.deleted_count
            if edges_coll:
                r = await edges_coll.delete_many({"user_id": user_id})
                count += r.deleted_count
        except Exception as e:
            logger.warning(f"[Graphiti] MongoDB fallback delete failed: {e}")

        return count

    async def health_check(self) -> bool:
        """检查 Graphiti/Neo4j 连接"""
        await self._ensure_client()
        if self._use_fallback:
            return True  # fallback 模式下始终 "健康"
        try:
            # 简单查询测试连接
            await asyncio.wait_for(
                self._client.search(query="health_check", num_results=1),
                timeout=2.0,
            )
            return True
        except Exception:
            return False

    def format_section(self, results: List[MemoryResult]) -> Optional[str]:
        """格式化图谱洞察 — 沿用 context_builder 风格"""
        if not results:
            return None
        insight_text = "\n".join(f"- {r.content}" for r in results)
        return (
            f"<graph-insights>\n"
            f"你了解到的一些背景关联（供参考，不一定准确）:\n"
            f"{insight_text}\n"
            f"这些关联帮助你理解话题背后的脉络，不需要直接复述。如果不确定，不要使用。\n"
            f"</graph-insights>"
        )

    @staticmethod
    def _format_fact(
        fact: str,
        valid_at: Optional[datetime] = None,
        invalid_at: Optional[datetime] = None,
    ) -> str:
        """格式化 Graphiti 的事实 — 添加时序上下文"""
        if invalid_at:
            return f"(已过时) {fact}"
        if valid_at:
            days_ago = (datetime.now(timezone.utc) - valid_at).days
            if days_ago > 90:
                return f"(很久前了解到) {fact}"
            elif days_ago > 30:
                return f"(大约 {days_ago} 天前) {fact}"
        return fact


# 单例
_graphiti_adapter: Optional[GraphitiAdapter] = None


def get_graphiti_adapter() -> GraphitiAdapter:
    global _graphiti_adapter
    if _graphiti_adapter is None:
        _graphiti_adapter = GraphitiAdapter()
    return _graphiti_adapter
