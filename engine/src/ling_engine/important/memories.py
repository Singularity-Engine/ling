import os
from datetime import datetime, timezone
import uuid
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams
from .important import process_content
# 使用统一的OpenAI客户端
from .client.client import get_openai_client
from dotenv import load_dotenv
# 使用简单的编辑距离算法计算相似度
from difflib import SequenceMatcher
# 导入 Neo4j 相关库
from neo4j import GraphDatabase
# 导入日志模块
from loguru import logger

load_dotenv()

# 使用统一的OpenAI客户端
try:
    client = get_openai_client()
    logger.debug("记忆系统OpenAI客户端初始化成功")
except Exception as e:
    logger.error(f"记忆系统OpenAI客户端初始化失败: {e}")
    client = None
# OpenAI配置
OPENAI_MODEL = os.environ.get(
    "OPENAI_MODEL", "gpt-4o-mini"
)
OPENAI_EMBEDDING_MODEL = os.environ.get(
    "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
)
OPENAI_EMBEDDING_MODEL_DIMS = int(os.environ.get(
    "OPENAI_EMBEDDING_MODEL_DIMS", 1536
))
# 数据库配置
QDRANT_URL = os.environ.get(
    "QDRANT_URL", "http://qdrant:6333"
)
COLLECTION_NAME = os.environ.get(
    "COLLECTION_NAME", "openmemory"
)
# Neo4j 配置
NEO4J_URI = os.environ.get(
    "NEO4J_URI", "bolt://neo4j:7687"
)
NEO4J_USERNAME = os.environ.get(
    "NEO4J_USERNAME", "neo4j"
)
NEO4J_PASSWORD = os.environ.get(
    "NEO4J_PASSWORD", "12345678"
                      ""
)
# 数据库配置
try:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        client_qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False, timeout=60)
except Exception as e:
    logger.warning(f"初始化Qdrant客户端时出现警告/错误: {e}")
    client_qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False, timeout=60)
# Neo4j 驱动
neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))


# 初始化 Qdrant 集合
def init_db():
    try:
        if client_qdrant.collection_exists(collection_name=COLLECTION_NAME):
            client_qdrant.delete_collection(collection_name=COLLECTION_NAME)
        client_qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=OPENAI_EMBEDDING_MODEL_DIMS, distance=Distance.COSINE)
        )
        logger.info(f"成功创建或重新创建集合 {COLLECTION_NAME}")
        # 初始化 Neo4j 向量索引
    except Exception as e:
        logger.error(f"创建集合时出错: {str(e)}")


class Memory:
    def __init__(self, summary, importance_score, created_at, user_id="", updated_at=None, is_deleted=False):
        self.id = str(uuid.uuid4())
        self.embedding = None  # Placeholder, will be set later
        self.summary = summary
        self.created_at = created_at
        self.importance_score = importance_score
        self.user_id = user_id
        self.updated_at = updated_at if updated_at else created_at
        self.is_deleted = is_deleted


from ..utils.token_counter import token_stats, TokenCalculator, TokenUsage

def create_embedding(content):
    """生成文本的嵌入向量"""
    try:
        # 计算token使用量
        calculator = TokenCalculator(OPENAI_EMBEDDING_MODEL)
        input_tokens = calculator.count_tokens(content)
        
        # 调用API
        response = client.embeddings.create(
            model=OPENAI_EMBEDDING_MODEL,
            input=content
        )
        
        # 记录token使用情况
        usage = TokenUsage(input_tokens, 0, input_tokens)
        cost_info = calculator.estimate_cost(usage)
        
        # 添加到统计
        token_stats.add_usage(
            model=OPENAI_EMBEDDING_MODEL,
            usage=usage,
            cost=cost_info.total_cost,
            metadata={
                "service_type": "embedding",
                "model": OPENAI_EMBEDDING_MODEL,
                "content_length": len(content)
            }
        )
        
        # 使用logger记录嵌入向量的token使用情况，而不是直接打印
        logger.debug(f"[Token跟踪] 嵌入模型: {OPENAI_EMBEDDING_MODEL}, Token: {input_tokens}, " +
                   f"成本: ${cost_info.total_cost:.6f}")
        
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"生成嵌入向量时出错: {type(e).__name__} - {str(e)}")
        return None


def save_hierarchical_triples_to_neo4j(triples, memory_id, user_id=None):
    """
    将提取的三元组存储到 Neo4j 图数据库中，构建层级结构
    插入时传入: 主语(subject) 谓语(predicate) 标签(category) 宾语(object)
    根据唯一性标记处理保存逻辑，如果是唯一属性则检查是否存在重复项
    """
    try:
        with neo4j_driver.session() as session:
            for triple in triples:
                # 确保三元组有足够的元素
                if len(triple) < 3:
                    logger.warning(f"跳过无效三元组: {triple}")
                    continue
                subject, predicate, obj = triple[0], triple[1], triple[2]
                # 获取类别标签，如果存在
                category = triple[3] if len(triple) > 3 else "其他"
                # 获取唯一性标记，如果存在
                is_unique = triple[4] if len(triple) > 4 else False
                if not subject or not predicate or not obj:
                    logger.warning(f"跳过无效三元组: {(subject, predicate, obj)}")
                    continue

                if is_unique:
                    # 检查是否已存在该唯一属性的记录
                    check_query = """
                        MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object)
                        WHERE EXISTS((:Memory {user_id: $user_id})-[:CONTAINS]->(o))
                        RETURN o.name AS existing_obj
                    """
                    result = session.run(check_query, subject=subject, predicate=predicate, user_id=user_id).single()
                    now = datetime.now(timezone.utc).isoformat()
                    if result:
                        existing_obj = result['existing_obj']
                        if existing_obj != obj:
                            # 如果值不同，标记旧记录为删除并创建新记录
                            update_query = """
                                MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object {name: $existing_obj})
                                SET o.is_deleted = true, o.updated_at = $now
                                MERGE (new_o:Object {name: $new_obj})
                                SET new_o.created_at = $now, new_o.is_deleted = false
                                MERGE (c)-[:HAS_OBJECT]->(new_o)
                                MERGE (m:Memory {id: $memory_id, user_id: $user_id})
                                MERGE (m)-[:CONTAINS]->(new_o)
                            """
                            session.run(update_query, subject=subject, predicate=predicate, existing_obj=existing_obj,
                                        new_obj=obj, memory_id=memory_id, user_id=user_id, now=now)
                            logger.debug(f"更新唯一属性 {predicate}: 从 {existing_obj} 到 {obj} for memory {memory_id}")
                        else:
                            # 如果值相同，关联到现有对象
                            link_query = """
                                MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object {name: $obj})
                                MERGE (m:Memory {id: $memory_id, user_id: $user_id})
                                MERGE (m)-[:CONTAINS]->(o)
                            """
                            session.run(link_query, subject=subject, predicate=predicate, obj=obj, memory_id=memory_id,
                                        user_id=user_id)
                            logger.debug(f"关联到现有唯一属性 {predicate}: {obj} for memory {memory_id}")
                        continue

                # 构建层级化图结构: Subject -> Predicate -> Category -> Object
                # 如果没有已存在的主语就创建，没有对应的谓语就创建
                query = """
                    MERGE (s:Subject {name: $subject})
                    MERGE (s)-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})
                    MERGE (p)-[:HAS_CATEGORY]->(c:Category {name: $category})
                    MERGE (c)-[:HAS_OBJECT]->(o:Object {name: $obj})
                    MERGE (m:Memory {id: $memory_id, user_id: $user_id})
                    MERGE (m)-[:CONTAINS]->(o)
                """
                session.run(query,
                            subject=subject,
                            predicate=predicate,
                            obj=obj,
                            category=category,
                            memory_id=memory_id,
                            user_id=user_id)

        logger.info(f"成功保存层级化三元组到 Neo4j for memory {memory_id}")
    except Exception as e:
        logger.error(f"保存层级化三元组到 Neo4j 时出错: {str(e)}")


def save_memory(content, user_id=None):
    """保存重要内容到记忆系统"""
    
    # 如果没有提供user_id，尝试从用户上下文获取
    if not user_id:
        try:
            from ..bff_integration.auth.user_context import UserContextManager
            user_id = UserContextManager.get_current_user_id()
            if not user_id:
                logger.error("❌ 记忆保存：无法获取用户ID，记忆保存失败")
                return False  # 不保存没有用户ID的记忆
            else:
                logger.debug(f"✅ 记忆保存：从用户上下文获取用户ID: {user_id}")
        except Exception as e:
            logger.error(f"❌ 记忆保存：获取用户上下文失败，记忆保存失败: {e}")
            return False  # 不保存没有用户ID的记忆
    
    # 验证用户ID不能是默认值
    if user_id == "default_user":
        logger.error("❌ 记忆保存：拒绝使用默认用户ID，这会导致用户间记忆混淆")
        return False
    
    logger.debug(f'保存记忆请求: 内容={content}, user_id={user_id}')
    # 使用现有的重要性判断
    is_important, summary, weight, triples = process_content(content)
    logger.debug(f'内容重要性判断: is_important={is_important}, summary={summary}, weight={weight}, triples={triples}')

    if not is_important:
        return "内容不重要，不进行保存"

    # 生成嵌入向量
    embedding = create_embedding(summary)
    logger.debug(f'嵌入向量生成: embedding={embedding[:10]}...') if embedding else logger.error('嵌入向量生成失败')
    if embedding is None:
        return False
    # 获取唯一性标记，如果存在
    logger.debug(triples[0][4] if triples and len(triples) > 0 and len(triples[0]) > 4 else "无唯一性标记")
    # 根据三元组的唯一性设置不同的相似度阈值
    similarity_threshold = 0.75 if triples and len(triples) > 0 and len(triples[0]) > 4 and triples[0][4] else 0.85
    logger.debug(f"使用相似度阈值: {similarity_threshold}，因为{'存在' if triples and len(triples) > 0 and len(triples[0]) > 4 and triples[0][4] else '不存在'}唯一性三元组")
    # 检查是否已存在类似记忆
    existing_memory = check_existing_memory(summary, user_id, embedding, similarity_threshold)
    if existing_memory:
        memory_id = existing_memory['id']
        now = datetime.now(timezone.utc).isoformat()
        logger.info(f'找到类似记忆: memory_id={memory_id}, 更新时间和权重')
        # 更新现有记忆的时间和权重
        try:
            client_qdrant.set_payload(
                collection_name=COLLECTION_NAME,
                payload={
                    "summary": summary,
                    "weight": weight,
                    "updated_at": now
                },
                points=[memory_id]
            )
            # 检查并保存非重复的三元组
            save_unique_triples(triples, memory_id)
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
                        "triples": triples  # 保存三元组到 Qdrant
                    }
                }
            ]
        )

        # 同时保存到 Neo4j，构建层级化结构
        save_hierarchical_triples_to_neo4j(triples, memory_id, user_id)
        return True
    except Exception as e:
        logger.error(f"保存到 Qdrant 时出错: {type(e).__name__} - {str(e)}")
        return False


def save_unique_triples(triples, memory_id):
    """检查并保存非重复的三元组"""
    try:
        with neo4j_driver.session() as session:
            # 从 Qdrant 获取 user_id
            memory_details = client_qdrant.retrieve(
                collection_name=COLLECTION_NAME,
                ids=[memory_id],
                with_payload=True
            )
            user_id = memory_details[0].payload.get("user_id", "") if memory_details else ""

            for triple in triples:
                if len(triple) < 3:
                    continue
                head, rel, tail = triple[0], triple[1], triple[2]
                logger.debug(f"三元组: {head}, {rel}, {tail}")
                if not head or not tail:
                    continue
                # 检查是否已存在相同三元组
                check_query = """
                    MATCH (s:Subject {name: $head})-[:HAS_PREDICATE {name: $rel}]->(p:Predicate {name: $rel})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object {name: $tail})
                    WHERE EXISTS((:Memory {id: $memory_id})-[:CONTAINS]->(o))
                    RETURN COUNT(*) AS count
                """
                result = session.run(check_query, head=head, rel=rel, tail=tail, memory_id=memory_id).single()
                count = result['count'] if result else 0
                if count == 0:
                    # 获取唯一性标记，如果存在
                    is_unique = triple[4] if len(triple) > 4 else False
                    now = datetime.now(timezone.utc).isoformat()

                    if is_unique:
                        # 检查是否已存在该唯一属性的记录
                        unique_check_query = """
                            MATCH (s:Subject {name: $head})-[:HAS_PREDICATE {name: $rel}]->(p:Predicate {name: $rel})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object)
                            WHERE EXISTS((:Memory {user_id: $user_id})-[:CONTAINS]->(o))
                            RETURN o.name AS existing_obj
                        """
                        unique_result = session.run(unique_check_query, head=head, rel=rel, user_id=user_id).single()
                        if unique_result:
                            existing_obj = unique_result['existing_obj']
                            if existing_obj != tail:
                                # 如果值不同，标记旧记录为删除并创建新记录
                                update_query = """
                                    MATCH (s:Subject {name: $head})-[:HAS_PREDICATE {name: $rel}]->(p:Predicate {name: $rel})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object {name: $existing_obj})
                                    SET o.is_deleted = true, o.updated_at = $now
                                    MERGE (new_o:Object {name: $new_obj})
                                    SET new_o.created_at = $now, new_o.is_deleted = false
                                    MERGE (c)-[:HAS_OBJECT]->(new_o)
                                    MERGE (m:Memory {id: $memory_id, user_id: $user_id})
                                    MERGE (m)-[:CONTAINS]->(new_o)
                                """
                                session.run(update_query, head=head, rel=rel, existing_obj=existing_obj, new_obj=tail,
                                            memory_id=memory_id, user_id=user_id, now=now)
                                logger.debug(f"更新唯一属性 {rel}: 从 {existing_obj} 到 {tail} for memory {memory_id}")
                            else:
                                # 如果值相同，关联到现有对象
                                link_query = """
                                    MATCH (s:Subject {name: $head})-[:HAS_PREDICATE {name: $rel}]->(p:Predicate {name: $rel})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object {name: $tail})
                                    MERGE (m:Memory {id: $memory_id, user_id: $user_id})
                                    MERGE (m)-[:CONTAINS]->(o)
                                """
                                session.run(link_query, head=head, rel=rel, tail=tail, memory_id=memory_id,
                                            user_id=user_id)
                                logger.debug(f"关联到现有唯一属性 {rel}: {tail} for memory {memory_id}")
                            continue

                    # 如果不存在，保存三元组
                    save_query = """
                        MERGE (s:Subject {name: $head})
                        MERGE (s)-[:HAS_PREDICATE {name: $rel}]->(p:Predicate {name: $rel})
                        MERGE (p)-[:HAS_CATEGORY]->(c:Category {name: $category})
                        MERGE (c)-[:HAS_OBJECT]->(o:Object {name: $tail})
                        MERGE (m:Memory {id: $memory_id, user_id: $user_id})
                        MERGE (m)-[:CONTAINS]->(o)
                    """
                    category = triple[3] if len(triple) > 3 else "其他"
                    session.run(save_query, head=head, rel=rel, tail=tail, category=category, memory_id=memory_id,
                                user_id=user_id)
                    logger.debug(f"保存新三元组: ({head}, {rel}, {tail}) for memory {memory_id}")
                else:
                    logger.debug(f"跳过已存在三元组: ({head}, {rel}, {tail}) for memory {memory_id}")
    except Exception as e:
        logger.error(f"保存唯一三元组时出错: {str(e)}")


def check_existing_memory(summary, user_id="default_user", embedding=None, text_similarity_threshold=0.80):
    """检查是否已存在类似内容的记忆"""
    try:
        search_result = client_qdrant.query_points(
            collection_name=COLLECTION_NAME,
            query=embedding,
            limit=1,  # 检查前1个最相似的结果
            with_payload=True,
            with_vectors=True,
            query_filter={
                "must": [
                            {"key": "is_deleted", "match": {"value": False}}
                        ] + ([{"key": "user_id", "match": {"value": user_id}}] if user_id else [])
            }
        )

        for point in search_result.points:
            # 综合相似度：编辑距离占40%，向量相似度（point.score）占60%
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
    # 使用简单的编辑距离算法计算相似度
    edit_similarity = SequenceMatcher(None, text1, text2).ratio()
    return edit_similarity


def search_similar_memories(query, user_id=None, limit=5):
    """搜索相似的记忆 - 按比例分配Qdrant和Neo4j结果"""
    
    # 如果没有提供user_id，尝试从用户上下文获取
    if not user_id:
        try:
            from ..bff_integration.auth.user_context import UserContextManager
            user_id = UserContextManager.get_current_user_id()
            if not user_id:
                logger.error("❌ 记忆搜索：无法获取用户ID，返回空结果")
                return []  # 返回空结果而不是使用默认用户ID
            else:
                logger.debug(f"✅ 记忆搜索：从用户上下文获取用户ID: {user_id}")
        except Exception as e:
            logger.error(f"❌ 记忆搜索：获取用户上下文失败，返回空结果: {e}")
            return []  # 返回空结果而不是使用默认用户ID
    
    # 验证用户ID不能是默认值
    if user_id == "default_user":
        logger.error("❌ 记忆搜索：拒绝使用默认用户ID，这会导致用户间记忆混淆")
        return []
    
    # 调试信息，使用logger.debug而不是print
    logger.debug(f"搜索记忆: 查询='{query[:50]}...' 用户ID={user_id} 限制={limit}")

    
    try:
        # 检查客户端是否可用
        if client is None or client_qdrant is None:
            logger.warning("记忆系统客户端未初始化，返回空结果")
            return []
            
        query_embedding = create_embedding(query)
        if query_embedding is None:
            logger.warning("无法为查询创建嵌入向量，返回空结果")
            return []

        # 计算按比例分配的数量
        limit = int(limit)
        qdrant_limit = max(1, int(limit * 0.6))  # Qdrant占60%
        neo4j_limit = max(1, int(limit * 0.4))  # Neo4j占40%

        try:
            # Qdrant查询
            search_result = client_qdrant.query_points(
                collection_name=COLLECTION_NAME,
                query=query_embedding,
                limit=qdrant_limit,
                with_payload=True,
                query_filter={
                    "must": [
                                {"key": "is_deleted", "match": {"value": False}}
                            ] + ([{"key": "user_id", "match": {"value": user_id}}] if user_id else [])
                }
            )
        except Exception as e:
            logger.error(f"Qdrant查询出错: {str(e)}")
            # 如果Qdrant查询失败，返回空结果
            return []

        # 处理Qdrant结果
        qdrant_results = []
        for point in search_result.points:
            qdrant_results.append({
                'id': point.id,
                'summary': point.payload.get("summary", ""),
                'user_id': point.payload.get("user_id", ""),
                'created_at': point.payload.get("created_at", ""),
                'updated_at': point.payload.get("updated_at", point.payload.get("created_at", "")),
                'weight': point.payload.get("weight", 5),
                'triples': point.payload.get('triples', []),
                'score': getattr(point, 'score', 0.0),
                'source': 'qdrant'  # 标记来源
            })

        # 如果Qdrant结果已满足需求，直接返回
        if len(qdrant_results) >= qdrant_limit and qdrant_limit >= limit:
            qdrant_results.sort(
                key=lambda x: calculate_combined_score(
                    x['created_at'] if x['created_at'] else "",
                    x.get('weight', 5),
                    x.get('score', 0.0),
                    len(x.get('triples', []))
                ),
                reverse=True
            )

            final_results = qdrant_results[:limit]
            return [(item['id'], item['summary'], item['user_id'], item['created_at'],
                     item['updated_at'], item.get('triples', [])) for item in final_results]

        # Neo4j补充查询
        neo4j_results = []
        if len(qdrant_results) < limit or len(qdrant_results) < qdrant_limit:
            try:
                # 收集Qdrant结果中的三元组用于Neo4j查询
                queried_pairs = set()
                total_triples_checked = 0
                max_triples_to_check = min(15, qdrant_limit * 3)  # 限制检查的三元组数量

                # 优先使用Qdrant结果中的三元组进行查询
                for result in qdrant_results:
                    if total_triples_checked >= max_triples_to_check or len(neo4j_results) >= neo4j_limit:
                        break

                    triples = result.get('triples', [])
                    for triple in triples[:3]:  # 每个记忆只取前3个三元组
                        if total_triples_checked >= max_triples_to_check or len(neo4j_results) >= neo4j_limit:
                            break

                        if len(triple) >= 3:
                            subject, predicate, _ = triple[:3]
                            pair_key = (subject, predicate)
                            if pair_key not in queried_pairs and subject and predicate:
                                queried_pairs.add(pair_key)
                                total_triples_checked += 1

                                # 查询Neo4j，限制返回结果数量
                                category = triple[3] if len(triple) > 3 else None
                                triple_query_results = query_knowledge_triple(
                                    subject=subject, predicate=predicate, category=category,
                                    user_id=result.get('user_id', 'chen')
                                )
                                logger.debug(f"Neo4j查询结果: {triple_query_results}")

                                for tqr in triple_query_results:
                                    memory_id = tqr.get('id', '')
                                    # 检查是否已存在（避免与Qdrant结果重复）
                                    existing_ids = {r['id'] for r in qdrant_results}
                                    if memory_id and memory_id not in existing_ids and not any(
                                            r['id'] == memory_id for r in neo4j_results):
                                        neo4j_results.append({
                                            'id': memory_id,
                                            'summary': tqr.get('summary', ''),
                                            'user_id': tqr.get('user_id', ''),
                                            'created_at': tqr.get('created_at', ''),
                                            'updated_at': tqr.get('updated_at', ''),
                                            'weight': tqr.get('weight', 5),
                                            'triples': tqr.get('triples', []),
                                            'score': tqr.get('score', 0.0),
                                            'source': 'neo4j'  # 标记来源
                                        })

                                        if len(neo4j_results) >= neo4j_limit:
                                            break

                            if len(neo4j_results) >= neo4j_limit:
                                break

                    if len(neo4j_results) >= neo4j_limit:
                        break

            except Exception as neo4j_error:
                logger.error(f"连接 Neo4j 进行搜索时出错: {str(neo4j_error)}")

        # 按比例截取最终结果
        # Qdrant结果取前qdrant_limit个（或全部）
        final_qdrant_results = qdrant_results[:qdrant_limit]
        # Neo4j结果取前neo4j_limit个（或全部）
        final_neo4j_results = neo4j_results[:neo4j_limit]

        # 合并所有结果
        all_results = final_qdrant_results + final_neo4j_results

        # 综合排序
        all_results.sort(
            key=lambda x: calculate_combined_score(
                x['created_at'] if x['created_at'] else "",
                x.get('weight', 5),
                x.get('score', 0.0),
                len(x.get('triples', []))
            ),
            reverse=True
        )

        # 最终截取limit数量的结果
        final_results = all_results[:limit]
        return [(item['id'], item['summary'], item['user_id'], item['created_at'],
                 item['updated_at'], item.get('triples', [])) for item in final_results]

    except Exception as e:
        logger.error(f"搜索记忆时出错: {str(e)}")
        import traceback
        traceback.print_exc()
        # 捕获所有异常，确保返回空列表而不是抛出错误
        return []


def calculate_combined_score(created_at, weight, vector_score, triple_count):
    """根据时间、权重、向量相关性分数和三元组数量计算综合分数"""
    try:
        # 解析时间字符串
        if created_at:
            created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            time_diff = (datetime.now(timezone.utc) - created_time).total_seconds()
            # 时间衰减因子，越新的记忆分数越高
            time_factor = max(0.0, 1 - time_diff / (365 * 24 * 60 * 60))  # 一年内线性衰减到0
        else:
            time_factor = 0

        # 权重因子，权重越高分数越高
        weight_factor = weight / 10.0  # 权重范围1-10，转换为0.1-1.0

        # 向量相关性分数
        vector_factor = vector_score if vector_score else 0.5

        # 三元组数量因子，越多三元组越相关
        triple_factor = min(triple_count / 5.0, 1.0)  # 最多5个三元组达到最大值

        # 综合分数：时间因子占15%，权重因子占35%，向量相关性占25%，三元组数量占25%
        score = (0.15 * time_factor) + (0.35 * weight_factor) + (0.25 * vector_factor) + (0.25 * triple_factor)
        return score
    except Exception as e:
        logger.error(f"计算综合分数时出错: {str(e)}")
        return 0.5  # 默认分数


def delete_memory(memory_id, user_id="default_user"):
    """删除指定的记忆（逻辑删除，通过更新is_deleted字段）"""
    logger.info(f"尝试删除记忆ID: {memory_id}，用户ID: {user_id}")
    try:
        # 先获取记忆详情以确认ID是否正确并验证用户ID
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
            logger.debug(f"找到记忆: {memory_details[0].payload}")
        else:
            logger.warning(f"未找到ID为 {memory_id} 的记忆")
            return False

        # 逻辑删除，更新is_deleted字段
        client_qdrant.set_payload(
            collection_name=COLLECTION_NAME,
            payload={
                "is_deleted": True,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            points=[memory_id]
        )
        logger.info(f"成功标记删除记忆 {memory_id}")

        # 在 Neo4j 中也标记删除
        try:
            with neo4j_driver.session() as session:
                delete_query = """
                    MATCH (m:Memory {id: $memory_id, user_id: $user_id})-[:CONTAINS]->(o:Object)
                    OPTIONAL MATCH (c:Category)-[:HAS_OBJECT]->(o)
                    OPTIONAL MATCH (p:Predicate)-[:HAS_CATEGORY]->(c)
                    DETACH DELETE o, c, p, m
                """
                session.run(delete_query, memory_id=memory_id, user_id=user_id)
                logger.info(f"在 Neo4j 中成功删除记忆 {memory_id} 及其相关节点")
        except Exception as neo4j_error:
            logger.error(f"在 Neo4j 中标记删除时出错: {str(neo4j_error)}")

        return True
    except Exception as e:
        logger.error(f"删除记忆时出错: {str(e)}")
        logger.error(f"错误详情: {e.__dict__}")
        if hasattr(e, 'response'):
            logger.error(f"响应内容: {e.response.content}")
        return False


def list_all_memories_simple(user_id="default_user", limit=100):
    """简化版列出所有记忆"""
    try:
        # 使用 scroll 方法获取所有记录
        response = client_qdrant.scroll(
            collection_name=COLLECTION_NAME,
            limit=limit * 2,  # 获取更多结果以便排序
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
        for i, point in enumerate(points):
            content = point.payload.get("content", "")
            summary = point.payload.get("summary", "")
            user_id_val = point.payload.get("user_id", "")
            created_at = point.payload.get("created_at", "")
            weight = point.payload.get("weight", 5)

            results.append({
                "id": point.id,
                "content": content,
                "summary": summary,
                "user_id": user_id_val,
                "created_at": created_at,
                "weight": weight
            })

        # 限制返回结果数量
        results = results[:int(limit)]
        return results
    except Exception as e:
        logger.error(f"列出记忆时出错: {str(e)}")
        import traceback
        traceback.print_exc()
        return []


def search_user_preferences(user_id="default_user", predicate=None, category=None, limit=10):
    """
    查询用户的偏好信息，基于层级化图结构
    搜索时传入: 主语(subject) 谓语(predicate) 标签(category)
    """
    try:
        with neo4j_driver.session() as session:
            # 构建动态查询条件
            if predicate and category:
                query = """
                    MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})-[:HAS_CATEGORY]->(c:Category {name: $category})-[:HAS_OBJECT]->(o:Object)
                    RETURN s.name AS subject, p.name AS predicate, c.name AS category, collect(o.name) AS objects
                    LIMIT $limit
                """
                result = session.run(query, subject=user_id, predicate=predicate, category=category, limit=limit)
            elif predicate:
                query = """
                    MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object)
                    RETURN s.name AS subject, p.name AS predicate, c.name AS category, collect(o.name) AS objects
                    LIMIT $limit
                """
                result = session.run(query, subject=user_id, predicate=predicate, limit=limit)
            else:
                query = """
                    MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE]->(p:Predicate)-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object)
                    RETURN s.name AS subject, p.name AS predicate, c.name AS category, collect(o.name) AS objects
                    LIMIT $limit
                """
                result = session.run(query, subject=user_id, limit=limit)

            preferences = []
            for record in result:
                preferences.append({
                    'subject': record['subject'],
                    'predicate': record['predicate'],
                    'category': record['category'],
                    'objects': record['objects']
                })
            return preferences
    except Exception as e:
        logger.error(f"查询用户偏好时出错: {str(e)}")
        return []


def hybrid_search(query, user_id="default_user", limit=3):
    """
    混合搜索：先用 Qdrant 找到相关记忆，再用 Neo4j 获取详细层级关系
    实现 Qdrant 向量查询到父节点，然后 Neo4j 用父节点查询子节点
    """
    try:
        # 检查客户端是否可用
        if client is None or client_qdrant is None:
            logger.warning("记忆系统客户端未初始化，返回空结果")
            return []
            
        # 使用 Qdrant 进行向量搜索获取相关记忆ID
        query_embedding = create_embedding(query)
        if query_embedding is None:
            logger.warning("无法为混合搜索创建嵌入向量，返回空结果")
            return []

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
            logger.error(f"混合搜索Qdrant查询出错: {str(e)}")
            return []

        detailed_results = []
        for point in search_result.points:
            memory_id = point.id
            summary = point.payload.get("summary", "")
            created_at = point.payload.get("created_at", "")

            # 使用 Neo4j 获取该记忆的详细层级关系
            try:
                with neo4j_driver.session() as session:
                    # 查询该记忆关联的层级结构
                    neo4j_query = """
                        MATCH (m:Memory {id: $memory_id, user_id: $user_id})-[:CONTAINS]->(o:Object)
                        OPTIONAL MATCH (c:Category)-[:HAS_OBJECT]->(o)
                        OPTIONAL MATCH (p:Predicate)-[:HAS_CATEGORY]->(c)
                        OPTIONAL MATCH (s:Subject)-[:HAS_PREDICATE]->(p)
                        RETURN s.name AS subject, p.name AS predicate, c.name AS category, o.name AS object
                    """
                    neo4j_result = session.run(neo4j_query, memory_id=memory_id, user_id=user_id)

                    hierarchy = []
                    for record in neo4j_result:
                        hierarchy.append({
                            'subject': record['subject'],
                            'predicate': record['predicate'],
                            'category': record['category'],
                            'object': record['object']
                        })

                detailed_results.append({
                    'memory_id': memory_id,
                    'summary': summary,
                    'created_at': created_at,
                    'hierarchy': hierarchy
                })
            except Exception as e:
                logger.error(f"获取详细层级关系时出错: {str(e)}")
                detailed_results.append({
                    'memory_id': memory_id,
                    'summary': summary,
                    'created_at': created_at,
                    'hierarchy': []
                })

        return detailed_results
    except Exception as e:
        logger.error(f"混合搜索时出错: {str(e)}")
        # 捕获所有异常，确保返回空列表
        return []


def get_user_knowledge_graph(subject, predicate=None, category=None):
    """
    获取用户的完整知识图谱
    参数:
    - subject: 主语 (如用户ID)
    - predicate: 谓语 (可选)
    - category: 标签/类别 (可选)
    - depth: 图的深度
    """
    if not subject:
        logger.error("获取知识图谱时缺少subject参数")
        return []
        
    try:
        with neo4j_driver.session() as session:
            if predicate and category:
                # 查询特定谓语和类别的信息
                query = """
                    MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})-[:HAS_CATEGORY]->(c:Category {name: $category})-[:HAS_OBJECT]->(o:Object)
                    RETURN s.name AS subject, p.name AS predicate, c.name AS category, collect(o.name) AS objects
                """
                result = session.run(query, subject=subject, predicate=predicate, category=category)
            elif predicate:
                # 查询特定谓语的信息
                query = """
                    MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object)
                    RETURN s.name AS subject, p.name AS predicate, c.name AS category, collect(o.name) AS objects
                """
                result = session.run(query, subject=subject, predicate=predicate)
            else:
                # 查询所有信息
                query = """
                    MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE]->(p:Predicate)-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object)
                    RETURN s.name AS subject, p.name AS predicate, c.name AS category, collect(o.name) AS objects
                """
                result = session.run(query, subject=subject)

            graph = []
            for record in result:
                graph.append({
                    'subject': record['subject'],
                    'predicate': record['predicate'],
                    'category': record['category'],
                    'objects': record['objects']
                })

            return graph
    except Exception as e:
        logger.error(f"获取用户知识图谱时出错: {str(e)}")
        return []


def query_knowledge_triple(subject, predicate, category=None, user_id="default_user"):
    """
    根据三元组条件查询知识
    参数:
    - subject: 主语 (必须，例如："用户")
    - predicate: 谓语 (必须，例如："之前年龄")
    - category: 标签/类别 (可选)
    - user_id: 用户ID (可选，默认："chen")
    """
    # 参数验证
    if not subject or not predicate:
        logger.error("查询知识三元组时缺少必要参数: 主语(subject)和谓语(predicate)是必须参数")
        return []

    try:
        with neo4j_driver.session() as session:
            # 构建动态查询
            if category:
                query = """
                    MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})-[:HAS_CATEGORY]->(c:Category {name: $category})-[:HAS_OBJECT]->(o:Object)
                    WHERE EXISTS((:Memory {user_id: $user_id})-[:CONTAINS]->(o))
                    RETURN s.name AS subject, p.name AS predicate, c.name AS category, collect(o.name) AS objects
                """
                result = session.run(query, subject=subject, predicate=predicate, category=category, user_id=user_id)
            else:
                query = """
                    MATCH (s:Subject {name: $subject})-[:HAS_PREDICATE {name: $predicate}]->(p:Predicate {name: $predicate})-[:HAS_CATEGORY]->(c:Category)-[:HAS_OBJECT]->(o:Object)
                    WHERE EXISTS((:Memory {user_id: $user_id})-[:CONTAINS]->(o))
                    RETURN s.name AS subject, p.name AS predicate, c.name AS category, collect(o.name) AS objects
                """
                result = session.run(query, subject=subject, predicate=predicate, user_id=user_id)

            triples = []
            for record in result:
                triples.append({
                    'subject': record['subject'],
                    'predicate': record['predicate'],
                    'category': record['category'],
                    'objects': record['objects']
                })

            return triples
    except Exception as e:
        logger.error(f"查询知识三元组时出错: {str(e)}")
        return []

