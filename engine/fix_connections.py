#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
修复Ling Engine项目的连接问题
"""

import os
import yaml
import argparse
from pathlib import Path
import json

# 设置颜色输出
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_color(text: str, color: str):
    """打印彩色文本"""
    print(f"{color}{text}{Colors.ENDC}")

def print_section(title: str):
    """打印带有分隔线的标题"""
    print("\n" + "="*50)
    print_color(f" {title} ", Colors.BOLD + Colors.HEADER)
    print("="*50)

def load_config(config_path: str):
    """加载配置文件"""
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        print_color(f"✓ 从 {config_path} 加载配置成功", Colors.GREEN)
        return config
    except Exception as e:
        print_color(f"✗ 加载配置文件失败: {str(e)}", Colors.RED)
        return None

def save_config(config, config_path: str):
    """保存配置文件"""
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, default_flow_style=False, allow_unicode=True)
        print_color(f"✓ 配置已保存到 {config_path}", Colors.GREEN)
        return True
    except Exception as e:
        print_color(f"✗ 保存配置文件失败: {str(e)}", Colors.RED)
        return False

def fix_database_config(config):
    """修复数据库配置"""
    print_section("修复PostgreSQL数据库配置")
    
    # 检查是否存在数据库配置
    if "database" not in config:
        config["database"] = {}
    
    # 添加或修改数据库配置
    db_config = config["database"]
    
    print_color("当前数据库配置:", Colors.CYAN)
    print(json.dumps(db_config, indent=2, ensure_ascii=False))
    
    print_color("\n请输入PostgreSQL数据库连接信息（留空使用默认值）:", Colors.YELLOW)
    
    host = input(f"主机地址 [{db_config.get('host', 'localhost')}]: ") or db_config.get('host', 'localhost')
    port = input(f"端口 [{db_config.get('port', 5432)}]: ") or db_config.get('port', 5432)
    try:
        port = int(port)
    except ValueError:
        port = 5432
        print_color("端口必须是数字，已设置为默认值 5432", Colors.YELLOW)
    
    dbname = input(f"数据库名称 [{db_config.get('dbname', 'ling_engine')}]: ") or db_config.get('dbname', 'ling_engine')
    user = input(f"用户名 [{db_config.get('user', 'postgres')}]: ") or db_config.get('user', 'postgres')
    password = input(f"密码 [{db_config.get('password', 'postgres')}]: ") or db_config.get('password', 'postgres')
    
    # 更新配置
    db_config["host"] = host
    db_config["port"] = port
    db_config["dbname"] = dbname
    db_config["user"] = user
    db_config["password"] = password
    
    config["database"] = db_config
    
    print_color("\n更新后的数据库配置:", Colors.CYAN)
    print(json.dumps(db_config, indent=2, ensure_ascii=False))
    
    # 提示创建数据库和表
    print_color("\n请确保PostgreSQL服务已启动，并且已创建数据库和必要的表。", Colors.YELLOW)
    print_color("以下是创建character_affinity表的SQL语句:", Colors.CYAN)
    print("""
CREATE TABLE character_affinity (
    id SERIAL PRIMARY KEY,
    character_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    affinity INTEGER DEFAULT 50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, user_id)
);
    """)
    
    return config

def fix_redis_config(config):
    """修复Redis配置"""
    print_section("修复Redis配置")
    
    # 检查是否存在Redis配置
    if "redis" not in config:
        config["redis"] = {}
    
    # 添加或修改Redis配置
    redis_config = config["redis"]
    
    print_color("当前Redis配置:", Colors.CYAN)
    print(json.dumps(redis_config, indent=2, ensure_ascii=False))
    
    print_color("\n请输入Redis连接信息（留空使用默认值）:", Colors.YELLOW)
    
    host = input(f"主机地址 [{redis_config.get('host', 'localhost')}]: ") or redis_config.get('host', 'localhost')
    port = input(f"端口 [{redis_config.get('port', 6379)}]: ") or redis_config.get('port', 6379)
    try:
        port = int(port)
    except ValueError:
        port = 6379
        print_color("端口必须是数字，已设置为默认值 6379", Colors.YELLOW)
    
    db = input(f"数据库索引 [{redis_config.get('db', 0)}]: ") or redis_config.get('db', 0)
    try:
        db = int(db)
    except ValueError:
        db = 0
        print_color("数据库索引必须是数字，已设置为默认值 0", Colors.YELLOW)
    
    password = input(f"密码 [{redis_config.get('password', '')}]: ") or redis_config.get('password', '')
    
    # 更新配置
    redis_config["host"] = host
    redis_config["port"] = port
    redis_config["db"] = db
    redis_config["password"] = password
    
    config["redis"] = redis_config
    
    print_color("\n更新后的Redis配置:", Colors.CYAN)
    print(json.dumps(redis_config, indent=2, ensure_ascii=False))
    
    print_color("\n请确保Redis服务已启动，并且密码配置正确。", Colors.YELLOW)
    print_color("如果您不想使用密码认证，可以修改Redis配置文件，注释掉requirepass行。", Colors.CYAN)
    
    return config

def fix_edge_tts_config(config):
    """修复Edge TTS配置"""
    print_section("修复Edge TTS配置")
    
    # 检查是否存在TTS配置
    if "character_config" not in config:
        config["character_config"] = {}
    
    if "tts_config" not in config["character_config"]:
        config["character_config"]["tts_config"] = {}
    
    tts_config = config["character_config"]["tts_config"]
    
    # 检查TTS模型
    tts_model = tts_config.get("tts_model", "edge_tts")
    
    if tts_model != "edge_tts":
        print_color(f"当前TTS模型为 {tts_model}，不是edge_tts，是否要切换到edge_tts？(y/n)", Colors.YELLOW)
        choice = input().lower()
        if choice == 'y':
            tts_config["tts_model"] = "edge_tts"
            print_color("已切换到edge_tts", Colors.GREEN)
        else:
            print_color(f"保持TTS模型为 {tts_model}", Colors.CYAN)
    
    # 检查edge_tts配置
    if "edge_tts" not in tts_config:
        tts_config["edge_tts"] = {}
    
    edge_tts_config = tts_config["edge_tts"]
    
    print_color("当前Edge TTS配置:", Colors.CYAN)
    print(json.dumps(edge_tts_config, indent=2, ensure_ascii=False))
    
    print_color("\n请输入Edge TTS配置信息（留空使用默认值）:", Colors.YELLOW)
    
    voice = input(f"语音 [{edge_tts_config.get('voice', 'zh-CN-XiaoxiaoNeural')}]: ") or edge_tts_config.get('voice', 'zh-CN-XiaoxiaoNeural')
    
    # 更新配置
    edge_tts_config["voice"] = voice
    
    tts_config["edge_tts"] = edge_tts_config
    config["character_config"]["tts_config"] = tts_config
    
    print_color("\n更新后的Edge TTS配置:", Colors.CYAN)
    print(json.dumps(edge_tts_config, indent=2, ensure_ascii=False))
    
    print_color("\nEdge TTS服务连接失败可能是由于网络问题或认证问题。", Colors.YELLOW)
    print_color("请确保您的网络可以访问Microsoft Edge TTS服务。", Colors.CYAN)
    
    return config

def disable_database_features(config):
    """禁用数据库相关功能"""
    print_section("禁用数据库相关功能")
    
    print_color("如果您不想使用数据库功能，可以禁用相关功能。", Colors.YELLOW)
    print_color("这将禁用亲密度系统和历史记录等功能，但不会影响基本的对话功能。", Colors.CYAN)
    
    choice = input("是否禁用数据库相关功能？(y/n): ").lower()
    
    if choice == 'y':
        # 禁用数据库相关功能
        if "database" in config:
            del config["database"]
        
        if "redis" in config:
            del config["redis"]
        
        print_color("已禁用数据库相关功能", Colors.GREEN)
    else:
        print_color("保持数据库相关功能启用", Colors.CYAN)
    
    return config

def create_init_sql_file():
    """创建初始化SQL文件"""
    print_section("创建初始化SQL文件")
    
    sql_content = """-- 创建character_affinity表
CREATE TABLE IF NOT EXISTS character_affinity (
    id SERIAL PRIMARY KEY,
    character_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    affinity INTEGER DEFAULT 50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, user_id)
);

-- 创建chat_history表
CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    character_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    message_content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chat_history_session_id ON chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_character_id ON chat_history(character_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
"""
    
    file_path = "init_database.sql"
    
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(sql_content)
        print_color(f"✓ 初始化SQL文件已创建: {file_path}", Colors.GREEN)
        
        print_color("\n使用以下命令初始化数据库:", Colors.CYAN)
        print(f"psql -U <用户名> -d <数据库名> -f {file_path}")
    except Exception as e:
        print_color(f"✗ 创建初始化SQL文件失败: {str(e)}", Colors.RED)

def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="修复Ling Engine项目的连接问题")
    parser.add_argument("--config", default="conf.yaml", help="配置文件路径")
    parser.add_argument("--skip-database", action="store_true", help="跳过数据库配置修复")
    parser.add_argument("--skip-redis", action="store_true", help="跳过Redis配置修复")
    parser.add_argument("--skip-tts", action="store_true", help="跳过TTS配置修复")
    parser.add_argument("--disable-db", action="store_true", help="禁用数据库相关功能")
    parser.add_argument("--create-sql", action="store_true", help="创建初始化SQL文件")
    
    args = parser.parse_args()
    
    print_color("Ling Engine连接修复工具", Colors.BOLD + Colors.HEADER)
    print_color("=" * 50, Colors.BOLD + Colors.HEADER)
    
    # 加载配置文件
    config = load_config(args.config)
    if not config:
        return
    
    # 修复配置
    if args.disable_db:
        config = disable_database_features(config)
    else:
        if not args.skip_database:
            config = fix_database_config(config)
        
        if not args.skip_redis:
            config = fix_redis_config(config)
    
    if not args.skip_tts:
        config = fix_edge_tts_config(config)
    
    # 保存配置
    if save_config(config, args.config):
        print_color("\n配置已成功更新！", Colors.GREEN + Colors.BOLD)
    else:
        print_color("\n配置更新失败！", Colors.RED + Colors.BOLD)
    
    # 创建初始化SQL文件
    if args.create_sql:
        create_init_sql_file()
    
    print_color("\n修复完成！请重新启动服务器以应用更改。", Colors.GREEN + Colors.BOLD)
    print_color("如果仍然遇到问题，请运行 test_connections.py 再次测试连接情况。", Colors.CYAN)

if __name__ == "__main__":
    main()
