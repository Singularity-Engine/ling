#!/usr/bin/env python3
"""
修复数据库和Redis连接配置
"""

import yaml
import os
import sys

def main():
    # 配置文件路径
    config_file = "conf.yaml"
    
    # 读取当前配置
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
    except Exception as e:
        print(f"读取配置文件失败: {e}")
        return
    
    # 添加数据库配置
    print("添加数据库配置...")
    
    # 创建数据库配置部分
    if 'database' not in config:
        config['database'] = {
            'host': 'localhost',
            'port': 5432,
            'user': 'postgres',
            'password': '12345678',
            'database': 'mcp_streaming_call'
        }
        print("已添加数据库配置")
    else:
        print("数据库配置已存在，更新配置...")
        config['database']['host'] = 'localhost'
        config['database']['port'] = 5432
        config['database']['user'] = 'postgres'
        config['database']['password'] = '12345678'
        config['database']['database'] = 'mcp_streaming_call'
    
    # 添加Redis配置
    print("添加Redis配置...")
    
    # 创建Redis配置部分
    if 'data' not in config:
        config['data'] = {}
    
    if 'redis' not in config['data']:
        config['data']['redis'] = {
            'host': 'localhost',
            'port': 6379,
            'password': '123456',
            'database': 0
        }
        print("已添加Redis配置")
    else:
        print("Redis配置已存在，更新配置...")
        config['data']['redis']['host'] = 'localhost'
        config['data']['redis']['port'] = 6379
        config['data']['redis']['password'] = '123456'
        config['data']['redis']['database'] = 0
    
    # 保存配置
    try:
        with open(config_file, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, default_flow_style=False, allow_unicode=True)
        print(f"配置已保存到 {config_file}")
    except Exception as e:
        print(f"保存配置文件失败: {e}")
        return
    
    # 设置环境变量
    print("设置环境变量...")
    os.environ['PGHOST'] = 'localhost'
    os.environ['PGPORT'] = '5432'
    os.environ['PGUSER'] = 'postgres'
    os.environ['PGPASSWORD'] = '12345678'
    os.environ['PGDATABASE'] = 'mcp_streaming_call'
    
    os.environ['REDIS_HOST'] = 'localhost'
    os.environ['REDIS_PORT'] = '6379'
    os.environ['REDIS_PASSWORD'] = '123456'
    os.environ['REDIS_DB'] = '0'
    
    print("环境变量已设置")
    
    # 修复代码中的硬编码密码
    print("修复代码中的硬编码密码...")
    
    # 修复database_manager.py中的硬编码密码
    try:
        file_path = "src/ling_engine/database/pgsql/database_manager.py"
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 替换硬编码的密码
        content = content.replace("password='wylj99'", "password='12345678'")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"已修复 {file_path} 中的硬编码密码")
    except Exception as e:
        print(f"修复 {file_path} 失败: {e}")
    
    # 修复redis_manager.py中的硬编码密码
    try:
        file_path = "src/ling_engine/database/redis/redis_manager.py"
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 替换硬编码的密码
        content = content.replace("password: Optional[str] = 123456", "password: Optional[str] = None")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"已修复 {file_path} 中的硬编码密码")
    except Exception as e:
        print(f"修复 {file_path} 失败: {e}")
    
    print("\n配置修复完成！请重新启动服务器以应用更改。")

if __name__ == "__main__":
    main()

