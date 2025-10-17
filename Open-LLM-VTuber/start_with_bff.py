#!/usr/bin/env python3
"""
Open-LLM-VTuber BFF集成启动脚本

该脚本帮助用户快速启动带有BFF集成功能的Open-LLM-VTuber服务
"""

import os
import sys
import subprocess
from pathlib import Path
from loguru import logger

def check_environment():
    """检查环境配置"""
    logger.info("🔍 检查环境配置...")

    # 检查Python版本
    if sys.version_info < (3, 8):
        logger.error("❌ Python版本过低，需要Python 3.8或更高版本")
        return False

    logger.info(f"✅ Python版本: {sys.version}")

    # 检查必要的包
    required_packages = [
        'fastapi', 'uvicorn', 'pydantic', 'loguru',
        'psycopg2', 'pyjwt', 'aiohttp'
    ]

    missing_packages = []
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            missing_packages.append(package)

    if missing_packages:
        logger.warning(f"⚠️ 缺少以下包: {missing_packages}")
        logger.info("请运行: pip install -r requirements.txt")
        return False

    logger.info("✅ 所有必要的包都已安装")
    return True

def check_database():
    """检查数据库连接"""
    logger.info("🔍 检查数据库连接...")

    try:
        import psycopg2

        # 尝试从配置文件读取数据库配置
        try:
            from src.open_llm_vtuber.config_manager import get_database_config
            db_config = get_database_config()

            conn = psycopg2.connect(
                host=os.getenv('PGHOST') or os.getenv('DB_HOST') or db_config.postgres.host,
                port=int(os.getenv('PGPORT') or os.getenv('DB_PORT') or db_config.postgres.port),
                database=os.getenv('PGDATABASE') or os.getenv('DB_NAME') or db_config.postgres.database,
                user=os.getenv('PGUSER') or os.getenv('DB_USER') or db_config.postgres.user,
                password=os.getenv('PGPASSWORD') or os.getenv('DB_PASSWORD') or db_config.postgres.password
            )
        except Exception:
            # 回退到硬编码默认值
            conn = psycopg2.connect(
                host=os.getenv('DB_HOST', 'localhost'),
                port=int(os.getenv('DB_PORT', '5432')),
                database=os.getenv('DB_NAME', 'vtuber_chat_db'),
                user=os.getenv('DB_USER', 'postgres'),
                password=os.getenv('DB_PASSWORD', '')
            )

        with conn.cursor() as cursor:
            cursor.execute("SELECT 1")

        conn.close()
        logger.info("✅ 数据库连接正常")
        return True
    except Exception as e:
        logger.error(f"❌ 数据库连接失败: {str(e)}")
        logger.info("请确保PostgreSQL服务正在运行，并检查连接参数")
        return False

def setup_environment():
    """设置环境变量"""
    logger.info("🔧 设置环境变量...")

    # 检查.env文件
    env_file = Path('../.env')
    if not env_file.exists():
        logger.warning("⚠️ .env文件不存在")

        # 检查是否有示例文件
        example_file = Path('env.bff.example')
        if example_file.exists():
            logger.info("📋 找到示例配置文件，请复制并修改:")
            logger.info(f"cp {example_file} .env")
            logger.info("然后编辑.env文件，设置必要的环境变量")

        return False

    # 加载.env文件
    try:
        from dotenv import load_dotenv
        load_dotenv()
        logger.info("✅ 环境变量加载成功")
    except ImportError:
        logger.warning("⚠️ python-dotenv未安装，请手动设置环境变量")

    # 检查关键环境变量
    required_vars = [
        'JWT_SECRET_KEY',
        'CLERK_WEBHOOK_SECRET',
        'DB_HOST',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD'
    ]

    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)

    if missing_vars:
        logger.warning(f"⚠️ 缺少环境变量: {missing_vars}")
        logger.info("请在.env文件中设置这些变量")
        return False

    logger.info("✅ 所有必要的环境变量都已设置")
    return True

def check_config_file():
    """检查配置文件"""
    logger.info("🔍 检查配置文件...")

    config_file = Path('conf.yaml')
    if not config_file.exists():
        logger.error("❌ conf.yaml配置文件不存在")
        return False

    # 检查BFF配置
    try:
        import yaml
        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        if 'bff_integration' not in config:
            logger.warning("⚠️ conf.yaml中缺少bff_integration配置")
            logger.info("请参考BFF_INTEGRATION_GUIDE.md添加配置")
            return False

        bff_config = config['bff_integration']
        if not bff_config.get('enabled', False):
            logger.warning("⚠️ BFF集成功能未启用")
            logger.info("请在conf.yaml中设置 bff_integration.enabled: true")
            return False

        logger.info("✅ 配置文件检查通过")
        return True
    except Exception as e:
        logger.error(f"❌ 配置文件检查失败: {str(e)}")
        return False

def start_server():
    """启动服务器"""
    logger.info("🚀 启动Open-LLM-VTuber服务器...")

    try:
        # 使用run_server.py启动
        subprocess.run([sys.executable, 'run_server.py'], check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ 服务器启动失败: {e}")
        return False
    except KeyboardInterrupt:
        logger.info("⏹️ 服务器已停止")
        return True

def main():
    """主函数"""
    logger.info("🎯 Open-LLM-VTuber BFF集成启动器")
    logger.info("=" * 50)

    # 检查环境
    if not check_environment():
        logger.error("❌ 环境检查失败，请解决上述问题后重试")
        return 1

    # 设置环境变量
    if not setup_environment():
        logger.error("❌ 环境变量设置失败，请解决上述问题后重试")
        return 1

    # 检查配置文件
    if not check_config_file():
        logger.error("❌ 配置文件检查失败，请解决上述问题后重试")
        return 1

    # 检查数据库
    if not check_database():
        logger.error("❌ 数据库检查失败，请解决上述问题后重试")
        return 1

    logger.info("🎉 所有检查都通过了！")
    logger.info("📚 BFF集成功能将在以下端点可用:")
    logger.info("  - 认证端点: http://localhost:12393/api/auth/*")
    logger.info("  - 用户管理: http://localhost:12393/api/users/*")
    logger.info("  - 健康检查: http://localhost:12393/health")
    logger.info("")

    # 启动服务器
    return 0 if start_server() else 1

if __name__ == "__main__":
    # 设置日志
    logger.remove()
    logger.add(
        sys.stdout,
        level="INFO",
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
        colorize=True
    )

    sys.exit(main())
