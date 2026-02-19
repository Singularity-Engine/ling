-- 数据库表结构定义

-- 聊天会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
    id BIGSERIAL PRIMARY KEY,
    conf_uid VARCHAR(255) NOT NULL,
    history_uid VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL DEFAULT 'default_user',
    session_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    session_metadata JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 聊天消息表
CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    message_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB NOT NULL DEFAULT '{}'
);

-- 用户元数据表
CREATE TABLE IF NOT EXISTS user_metadata (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    nickname VARCHAR(255),
    avatar_url TEXT,
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 会话统计表
CREATE TABLE IF NOT EXISTS session_statistics (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL UNIQUE REFERENCES chat_sessions(id) ON DELETE CASCADE,
    total_messages INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    user_messages INTEGER NOT NULL DEFAULT 0,
    assistant_messages INTEGER NOT NULL DEFAULT 0,
    total_cost NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    first_message_at TIMESTAMP WITH TIME ZONE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}'
);

-- AI模型价格表
CREATE TABLE IF NOT EXISTS model_prices (
    id BIGSERIAL PRIMARY KEY,
    model_name VARCHAR(255) NOT NULL UNIQUE,
    provider VARCHAR(100) NOT NULL,
    input_price NUMERIC(20, 10) NOT NULL,
    output_price NUMERIC(20, 10) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    capabilities JSONB
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON chat_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_metadata_user_id ON user_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_session_stats_session_id ON session_statistics(session_id);
CREATE INDEX IF NOT EXISTS idx_model_prices_name ON model_prices(model_name);
CREATE INDEX IF NOT EXISTS idx_model_prices_provider ON model_prices(provider);

-- 创建约束
ALTER TABLE chat_sessions ADD CONSTRAINT check_conf_uid_not_empty CHECK (LENGTH(TRIM(conf_uid)) > 0);
ALTER TABLE chat_sessions ADD CONSTRAINT check_history_uid_not_empty CHECK (LENGTH(TRIM(history_uid)) > 0);
ALTER TABLE chat_sessions ADD CONSTRAINT check_user_id_not_empty CHECK (LENGTH(TRIM(user_id)) > 0);

ALTER TABLE chat_messages ADD CONSTRAINT check_role_valid CHECK (role IN ('system', 'user', 'assistant', 'function'));
ALTER TABLE chat_messages ADD CONSTRAINT check_tokens_non_negative CHECK (tokens >= 0);

ALTER TABLE model_prices ADD CONSTRAINT check_input_price_non_negative CHECK (input_price >= 0);
ALTER TABLE model_prices ADD CONSTRAINT check_output_price_non_negative CHECK (output_price >= 0);

-- 创建触发器函数更新updated_at字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要自动更新updated_at的表创建触发器
DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at 
    BEFORE UPDATE ON chat_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_messages_updated_at ON chat_messages;
CREATE TRIGGER update_chat_messages_updated_at 
    BEFORE UPDATE ON chat_messages 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_metadata_updated_at ON user_metadata;
CREATE TRIGGER update_user_metadata_updated_at 
    BEFORE UPDATE ON user_metadata 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_model_prices_updated_at ON model_prices;
CREATE TRIGGER update_model_prices_updated_at 
    BEFORE UPDATE ON model_prices 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 创建会话统计自动更新函数
CREATE OR REPLACE FUNCTION update_session_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- 插入新记录时初始化统计
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO session_statistics (session_id, first_message_at, last_message_at)
        VALUES (NEW.session_id, NEW.timestamp, NEW.timestamp)
        ON CONFLICT (session_id) 
        DO UPDATE SET 
            last_message_at = EXCLUDED.last_message_at,
            total_messages = session_statistics.total_messages + 1,
            total_tokens = session_statistics.total_tokens + COALESCE(NEW.tokens, 0),
            user_messages = session_statistics.user_messages + CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END,
            assistant_messages = session_statistics.assistant_messages + CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END;
    -- 更新记录时更新统计
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE session_statistics 
        SET last_message_at = NEW.timestamp,
            total_tokens = total_tokens - COALESCE(OLD.tokens, 0) + COALESCE(NEW.tokens, 0),
            user_messages = user_messages - CASE WHEN OLD.role = 'user' THEN 1 ELSE 0 END + CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END,
            assistant_messages = assistant_messages - CASE WHEN OLD.role = 'assistant' THEN 1 ELSE 0 END + CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END
        WHERE session_id = NEW.session_id;
    -- 删除记录时更新统计
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE session_statistics 
        SET total_messages = total_messages - 1,
            total_tokens = total_tokens - COALESCE(OLD.tokens, 0),
            user_messages = user_messages - CASE WHEN OLD.role = 'user' THEN 1 ELSE 0 END,
            assistant_messages = assistant_messages - CASE WHEN OLD.role = 'assistant' THEN 1 ELSE 0 END
        WHERE session_id = OLD.session_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 创建会话统计触发器
DROP TRIGGER IF EXISTS trigger_update_session_statistics ON chat_messages;
CREATE TRIGGER trigger_update_session_statistics
    AFTER INSERT OR UPDATE OR DELETE ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_session_statistics();