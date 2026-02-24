"""
MongoDB 异步客户端 — motor 单例 (lazy 验证, 无 ping)
"""

import asyncio
from loguru import logger

_motor_client = None
_motor_db = None
_init_lock = asyncio.Lock()


async def get_soul_db():
    """获取灵魂系统 MongoDB 数据库实例 (lazy 初始化)"""
    global _motor_client, _motor_db
    if _motor_db is not None:
        return _motor_db

    async with _init_lock:
        if _motor_db is not None:
            return _motor_db
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            from ..config import get_soul_config

            cfg = get_soul_config()
            _motor_client = AsyncIOMotorClient(
                cfg.mongo_url,
                serverSelectionTimeoutMS=3000,
                maxPoolSize=10,
            )
            _motor_db = _motor_client[cfg.mongo_database]
            # 不 ping — 第一次实际操作时才验证连接
            logger.info(f"[Soul] MongoDB client created (lazy verification) → {cfg.mongo_database}")
        except Exception as e:
            logger.warning(f"[Soul] MongoDB client creation failed: {e}")
            _motor_db = None

    return _motor_db


async def close_soul_db():
    """关闭 MongoDB 连接"""
    global _motor_client, _motor_db
    if _motor_client is not None:
        _motor_client.close()
        _motor_client = None
        _motor_db = None
        logger.info("[Soul] MongoDB client closed")
