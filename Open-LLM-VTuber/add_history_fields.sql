-- 为 chat_sessions 表添加置顶和自定义标题字段
-- 如果字段不存在则添加

DO $$
BEGIN
    -- 添加 custom_title 字段
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_sessions' AND column_name = 'custom_title'
    ) THEN
        ALTER TABLE chat_sessions ADD COLUMN custom_title VARCHAR(500);
        RAISE NOTICE '✅ 成功添加 custom_title 字段';
    ELSE
        RAISE NOTICE '✅ custom_title 字段已存在';
    END IF;

    -- 添加 is_pinned 字段
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_sessions' AND column_name = 'is_pinned'
    ) THEN
        ALTER TABLE chat_sessions ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '✅ 成功添加 is_pinned 字段';
    ELSE
        RAISE NOTICE '✅ is_pinned 字段已存在';
    END IF;
END $$;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_chat_sessions_is_pinned ON chat_sessions(is_pinned);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_custom_title ON chat_sessions(custom_title);

-- 验证字段已添加
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'chat_sessions' 
AND column_name IN ('custom_title', 'is_pinned')
ORDER BY column_name;