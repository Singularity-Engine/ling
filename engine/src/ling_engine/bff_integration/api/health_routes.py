"""
健康检查相关的API路由

提供系统健康状态检查端点
"""

from fastapi import APIRouter
from datetime import datetime
from typing import Dict, Any
from loguru import logger

def create_health_router() -> APIRouter:
    """创建健康检查路由

    Returns:
        健康检查路由器
    """
    router = APIRouter(tags=["健康检查"])

    @router.get("/health")
    async def health_check() -> Dict[str, Any]:
        """健康检查端点（增强版）

        Returns:
            系统健康状态信息
        """
        logger.info("🏥 === 健康检查端点被调用（增强版）===")

        # 检查各个组件状态
        components_status = {}
        overall_status = "UP"

        # 1. 检查BFF集成状态
        try:
            import os
            bff_enabled = os.getenv('BFF_INTEGRATION_ENABLED', 'false').lower() == 'true'
            components_status["bff_integration"] = "UP" if bff_enabled else "DISABLED"
            if not bff_enabled:
                overall_status = "DEGRADED"
        except Exception as e:
            components_status["bff_integration"] = "DOWN"
            overall_status = "DOWN"
            logger.warning(f"BFF集成检查失败: {e}")

        # 2. 检查JWT处理器状态
        try:
            from ..auth.jwt_handler import JWTHandler
            jwt_handler = JWTHandler()
            components_status["jwt_handler"] = "UP" if jwt_handler.webhook_secret else "DEGRADED"
        except Exception as e:
            components_status["jwt_handler"] = "DOWN"
            overall_status = "DOWN"
            logger.warning(f"JWT处理器检查失败: {e}")

        # 3. 检查数据库连接状态
        try:
            import psycopg2
            import os

            # 尝试从配置文件读取数据库配置
            try:
                from ...config_manager import get_database_config
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

            conn.close()
            components_status["database"] = "UP"
        except Exception as e:
            components_status["database"] = "DOWN"
            overall_status = "DOWN"
            logger.warning(f"数据库连接检查失败: {e}")

        # 4. 检查环境配置
        import os
        config_status = {
            "jwt_secret_configured": bool(os.getenv('JWT_SECRET_KEY')),
            "clerk_webhook_configured": bool(os.getenv('CLERK_WEBHOOK_SECRET')),
            "database_configured": bool(os.getenv('DB_HOST') and os.getenv('DB_NAME')),
        }
        components_status["configuration"] = "UP" if all(config_status.values()) else "DEGRADED"

        health_info = {
            "status": overall_status,
            "service": "Open-LLM-VTuber BFF Integration",
            "timestamp": datetime.now().isoformat(),
            "port": int(os.getenv('SERVER_PORT', '12393')),
            "version": "1.2.0",
            "components": components_status,
            "configuration": config_status,
            "endpoints": {
                "auth_sync": "/api/auth/sync",
                "auth_register": "/api/auth/register", 
                "auth_verify": "/api/auth/verify",
                "health": "/health"
            },
            "compatibility": {
                "node_js_integration": "READY",
                "java_backend_format": "COMPATIBLE"
            }
        }

        logger.info(f"✅ 健康检查响应: 状态={overall_status}, 组件={len(components_status)}")
        return health_info

    @router.get("/ping")
    async def ping() -> Dict[str, str]:
        """简单的ping端点

        Returns:
            简单的pong响应
        """
        logger.info("🏓 Ping端点被调用")
        return {"message": "pong", "timestamp": datetime.now().isoformat()}

    return router
