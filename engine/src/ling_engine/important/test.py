import os
from datetime import datetime, timezone
import uuid
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams
# 使用统一的OpenAI客户端
from dotenv import load_dotenv
# 使用简单的编辑距离算法计算相似度
# 导入 Neo4j 相关库
# 导入日志模块
from loguru import logger

load_dotenv()
# 数据库配置
QDRANT_URL = os.environ.get(
    "QDRANT_URL", "http://qdrant:6333"
)
COLLECTION_NAME = os.environ.get(
    "COLLECTION_NAME", "openmemory"
)
try:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        client_qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False, timeout=60)
except Exception as e:
    logger.warning(f"初始化Qdrant客户端时出现警告/错误: {e}")
    client_qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False, timeout=60)
OPENAI_EMBEDDING_MODEL_DIMS = int(os.environ.get(
    "OPENAI_EMBEDDING_MODEL_DIMS", 1536
))

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

if __name__ == '__main__':
    init_db()