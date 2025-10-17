#!/usr/bin/env python3
"""
PostgreSQL数据库连接管理器
提供连接池和基本的CRUD操作
"""

import os
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import json
import threading
import time
from ..redis.redis_manager import RedisManager

logger = logging.getLogger(__name__)

class SnowflakeIDGenerator:
    """基于 Snowflake 的 64 位 ID 生成器

    组成: 1 符号位 | 41 位毫秒时间戳 | 5 位数据中心 | 5 位工作节点 | 12 位自增序列
    """

    def __init__(self, datacenter_id: int = 1, worker_id: int = 1, epoch_ms: int = None):
        if datacenter_id < 0 or datacenter_id > 31:
            raise ValueError("datacenter_id 必须在 0-31 之间")
        if worker_id < 0 or worker_id > 31:
            raise ValueError("worker_id 必须在 0-31 之间")

        # 默认起始纪元: 2024-01-01 00:00:00 UTC
        if epoch_ms is None:
            epoch_ms = int(time.mktime((2024, 1, 1, 0, 0, 0, 0, 0, 0)) * 1000)

        self.epoch_ms = epoch_ms
        self.datacenter_id = datacenter_id
        self.worker_id = worker_id
        self.sequence = 0
        self.last_timestamp = -1
        self.lock = threading.Lock()

        # 位偏移
        self.timestamp_shift = 22
        self.datacenter_shift = 17
        self.worker_shift = 12
        self.sequence_mask = (1 << 12) - 1

    def _current_millis(self) -> int:
        return int(time.time() * 1000)

    def _wait_next_millis(self, last_timestamp: int) -> int:
        timestamp = self._current_millis()
        while timestamp <= last_timestamp:
            time.sleep(0.0001)
            timestamp = self._current_millis()
        return timestamp

    def generate_id(self) -> int:
        with self.lock:
            timestamp = self._current_millis()

            if timestamp < self.last_timestamp:
                # 时钟回拨，等待到上次时间戳
                timestamp = self._wait_next_millis(self.last_timestamp)

            if timestamp == self.last_timestamp:
                self.sequence = (self.sequence + 1) & self.sequence_mask
                if self.sequence == 0:
                    # 序列溢出，等待下一毫秒
                    timestamp = self._wait_next_millis(self.last_timestamp)
            else:
                self.sequence = 0

            self.last_timestamp = timestamp

            elapsed = timestamp - self.epoch_ms
            snowflake_id = (
                (elapsed << self.timestamp_shift)
                | (self.datacenter_id << self.datacenter_shift)
                | (self.worker_id << self.worker_shift)
                | self.sequence
            )
            return snowflake_id


class DatabaseManager:
    """数据库连接管理器"""

    def __init__(self, host='localhost', port=5432, user='postgres',
                 password='', database='vtuber_chat_db',
                 min_conn=1, max_conn=10,
                 datacenter_id: int = 1, worker_id: int = 1):
        """初始化数据库管理器"""
        self.config = {
            'host': host,
            'port': port,
            'user': user,
            'password': password,
            'database': database
        }

        self.pool = None
        self.min_conn = min_conn
        self.max_conn = max_conn
        self.id_generator = SnowflakeIDGenerator(datacenter_id=datacenter_id, worker_id=worker_id)

    def connect(self):
        """建立线程安全的连接池"""
        try:
            self.pool = ThreadedConnectionPool(
                self.min_conn,
                self.max_conn,
                **self.config,
                cursor_factory=RealDictCursor
            )
            logger.info("线程安全的数据库连接池创建成功")
            return True
        except Exception as e:
            logger.error(f"创建连接池失败: {e}")
            return False

    def get_connection(self):
        """获取数据库连接"""
        if not self.pool:
            if not self.connect():
                return None
        return self.pool.getconn()

    def return_connection(self, conn):
        """归还数据库连接"""
        if self.pool:
            self.pool.putconn(conn)

    def close(self):
        """关闭连接池"""
        if self.pool:
            self.pool.closeall()
            logger.info("数据库连接池已关闭")

class ChatSessionManager:
    """聊天会话管理器"""

    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager
        logger.info("🔥 BASE DEBUG: 基础 ChatSessionManager 初始化完成")

    def create_session(self, session_id: str, user_id: str, character_name: str,
                      session_name: Optional[str] = None) -> Optional[Dict]:
        """创建聊天会话"""
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                return None

            cursor = conn.cursor()

            new_id = self.db_manager.id_generator.generate_id()

            query = """
            INSERT INTO chat_sessions (id, session_id, user_id, character_name, session_name)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """

            cursor.execute(query, (new_id, session_id, user_id, character_name, session_name))
            result = cursor.fetchone()

            conn.commit()
            cursor.close()
            self.db_manager.return_connection(conn)

            return dict(result) if result else None

        except Exception as e:
            logger.error(f"创建会话失败: {e}")
            if conn:
                conn.rollback()
                self.db_manager.return_connection(conn)
            return None

    def get_session(self, session_id: str) -> Optional[Dict]:
        """获取会话信息"""
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                return None

            cursor = conn.cursor()

            query = """
            SELECT * FROM chat_sessions 
            WHERE session_id = %s AND deleted = FALSE
            """

            cursor.execute(query, (session_id,))
            result = cursor.fetchone()

            cursor.close()
            self.db_manager.return_connection(conn)

            return dict(result) if result else None

        except Exception as e:
            logger.error(f"获取会话失败: {e}")
            if conn:
                self.db_manager.return_connection(conn)
            return None

    def get_user_sessions(self, user_id: str) -> List[Dict]:
        """获取用户的所有会话"""
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                return []

            cursor = conn.cursor()

            query = """
            SELECT * FROM chat_sessions 
            WHERE user_id = %s AND deleted = FALSE
            ORDER BY updated_at DESC
            """

            cursor.execute(query, (user_id,))
            results = cursor.fetchall()

            cursor.close()
            self.db_manager.return_connection(conn)

            return [dict(row) for row in results]

        except Exception as e:
            logger.error(f"获取用户会话失败: {e}")
            if conn:
                self.db_manager.return_connection(conn)
            return []

    def update_session(self, session_id: str, **kwargs) -> bool:
        """更新会话信息"""
        logger.info(f"🔥 DEBUG: update_session 开始 - session_id={session_id}, kwargs={kwargs}")
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                logger.error("🔥 DEBUG: 无法获取数据库连接")
                return False

            cursor = conn.cursor()

            # 构建更新字段
            update_fields = []
            values = []
            for key, value in kwargs.items():
                if key in ['session_name', 'character_name', 'custom_title', 'is_pinned']:
                    update_fields.append(f"{key} = %s")
                    values.append(value)
                    logger.info(f"🔥 DEBUG: 添加更新字段 - {key}={value}")

            if not update_fields:
                logger.warning("🔥 DEBUG: 没有有效的更新字段")
                return False

            values.append(session_id)
            query = f"""
            UPDATE chat_sessions 
            SET {', '.join(update_fields)}
            WHERE session_id = %s AND deleted = FALSE
            """

            logger.info(f"🔥 DEBUG: 准备执行SQL - query={query}")
            logger.info(f"🔥 DEBUG: SQL参数 - values={values}")

            cursor.execute(query, values)
            affected_rows = cursor.rowcount
            
            logger.info(f"🔥 DEBUG: SQL执行完成 - affected_rows={affected_rows}")

            conn.commit()
            logger.info("🔥 DEBUG: 事务已提交")
            
            cursor.close()
            self.db_manager.return_connection(conn)

            result = affected_rows > 0
            logger.info(f"🔥 DEBUG: update_session 结果 - result={result}")
            return result

        except Exception as e:
            logger.error(f"🔥 DEBUG: update_session 异常 - {e}")
            logger.exception("完整异常堆栈:")
            if conn:
                conn.rollback()
                logger.info("🔥 DEBUG: 事务已回滚")
                self.db_manager.return_connection(conn)
            return False

    def pin_session(self, session_id: str, is_pinned: bool) -> bool:
        """置顶或取消置顶会话"""
        logger.info(f"🔥 DEBUG: 开始置顶操作 - session_id={session_id}, is_pinned={is_pinned}")
        result = self.update_session(session_id, is_pinned=is_pinned)
        logger.info(f"🔥 DEBUG: 置顶操作结果 - result={result}")
        return result

    def rename_session(self, session_id: str, custom_title: str) -> bool:
        """重命名会话（设置自定义标题）"""
        logger.info(f"🔥 DEBUG: 开始重命名操作 - session_id={session_id}, custom_title={custom_title}")
        result = self.update_session(session_id, custom_title=custom_title)
        logger.info(f"🔥 DEBUG: 重命名操作结果 - result={result}")
        return result

    def delete_session(self, session_id: str) -> bool:
        """软删除会话"""
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                return False

            cursor = conn.cursor()

            # 在同一事务内：软删会话 + 软删该会话的所有消息
            query_session = """
            UPDATE chat_sessions 
            SET deleted = TRUE 
            WHERE session_id = %s
            """
            cursor.execute(query_session, (session_id,))
            affected_rows = cursor.rowcount

            query_messages = """
            UPDATE chat_messages
            SET deleted = TRUE
            WHERE session_id = %s
            """
            cursor.execute(query_messages, (session_id,))

            conn.commit()
            cursor.close()
            self.db_manager.return_connection(conn)

            return affected_rows > 0

        except Exception as e:
            logger.error(f"删除会话失败: {e}")
            if conn:
                conn.rollback()
                self.db_manager.return_connection(conn)
            return False

class ChatMessageManager:
    """聊天消息管理器"""

    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager

    def add_message(self, session_id: str, role: str, content: str) -> Optional[Dict]:
        """添加消息"""
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                return None

            cursor = conn.cursor()

            new_id = self.db_manager.id_generator.generate_id()

            query = """
            INSERT INTO chat_messages (id, session_id, role, content)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """

            cursor.execute(query, (new_id, session_id, role, content))
            result = cursor.fetchone()

            conn.commit()
            cursor.close()
            self.db_manager.return_connection(conn)

            return dict(result) if result else None

        except Exception as e:
            logger.error(f"添加消息失败: {e}")
            if conn:
                conn.rollback()
                self.db_manager.return_connection(conn)
            return None

    def get_session_messages(self, session_id: str, limit: Optional[int] = None) -> List[Dict]:
        """获取会话的所有消息"""
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                return []

            cursor = conn.cursor()

            query = """
            SELECT * FROM chat_messages 
            WHERE session_id = %s AND deleted = FALSE
            ORDER BY created_at ASC
            """

            if limit:
                query += f" LIMIT {limit}"

            cursor.execute(query, (session_id,))
            results = cursor.fetchall()

            cursor.close()
            self.db_manager.return_connection(conn)

            return [dict(row) for row in results]

        except Exception as e:
            logger.error(f"获取会话消息失败: {e}")
            if conn:
                self.db_manager.return_connection(conn)
            return []

    def delete_message(self, message_id: int) -> bool:
        """软删除消息"""
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                return False

            cursor = conn.cursor()

            query = """
            UPDATE chat_messages 
            SET deleted = TRUE 
            WHERE id = %s
            """

            cursor.execute(query, (message_id,))
            affected_rows = cursor.rowcount

            conn.commit()
            cursor.close()
            self.db_manager.return_connection(conn)

            return affected_rows > 0

        except Exception as e:
            logger.error(f"删除消息失败: {e}")
            if conn:
                conn.rollback()
                self.db_manager.return_connection(conn)
            return False

# 全局数据库管理器实例
_db_manager = None
_session_manager = None
_message_manager = None
_redis_manager = None
_cache_session_manager = None
_cache_message_manager = None

def get_db_manager() -> DatabaseManager:
    """获取数据库管理器实例（优先使用配置文件，然后环境变量）"""
    global _db_manager
    if _db_manager is None:
        try:
            # 首先尝试从配置文件读取
            from ...config_manager import get_database_config
            db_config = get_database_config()

            # 环境变量可以覆盖配置文件
            host = os.getenv('PGHOST') or db_config.postgres.host
            port = int(os.getenv('PGPORT') or db_config.postgres.port)
            user = os.getenv('PGUSER') or db_config.postgres.user
            password = os.getenv('PGPASSWORD') or db_config.postgres.password
            database = os.getenv('PGDATABASE') or db_config.postgres.database

            _db_manager = DatabaseManager(
                host=host,
                port=port,
                user=user,
                password=password,
                database=database,
                min_conn=db_config.postgres.min_conn,
                max_conn=db_config.postgres.max_conn,
                datacenter_id=db_config.postgres.datacenter_id,
                worker_id=db_config.postgres.worker_id,
            )
        except Exception as e:
            logger.warning(f"Failed to load database config, using fallback: {e}")
            # 回退到环境变量和默认值
            host = os.getenv('PGHOST', 'localhost')
            port = int(os.getenv('PGPORT', '5432'))
            user = os.getenv('PGUSER', 'postgres')
            password = os.getenv('PGPASSWORD', '')
            database = os.getenv('PGDATABASE', 'vtuber_chat_db')

            _db_manager = DatabaseManager(
                host=host,
                port=port,
                user=user,
                password=password,
                database=database,
            )
        _db_manager.connect()
    return _db_manager

def get_session_manager() -> ChatSessionManager:
    """获取会话管理器实例（默认返回带缓存的实现）"""
    global _cache_session_manager
    
    # 强制重新创建实例以确保使用新代码 (临时调试)
    logger.info("🔥 FORCE DEBUG: 强制重新创建会话管理器实例")
    _cache_session_manager = None
    
    if _cache_session_manager is None:
        logger.info("🔥 INIT DEBUG: 开始创建 CacheBackedChatSessionManager")
        try:
            # 延迟导入以避免循环依赖
            from .cache_backed_managers import CacheBackedChatSessionManager
            
            db_manager = get_db_manager()
            redis_manager = get_redis_manager()
            logger.info(f"🔥 INIT DEBUG: db_manager={type(db_manager)}, redis_manager={type(redis_manager)}")

            _cache_session_manager = CacheBackedChatSessionManager(
                db_manager, redis_manager
            )
            logger.info("🔥 INIT DEBUG: CacheBackedChatSessionManager 创建成功")
        except Exception as e:
            logger.error(f"🔥 INIT DEBUG: 创建 CacheBackedChatSessionManager 失败: {e}")
            logger.exception("详细错误:")
            # 回退到基础实现
            _cache_session_manager = ChatSessionManager(get_db_manager())
            logger.info("🔥 INIT DEBUG: 回退到基础 ChatSessionManager")
    return _cache_session_manager

def get_message_manager() -> ChatMessageManager:
    """获取消息管理器实例（默认返回带缓存的实现）"""
    global _cache_message_manager
    if _cache_message_manager is None:
        # 延迟导入以避免循环依赖
        from .cache_backed_managers import CacheBackedChatMessageManager

        _cache_message_manager = CacheBackedChatMessageManager(
            get_db_manager(), get_redis_manager()
        )
    return _cache_message_manager


def get_redis_manager() -> RedisManager:
    """获取 Redis 管理器实例（优先使用配置文件，然后环境变量）"""
    global _redis_manager
    if _redis_manager is None:
        try:
            # 首先尝试从配置文件读取
            from ...config_manager import get_database_config
            db_config = get_database_config()

            # 环境变量可以覆盖配置文件
            host = os.getenv('REDIS_HOST') or db_config.redis.host
            port = int(os.getenv('REDIS_PORT') or db_config.redis.port)
            db = int(os.getenv('REDIS_DB') or db_config.redis.db)
            password = os.getenv('REDIS_PASSWORD') or db_config.redis.password
            namespace = os.getenv('REDIS_NAMESPACE') or db_config.redis.namespace

            # 如果密码为空字符串，设置为None避免Redis认证错误
            if password == '':
                password = None

            _redis_manager = RedisManager(
                host=host,
                port=port,
                db=db,
                password=password,
                namespace=namespace,
                socket_timeout=db_config.redis.socket_timeout,
                decode_responses=db_config.redis.decode_responses,
            )
        except Exception as e:
            logger.warning(f"Failed to load redis config, using fallback: {e}")
            # 回退到环境变量和默认值
            host = os.getenv('REDIS_HOST', 'localhost')
            port = int(os.getenv('REDIS_PORT', '6379'))
            db = int(os.getenv('REDIS_DB', '0'))
            password = os.getenv('REDIS_PASSWORD') or None
            if password == '':
                password = None
            namespace = os.getenv('REDIS_NAMESPACE', 'vtuber')

            _redis_manager = RedisManager(
                host=host,
                port=port,
                db=db,
                password=password,
                namespace=namespace,
            )
        _redis_manager.connect()
    return _redis_manager
