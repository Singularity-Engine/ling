#!/usr/bin/env python3
"""
PostgreSQL数据库初始化脚本
用于创建聊天会话和消息相关的表结构
"""

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import logging
import sys
import os
from datetime import datetime

# 统一客户端编码，避免Windows控制台/服务端返回本地化信息导致的UnicodeDecodeError
try:
    os.environ.setdefault('PGCLIENTENCODING', 'UTF8')
except Exception:
    pass

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 数据库连接配置
DB_CONFIG = {
    'host': os.environ.get('POSTGRES_HOST', 'localhost'),
    'port': int(os.environ.get('POSTGRES_PORT', 5432)),
    'user': os.environ.get('POSTGRES_USER', 'postgres'),
    'password': os.environ.get('POSTGRES_PASSWORD', ''),
    'database': os.environ.get('POSTGRES_DB', 'vtuber_chat_db'),
}

# 统一的连接辅助，允许指定 client_encoding
def _connect(dbname: str, encoding: str = 'UTF8'):
    return psycopg2.connect(
        host=DB_CONFIG['host'],
        port=DB_CONFIG['port'],
        user=DB_CONFIG['user'],
        password=DB_CONFIG['password'],
        database=dbname,
        options=f"-c client_encoding={encoding}"
    )


def _log_error_safe(prefix: str, e: Exception) -> None:
    try:
        logger.error(f"{prefix}: {e}")
    except Exception:
        # 某些环境下错误消息包含非UTF8内容，避免再次触发编码错误
        logger.error(f"{prefix}: {type(e).__name__}")


def create_database():
    """创建数据库"""
    try:
        # 连接到默认的postgres数据库（带编码回退）
        try:
            conn = _connect('postgres', 'UTF8')
        except Exception as _e_utf8:
            # 若因服务端返回非UTF8错误文本导致解码失败，则回退为LATIN1以容忍任意字节
            if isinstance(_e_utf8, UnicodeDecodeError) or 'UnicodeDecodeError' in repr(type(_e_utf8)) or 'codec can\'t decode' in str(_e_utf8):
                logger.warning("UTF8连接失败，尝试使用 LATIN1 重新连接用于创建数据库...")
                conn = _connect('postgres', 'LATIN1')
            else:
                raise
        conn.set_client_encoding('UTF8')
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # 明确设置编码（双保险）
        try:
            cursor.execute("SET client_encoding TO 'UTF8';")
        except Exception:
            pass
        
        # 检查数据库是否存在
        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_CONFIG['database'],))
        exists = cursor.fetchone()

        if not exists:
            cursor.execute(f"CREATE DATABASE {DB_CONFIG['database']} WITH ENCODING 'UTF8' TEMPLATE template0")
            logger.info(f"数据库 {DB_CONFIG['database']} 创建成功")
        else:
            logger.info(f"数据库 {DB_CONFIG['database']} 已存在")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        _log_error_safe("创建数据库失败", e)
        return False


def create_tables():
    """创建表结构"""
    try:
        # 连接到目标数据库（显式设置UTF8）
        conn = psycopg2.connect(**{**DB_CONFIG, 'options': "-c client_encoding=UTF8"})
        conn.set_client_encoding('UTF8')
        cursor = conn.cursor()
        try:
            cursor.execute("SET client_encoding TO 'UTF8';")
        except Exception:
            pass

        # 创建聊天会话表
        create_sessions_table = """
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id BIGINT PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL UNIQUE,
            user_id VARCHAR(255) NOT NULL,
            character_name VARCHAR(255) NOT NULL,
            session_name VARCHAR(255),
            custom_title VARCHAR(500),
            is_pinned BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            deleted BOOLEAN DEFAULT FALSE
        );
        """

        # 创建聊天消息表
        create_messages_table = """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id BIGINT PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL,
            role VARCHAR(10) NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            deleted BOOLEAN DEFAULT FALSE
        );
        """

        # 兼容已存在的旧表: 将 id 列升级为 BIGINT 并去除默认序列
        migrate_id_columns = """
        DO $$
        BEGIN
            -- chat_sessions.id -> BIGINT
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='chat_sessions' AND column_name='id' AND udt_name IN ('int4', 'int8')
            ) THEN
                BEGIN
                    ALTER TABLE chat_sessions ALTER COLUMN id TYPE BIGINT;
                EXCEPTION WHEN others THEN NULL;
                END;
                BEGIN
                    ALTER TABLE chat_sessions ALTER COLUMN id DROP DEFAULT;
                EXCEPTION WHEN others THEN NULL;
                END;
            END IF;

            -- chat_messages.id -> BIGINT
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='chat_messages' AND column_name='id' AND udt_name IN ('int4', 'int8')
            ) THEN
                BEGIN
                    ALTER TABLE chat_messages ALTER COLUMN id TYPE BIGINT;
                EXCEPTION WHEN others THEN NULL;
                END;
                BEGIN
                    ALTER TABLE chat_messages ALTER COLUMN id DROP DEFAULT;
                EXCEPTION WHEN others THEN NULL;
                END;
            END IF;
        END $$;
        """

        # 创建索引
        create_indexes = """
        -- 创建索引
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_character_name ON chat_sessions(character_name);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages(role);
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
        """

        # 创建触发器函数：自动更新 updated_at + 软删除联动
        create_trigger_function = """
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';

        CREATE OR REPLACE FUNCTION soft_delete_session_messages()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.deleted = TRUE AND (OLD.deleted IS DISTINCT FROM TRUE) THEN
                UPDATE chat_messages
                SET deleted = TRUE
                WHERE session_id = NEW.session_id;
            END IF;
            RETURN NEW;
        END;
        $$ language 'plpgsql';
        """

        # 创建触发器
        create_triggers = """
        -- 为chat_sessions表创建触发器
        DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
        CREATE TRIGGER update_chat_sessions_updated_at
            BEFORE UPDATE ON chat_sessions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
            
        -- 为chat_messages表创建触发器
        DROP TRIGGER IF EXISTS update_chat_messages_updated_at ON chat_messages;
        CREATE TRIGGER update_chat_messages_updated_at
            BEFORE UPDATE ON chat_messages
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();

        -- 当 chat_sessions.deleted 从 FALSE 变为 TRUE 时，联动软删除对应消息
        DROP TRIGGER IF EXISTS trg_soft_delete_session_messages ON chat_sessions;
        CREATE TRIGGER trg_soft_delete_session_messages
            AFTER UPDATE OF deleted ON chat_sessions
            FOR EACH ROW
            EXECUTE FUNCTION soft_delete_session_messages();
        """

        # 亲密度相关表：character_affinity 与 affinity_history
        create_affinity_tables = """
        CREATE TABLE IF NOT EXISTS character_affinity (
            id SERIAL PRIMARY KEY,
            character_name VARCHAR(255) NOT NULL,
            user_id VARCHAR(255) NOT NULL,
            affinity INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
            UNIQUE(character_name, user_id)
        );

        CREATE TABLE IF NOT EXISTS affinity_history (
            id SERIAL PRIMARY KEY,
            character_affinity_id INTEGER NOT NULL REFERENCES character_affinity(id) ON DELETE CASCADE,
            timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            value INTEGER NOT NULL,
            change_amount INTEGER NOT NULL,
            reason TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE
        );
        """

        create_affinity_indexes = """
        CREATE INDEX IF NOT EXISTS idx_character_affinity_char_user ON character_affinity(character_name, user_id);
        CREATE INDEX IF NOT EXISTS idx_character_affinity_updated_at ON character_affinity(updated_at);
        CREATE INDEX IF NOT EXISTS idx_character_affinity_is_deleted ON character_affinity(is_deleted);

        CREATE INDEX IF NOT EXISTS idx_affinity_history_ca_id ON affinity_history(character_affinity_id);
        CREATE INDEX IF NOT EXISTS idx_affinity_history_timestamp ON affinity_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_affinity_history_created_at ON affinity_history(created_at);
        """

        create_affinity_triggers = """
        -- 为 character_affinity 创建 updated_at 触发器
        DROP TRIGGER IF EXISTS update_character_affinity_updated_at ON character_affinity;
        CREATE TRIGGER update_character_affinity_updated_at
            BEFORE UPDATE ON character_affinity
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();

        -- 为 affinity_history 创建 updated_at 触发器
        DROP TRIGGER IF EXISTS update_affinity_history_updated_at ON affinity_history;
        CREATE TRIGGER update_affinity_history_updated_at
            BEFORE UPDATE ON affinity_history
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        """

        # 迁移/确保 character_affinity.id 为自增（BIGSERIAL/IDENTITY 等价行为）
        migrate_affinity_id = """
        DO $$
        BEGIN
            -- 将 id 升级为 BIGINT（如已是 int8 会跳过异常）
            BEGIN
                ALTER TABLE character_affinity ALTER COLUMN id TYPE BIGINT;
            EXCEPTION WHEN others THEN NULL; END;

            -- 若缺省值未设置，则创建序列并绑定
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='character_affinity' AND column_name='id' AND column_default IS NOT NULL
            ) THEN
                -- 创建序列（若不存在）
                CREATE SEQUENCE IF NOT EXISTS character_affinity_id_seq;
                -- 绑定默认值
                BEGIN
                    ALTER TABLE character_affinity ALTER COLUMN id SET DEFAULT nextval('character_affinity_id_seq');
                EXCEPTION WHEN others THEN NULL; END;
                -- 设置所有权，确保 DROP TABLE 时一并清理
                BEGIN
                    ALTER SEQUENCE character_affinity_id_seq OWNED BY character_affinity.id;
                EXCEPTION WHEN others THEN NULL; END;
            END IF;
        END $$;
        """

        # 字段存在性与兼容性迁移
        ensure_deleted_columns = """
        ALTER TABLE IF EXISTS chat_sessions
            ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
        ALTER TABLE IF EXISTS chat_messages
            ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
        """
        
        # 为现有会话表添加新字段（置顶和自定义标题）
        add_new_session_columns = """
        ALTER TABLE IF EXISTS chat_sessions
            ADD COLUMN IF NOT EXISTS custom_title VARCHAR(500);
        ALTER TABLE IF EXISTS chat_sessions
            ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
        """

        # 执行SQL语句
        cursor.execute(create_sessions_table)
        cursor.execute(create_messages_table)
        cursor.execute(ensure_deleted_columns)
        cursor.execute(add_new_session_columns)
        cursor.execute(create_trigger_function)
        cursor.execute(create_indexes)
        cursor.execute(create_triggers)
        # 亲密度表与索引、触发器
        cursor.execute(create_affinity_tables)
        cursor.execute(create_affinity_indexes)
        cursor.execute(create_affinity_triggers)
        cursor.execute(migrate_affinity_id)
        cursor.execute(migrate_id_columns)

        # 逻辑删除一致性修复
        reconcile_soft_delete = """
        UPDATE chat_messages AS m
        SET deleted = TRUE
        FROM chat_sessions AS s
        WHERE m.session_id = s.session_id
          AND s.deleted = TRUE
          AND m.deleted = FALSE;
        """
        cursor.execute(reconcile_soft_delete)

        conn.commit()
        logger.info("表结构创建成功")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        _log_error_safe("创建表结构失败", e)
        return False


def verify_tables():
    """验证表是否创建成功"""
    try:
        conn = psycopg2.connect(**{**DB_CONFIG, 'options': "-c client_encoding=UTF8"})
        conn.set_client_encoding('UTF8')
        cursor = conn.cursor()
        try:
            cursor.execute("SET client_encoding TO 'UTF8';")
        except Exception:
            pass

        # 检查表是否存在
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('chat_sessions', 'chat_messages', 'character_affinity', 'affinity_history')
        """)

        tables = cursor.fetchall()
        logger.info(f"已创建的表: {[table[0] for table in tables]}")

        # 检查索引是否存在
        cursor.execute("""
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename IN ('chat_sessions', 'chat_messages')
        """)

        indexes = cursor.fetchall()
        logger.info(f"已创建的索引: {[index[0] for index in indexes]}")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        _log_error_safe("验证表结构失败", e)
        return False


def main():
    """主函数"""
    logger.info("开始初始化数据库...")

    # 创建数据库
    if not create_database():
        logger.error("数据库创建失败，退出")
        sys.exit(1)

    # 创建表结构
    if not create_tables():
        logger.error("表结构创建失败，退出")
        sys.exit(1)

    # 验证表结构
    if not verify_tables():
        logger.error("表结构验证失败，退出")
        sys.exit(1)

    logger.info("数据库初始化完成！")

if __name__ == "__main__":
    main()
