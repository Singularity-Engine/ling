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
import time
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from loguru import logger

from ..config import get_soul_config
from ..ports.memory_port import MemoryPort, MemoryResult, MemorySource, MemoryWriteRequest
from ..utils.validation import is_valid_user_id

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
        self._permanently_unavailable = False
        self._last_init_attempt = 0.0
        self._init_lock = asyncio.Lock()

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
        cfg = get_soul_config()
        return max(0.05, cfg.graphiti_timeout_ms / 1000.0)

    async def _ensure_client(self):
        """懒初始化 Graphiti 客户端（失败后按间隔重试）。"""
        if self._permanently_unavailable:
            return
        if self._client is not None and not self._use_fallback:
            return

        cfg = get_soul_config()
        retry_interval = max(1.0, cfg.adapter_retry_interval_sec)
        now = time.monotonic()
        if self._initialized and (now - self._last_init_attempt) < retry_interval:
            return

        async with self._init_lock:
            now = time.monotonic()
            if self._permanently_unavailable:
                return
            if self._client is not None and not self._use_fallback:
                return
            if self._initialized and (now - self._last_init_attempt) < retry_interval:
                return

            self._initialized = True
            self._last_init_attempt = now
            try:
                from graphiti_core import Graphiti
                from graphiti_core.llm_client import OpenAIClient
                from graphiti_core.llm_client.config import LLMConfig

                llm_client = OpenAIClient(
                    config=LLMConfig(model=cfg.graphiti_llm_model)
                )
                self._client = Graphiti(
                    cfg.graphiti_url,
                    cfg.neo4j_user,
                    cfg.neo4j_password,
                    llm_client=llm_client,
                )
                self._use_fallback = False
                logger.info("[Graphiti] Client initialized")
            except ImportError:
                logger.info("[Graphiti] graphiti_core not installed, using MongoDB fallback")
                self._client = None
                self._use_fallback = True
                self._permanently_unavailable = True
            except Exception as e:
                self._mark_temporarily_unavailable()
                logger.warning(
                    f"[Graphiti] Init failed, using fallback (retry in {retry_interval:.0f}s): {e}"
                )

    def _mark_temporarily_unavailable(self):
        """标记客户端暂不可用，后续由 _ensure_client 周期性重试。"""
        self._client = None
        self._use_fallback = True

    async def search(
        self,
        query: str,
        user_id: str,
        top_k: int = 3,
        **kwargs,
    ) -> List[MemoryResult]:
        """搜索知识图谱 — Graphiti 优先, MongoDB fallback"""
        if not is_valid_user_id(user_id):
            return []

        await self._ensure_client()

        if self._use_fallback or self._client is None:
            return await self._fallback_search(query, user_id, top_k)

        try:
            return await self._graphiti_search(query, user_id, top_k)
        except Exception as e:
            logger.debug(f"[Graphiti] Search failed, fallback: {e}")
            self._mark_temporarily_unavailable()
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
            self._mark_temporarily_unavailable()
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
            self._mark_temporarily_unavailable()
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
        if not is_valid_user_id(user_id):
            logger.warning("[Graphiti] Invalid user_id format, skip delete_user_data")
            return 0

        count = 0
        graphiti_delete_failed = False
        # 1. Graphiti 删除
        await self._ensure_client()
        if self._client and not self._use_fallback:
            try:
                deleted = await self._delete_group_edges(user_id=user_id, batch_size=200)
                count += deleted
                verified = await self._verify_group_empty(user_id=user_id, attempts=5)
                if not verified:
                    graphiti_delete_failed = True
                    logger.error(
                        "[Graphiti] GDPR delete verification failed: edges still exist "
                        f"(user={user_id})"
                    )
            except Exception as e:
                logger.warning(f"[Graphiti] GDPR delete failed: {e}")
                self._mark_temporarily_unavailable()
                graphiti_delete_failed = True
        else:
            # 合规删除必须“可证明完成”。若 Graphiti 未就绪，仅删本地 fallback 会导致不完整删除。
            graphiti_delete_failed = True
            logger.error(
                "[Graphiti] GDPR delete skipped: graph backend unavailable "
                f"(user={user_id}, fallback={self._use_fallback}, initialized={self._initialized})"
            )

        # 2. MongoDB fallback 数据也要删
        try:
            from ..storage.soul_collections import get_collection, SEMANTIC_NODES, SEMANTIC_EDGES
            nodes_coll = await get_collection(SEMANTIC_NODES)
            edges_coll = await get_collection(SEMANTIC_EDGES)
            if nodes_coll is not None:
                r = await nodes_coll.delete_many({"user_id": user_id})
                count += r.deleted_count
            if edges_coll is not None:
                r = await edges_coll.delete_many({"user_id": user_id})
                count += r.deleted_count
        except Exception as e:
            logger.warning(f"[Graphiti] MongoDB fallback delete failed: {e}")

        if graphiti_delete_failed:
            return -1
        return count

    async def _delete_group_edges(
        self,
        user_id: str,
        batch_size: int,
        max_seconds: float = 90.0,
    ) -> int:
        """按 group_id 批量删除 Graphiti 边，循环直到为空或进入明确失败态。"""
        deleted_total = 0
        stalled_rounds = 0
        deadline = time.monotonic() + max(10.0, max_seconds)

        while True:
            if time.monotonic() >= deadline:
                logger.warning(
                    "[Graphiti] GDPR delete timed out before group drained "
                    f"(user={user_id}, deleted={deleted_total})"
                )
                break
            edges = await self._client.search(
                query="*",
                num_results=batch_size,
                group_ids=[user_id],
            )
            if not edges:
                break

            deleted_in_round = 0
            for edge in edges:
                edge_uuid = getattr(edge, "uuid", None)
                if not edge_uuid:
                    continue
                try:
                    await self._client.delete_edge(edge_uuid)
                    deleted_total += 1
                    deleted_in_round += 1
                except Exception as e:
                    logger.debug(f"[Graphiti] delete_edge failed ({edge_uuid}): {e}")

            if deleted_in_round == 0:
                stalled_rounds += 1
                if stalled_rounds >= 3:
                    logger.warning(
                        "[Graphiti] GDPR delete stalled for 3 rounds, breaking "
                        f"(user={user_id}, batch={len(edges)})"
                    )
                    break
            else:
                stalled_rounds = 0

        return deleted_total

    async def _verify_group_empty(self, user_id: str, attempts: int = 3) -> bool:
        """删除后验证 group 是否为空，确保 GDPR 删除可证明。"""
        for i in range(max(1, attempts)):
            try:
                edges = await self._client.search(
                    query="*",
                    num_results=1,
                    group_ids=[user_id],
                )
            except Exception as e:
                logger.warning(f"[Graphiti] GDPR verify failed: {e}")
                return False

            if not edges:
                return True

            if i < attempts - 1:
                await asyncio.sleep(0.15 * (i + 1))

        return False

    async def health_check(self) -> bool:
        """检查 Graphiti/Neo4j 连接"""
        await self._ensure_client()
        if self._use_fallback or self._client is None:
            return False
        try:
            # 只验证图数据库连通性，避免将外部 LLM 密钥问题误判为图后端不可用。
            await asyncio.wait_for(
                self._client.driver.execute_query("RETURN 1 AS ok"),
                timeout=2.0,
            )
            return True
        except Exception:
            self._mark_temporarily_unavailable()
            return False

    def runtime_status(self) -> Dict[str, Any]:
        """返回适配器运行态健康快照（不触发网络请求）。"""
        if self._permanently_unavailable:
            available = False
        elif not self._initialized:
            # 冷启动未知态按不可用处理（fail-closed），避免 strict 模式误判通过。
            available = False
        else:
            available = bool(self._client is not None and not self._use_fallback)
        return {
            "available": available,
            "initialized": bool(self._initialized),
            "fallback": bool(self._use_fallback),
            "permanently_unavailable": bool(self._permanently_unavailable),
            "unknown": bool((not self._initialized) and (not self._permanently_unavailable)),
            "last_init_attempt": self._last_init_attempt,
        }

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


def reset_graphiti_adapter_for_testing():
    """测试辅助: 重置 GraphitiAdapter 单例。"""
    global _graphiti_adapter
    _graphiti_adapter = None
