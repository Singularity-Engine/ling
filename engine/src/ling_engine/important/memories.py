import os
from datetime import datetime, timezone
import uuid
import time
import re
import math
import hashlib
import requests as _requests
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams
from .important import process_content
from .client.client import get_openai_client
from dotenv import load_dotenv
from difflib import SequenceMatcher
from loguru import logger

load_dotenv()

# OpenAI client (fallback only)
try:
    client = get_openai_client()
    logger.debug("记忆系统OpenAI客户端初始化成功")
except Exception as e:
    logger.warning(f"记忆系统OpenAI客户端初始化失败(非必需，Ollama为主力): {e}")
    client = None

# Ollama Embedding 配置 (主力)
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBEDDING_MODEL = os.environ.get("OLLAMA_EMBEDDING_MODEL", "qwen3-embedding:0.6b")
OLLAMA_EMBEDDING_DIMS = int(os.environ.get("OLLAMA_EMBEDDING_DIMS", "1024"))
OLLAMA_EMBEDDING_TIMEOUT = int(os.environ.get("OLLAMA_EMBEDDING_TIMEOUT", "30"))

# OpenAI配置 (fallback)
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

# Qdrant配置
QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant:6333")
COLLECTION_NAME = os.environ.get("COLLECTION_NAME", "openmemory")

_ollama_available = None  # None = untested, True/False = tested

# 向量维度取 Ollama 配置（主力）
OPENAI_EMBEDDING_MODEL_DIMS = OLLAMA_EMBEDDING_DIMS

# Qdrant client
try:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        client_qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False, timeout=60)
except Exception as e:
    logger.warning(f"初始化Qdrant客户端时出现警告/错误: {e}")
    client_qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False, timeout=60)


def init_db():
    try:
        if client_qdrant.collection_exists(collection_name=COLLECTION_NAME):
            client_qdrant.delete_collection(collection_name=COLLECTION_NAME)
        client_qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=OPENAI_EMBEDDING_MODEL_DIMS, distance=Distance.COSINE)
        )
        logger.info(f"成功创建或重新创建集合 {COLLECTION_NAME}")
    except Exception as e:
        logger.error(f"创建集合时出错: {str(e)}")


class Memory:
    def __init__(self, summary, importance_score, created_at, user_id="", updated_at=None, is_deleted=False):
        self.id = str(uuid.uuid4())
        self.embedding = None
        self.summary = summary
        self.created_at = created_at
        self.importance_score = importance_score
        self.user_id = user_id
        self.updated_at = updated_at if updated_at else created_at
        self.is_deleted = is_deleted


from ..utils.token_counter import token_stats, TokenCalculator, TokenUsage


def _ollama_embedding(content: str) -> list | None:
    """通过 Ollama 本地模型生成 embedding（主力方案，免费、快速、无 API key）。"""
    global _ollama_available
    try:
        resp = _requests.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": OLLAMA_EMBEDDING_MODEL, "input": content},
            timeout=OLLAMA_EMBEDDING_TIMEOUT,
        )
        resp.raise_for_status()
        embeddings = resp.json().get("embeddings", [])
        if embeddings and len(embeddings[0]) > 0:
            if _ollama_available is not True:
                logger.info(f"Ollama embedding 可用: model={OLLAMA_EMBEDDING_MODEL}, dims={len(embeddings[0])}")
                _ollama_available = True
            return embeddings[0]
        logger.warning("Ollama 返回空 embedding")
        return None
    except Exception as e:
        if _ollama_available is not False:
            logger.warning(f"Ollama embedding 不可用: {e}")
            _ollama_available = False
        return None


def _openai_embedding(content: str) -> list | None:
    """通过 OpenAI API 生成 embedding（备用方案）。"""
    if client is None:
        return None
    try:
        calculator = TokenCalculator(OPENAI_EMBEDDING_MODEL)
        input_tokens = calculator.count_tokens(content)

        response = client.embeddings.create(
            model=OPENAI_EMBEDDING_MODEL,
            input=content,
        )

        usage = TokenUsage(input_tokens, 0, input_tokens)
        cost_info = calculator.estimate_cost(usage)
        token_stats.add_usage(
            model=OPENAI_EMBEDDING_MODEL,
            usage=usage,
            cost=cost_info.total_cost,
            metadata={
                "service_type": "embedding",
                "model": OPENAI_EMBEDDING_MODEL,
                "content_length": len(content),
            },
        )
        logger.debug(
            f"[Token跟踪] 嵌入模型: {OPENAI_EMBEDDING_MODEL}, Token: {input_tokens}, "
            f"成本: ${cost_info.total_cost:.6f}"
        )
        return response.data[0].embedding
    except Exception as e:
        logger.warning(f"OpenAI embedding 失败: {type(e).__name__} - {str(e)[:200]}")
        return None


def create_embedding(content):
    """生成文本的嵌入向量。优先级: Ollama 本地 > OpenAI API。"""
    # 1. Ollama 本地（主力，免费）
    result = _ollama_embedding(content)
    if result is not None:
        return result

    # 2. OpenAI API（备用）
    result = _openai_embedding(content)
    if result is not None:
        return result

    logger.error("所有 embedding 方案均失败")
    return None


def save_memory(content, user_id=None):
    """保存重要内容到记忆系统（纯 Qdrant）"""

    if not user_id:
        try:
            from ..bff_integration.auth.user_context import UserContextManager
            user_id = UserContextManager.get_current_user_id()
            if not user_id:
                logger.error("❌ 记忆保存：无法获取用户ID，记忆保存失败")
                return False
            else:
                logger.debug(f"✅ 记忆保存：从用户上下文获取用户ID: {user_id}")
        except Exception as e:
            logger.error(f"❌ 记忆保存：获取用户上下文失败，记忆保存失败: {e}")
            return False

    if user_id == "default_user":
        logger.error("❌ 记忆保存：拒绝使用默认用户ID，这会导致用户间记忆混淆")
        return False

    logger.debug(f'保存记忆请求: 内容={content}, user_id={user_id}')
    is_important, summary, weight, triples = process_content(content)
    logger.debug(f'内容重要性判断: is_important={is_important}, summary={summary}, weight={weight}')

    if not is_important:
        return "内容不重要，不进行保存"

    embedding = create_embedding(summary)
    if embedding is None:
        logger.error('嵌入向量生成失败')
        return False

    # 根据三元组的唯一性设置不同的相似度阈值
    has_unique = triples and len(triples) > 0 and len(triples[0]) > 4 and triples[0][4]
    similarity_threshold = 0.75 if has_unique else 0.85
    logger.debug(f"使用相似度阈值: {similarity_threshold}")

    existing_memory = check_existing_memory(summary, user_id, embedding, similarity_threshold)
    if existing_memory:
        memory_id = existing_memory['id']
        now = datetime.now(timezone.utc).isoformat()
        logger.info(f'找到类似记忆: memory_id={memory_id}, 更新时间和权重')
        try:
            client_qdrant.set_payload(
                collection_name=COLLECTION_NAME,
                payload={
                    "summary": summary,
                    "weight": weight,
                    "updated_at": now,
                    "triples": triples,
                },
                points=[memory_id]
            )
            return True
        except Exception as e:
            logger.error(f"更新记忆时出错: {str(e)}")
            return False

    # 保存到 Qdrant
    try:
        now = datetime.now(timezone.utc).isoformat()
        memory_id = str(uuid.uuid4())
        logger.info(f'准备保存到 Qdrant: memory_id={memory_id}, summary={summary}')
        client_qdrant.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                {
                    "id": memory_id,
                    "vector": embedding,
                    "payload": {
                        "summary": summary,
                        "weight": weight,
                        "created_at": now,
                        "updated_at": now,
                        "user_id": user_id,
                        "is_deleted": False,
                        "triples": triples,
                    }
                }
            ]
        )
        return True
    except Exception as e:
        logger.error(f"保存到 Qdrant 时出错: {type(e).__name__} - {str(e)}")
        return False


def check_existing_memory(summary, user_id="default_user", embedding=None, text_similarity_threshold=0.80):
    """检查是否已存在类似内容的记忆"""
    try:
        search_result = client_qdrant.query_points(
            collection_name=COLLECTION_NAME,
            query=embedding,
            limit=1,
            with_payload=True,
            with_vectors=True,
            query_filter={
                "must": [
                    {"key": "is_deleted", "match": {"value": False}}
                ] + ([{"key": "user_id", "match": {"value": user_id}}] if user_id else [])
            }
        )

        for point in search_result.points:
            existing_summary = point.payload.get("summary", "")
            edit_similarity = calculate_text_similarity(summary, existing_summary)
            combined_similarity = 0.4 * edit_similarity + 0.6 * point.score
            logger.debug(f"相似度分数: {combined_similarity}")
            if combined_similarity > text_similarity_threshold:
                logger.info(f"找到相似的记忆: id={point.id}, score={point.score}, summary={existing_summary}")
                return {
                    "id": point.id,
                    "summary": existing_summary,
                    "user_id": point.payload.get("user_id", ""),
                    "created_at": point.payload.get("created_at", ""),
                    "weight": point.payload.get("weight", 5)
                }
        return None
    except Exception as e:
        logger.error(f"检查现有记忆时出错: {str(e)}")
        return None


def calculate_text_similarity(text1, text2):
    """计算两个文本的相似度"""
    if not text1 or not text2:
        return 0.0
    return SequenceMatcher(None, text1, text2).ratio()


def search_similar_memories(query, user_id=None, limit=5):
    """搜索相似的记忆（纯 Qdrant）"""

    if not user_id:
        try:
            from ..bff_integration.auth.user_context import UserContextManager
            user_id = UserContextManager.get_current_user_id()
            if not user_id:
                logger.error("❌ 记忆搜索：无法获取用户ID，返回空结果")
                return []
            else:
                logger.debug(f"✅ 记忆搜索：从用户上下文获取用户ID: {user_id}")
        except Exception as e:
            logger.error(f"❌ 记忆搜索：获取用户上下文失败，返回空结果: {e}")
            return []

    if user_id == "default_user":
        logger.error("❌ 记忆搜索：拒绝使用默认用户ID，这会导致用户间记忆混淆")
        return []

    logger.debug(f"搜索记忆: 查询='{query[:50]}...' 用户ID={user_id} 限制={limit}")

    try:
        if client is None or client_qdrant is None:
            logger.warning("记忆系统客户端未初始化，返回空结果")
            return []

        query_embedding = create_embedding(query)
        if query_embedding is None:
            logger.warning("无法为查询创建嵌入向量，返回空结果")
            return []

        limit = int(limit)

        try:
            search_result = client_qdrant.query_points(
                collection_name=COLLECTION_NAME,
                query=query_embedding,
                limit=limit,
                with_payload=True,
                query_filter={
                    "must": [
                        {"key": "is_deleted", "match": {"value": False}}
                    ] + ([{"key": "user_id", "match": {"value": user_id}}] if user_id else [])
                }
            )
        except Exception as e:
            logger.error(f"Qdrant查询出错: {str(e)}")
            return []

        results = []
        for point in search_result.points:
            results.append({
                'id': point.id,
                'summary': point.payload.get("summary", ""),
                'user_id': point.payload.get("user_id", ""),
                'created_at': point.payload.get("created_at", ""),
                'updated_at': point.payload.get("updated_at", point.payload.get("created_at", "")),
                'weight': point.payload.get("weight", 5),
                'triples': point.payload.get('triples', []),
                'score': getattr(point, 'score', 0.0),
            })

        # 综合排序
        results.sort(
            key=lambda x: calculate_combined_score(
                x['created_at'] if x['created_at'] else "",
                x.get('weight', 5),
                x.get('score', 0.0),
            ),
            reverse=True
        )

        final_results = results[:limit]
        return [(item['id'], item['summary'], item['user_id'], item['created_at'],
                 item['updated_at'], item.get('triples', [])) for item in final_results]

    except Exception as e:
        logger.error(f"搜索记忆时出错: {str(e)}")
        return []


def calculate_combined_score(created_at, weight, vector_score):
    """根据时间、权重、向量相关性分数计算综合分数"""
    try:
        if created_at:
            created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            time_diff = (datetime.now(timezone.utc) - created_time).total_seconds()
            time_factor = max(0.0, 1 - time_diff / (365 * 24 * 60 * 60))
        else:
            time_factor = 0

        weight_factor = weight / 10.0
        vector_factor = vector_score if vector_score else 0.5

        # 综合分数：时间 20% + 权重 40% + 向量相关性 40%
        score = (0.20 * time_factor) + (0.40 * weight_factor) + (0.40 * vector_factor)
        return score
    except Exception as e:
        logger.error(f"计算综合分数时出错: {str(e)}")
        return 0.5


def delete_memory(memory_id, user_id="default_user"):
    """删除指定的记忆（逻辑删除）"""
    logger.info(f"尝试删除记忆ID: {memory_id}，用户ID: {user_id}")
    try:
        memory_details = client_qdrant.retrieve(
            collection_name=COLLECTION_NAME,
            ids=[memory_id],
            with_payload=True
        )
        if memory_details:
            retrieved_user_id = memory_details[0].payload.get("user_id", "")
            if retrieved_user_id != user_id:
                logger.error(f"权限错误：用户 {user_id} 无权删除记忆 {memory_id}，该记忆属于用户 {retrieved_user_id}")
                return False
        else:
            logger.warning(f"未找到ID为 {memory_id} 的记忆")
            return False

        client_qdrant.set_payload(
            collection_name=COLLECTION_NAME,
            payload={
                "is_deleted": True,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            points=[memory_id]
        )
        logger.info(f"成功标记删除记忆 {memory_id}")
        return True
    except Exception as e:
        logger.error(f"删除记忆时出错: {str(e)}")
        return False


def list_all_memories_simple(user_id="default_user", limit=100):
    """简化版列出所有记忆"""
    try:
        response = client_qdrant.scroll(
            collection_name=COLLECTION_NAME,
            limit=limit * 2,
            with_payload=True,
            scroll_filter={
                "must": [
                    {"key": "is_deleted", "match": {"value": False}}
                ] + ([{"key": "user_id", "match": {"value": user_id}}] if user_id else [])
            }
        )

        points, next_page = response
        logger.info(f"总共找到 {len(points)} 个记忆")

        results = []
        for point in points:
            results.append({
                "id": point.id,
                "content": point.payload.get("content", ""),
                "summary": point.payload.get("summary", ""),
                "user_id": point.payload.get("user_id", ""),
                "created_at": point.payload.get("created_at", ""),
                "weight": point.payload.get("weight", 5)
            })

        return results[:int(limit)]
    except Exception as e:
        logger.error(f"列出记忆时出错: {str(e)}")
        return []
