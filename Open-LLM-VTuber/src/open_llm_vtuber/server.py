import os
import shutil
import asyncio
import logging
from typing import List, Dict, Any

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from .routes import create_routes
from .service_context import ServiceContext
from .config_manager.utils import Config
from .agent.token_tracking_patch import apply_patches

logger = logging.getLogger(__name__)


class CustomStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if path.endswith(".js"):
            response.headers["Content-Type"] = "application/javascript"
        return response


class AvatarStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        allowed_extensions = (".jpg", ".jpeg", ".png", ".gif", ".svg")
        if not any(path.lower().endswith(ext) for ext in allowed_extensions):
            return Response("Forbidden file type", status_code=403)
        return await super().get_response(path, scope)


class WebSocketServer:
    def __init__(self, config: Config):
        # 应用token跟踪补丁
        apply_patches()

        self.app = FastAPI()

        # 🔧 修改CORS配置，明确支持192.168.1.5同域和Cookie传递
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=[
                "http://localhost:3000/",
                "http://127.0.0.1:3000",
                "http://192.168.1.5:12393", 
                "ws://192.168.1.5:12393",
                "http://localhost:12393", 
                "ws://localhost:12393",
                "http://127.0.0.1:12393",
                "ws://127.0.0.1:12393",
                "*"  # 保留通配符兼容性
            ],
            allow_credentials=True,  # 关键：允许Cookie传递
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Load configurations and initialize the default context cache
        default_context_cache = ServiceContext()
        default_context_cache.load_from_config(config)
        
        # 保存上下文缓存供启动事件使用
        self.default_context_cache = default_context_cache
        
        # 在启动事件中异步初始化路由和挂载静态文件
        @self.app.on_event("startup")
        async def startup_event():
            # 0. 预加载常用模型定价到缓存
            try:
                from .utils.database_pricing import preload_common_models
                logger.info("开始预加载常用模型定价到Redis缓存...")
                results = preload_common_models()
                success_count = sum(results.values())
                logger.info(f"模型定价预加载完成: {success_count}/{len(results)} 个模型成功加载")
            except Exception as e:
                logger.warning(f"预加载模型定价失败: {e}")
            
            # 1. 首先注册API路由
            router = await create_routes(default_context_cache=self.default_context_cache)
            self.app.include_router(router)
            
            # 2. 然后挂载静态文件（确保路由优先级正确）
            
            # Mount cache directory first (to ensure audio file access)
            if not os.path.exists("cache"):
                os.makedirs("cache")
            self.app.mount(
                "/cache",
                StaticFiles(directory="cache"),
                name="cache",
            )

            # Mount static files
            self.app.mount(
                "/live2d-models",
                StaticFiles(directory="live2d-models"),
                name="live2d-models",
            )
            self.app.mount(
                "/bg",
                StaticFiles(directory="backgrounds"),
                name="backgrounds",
            )
            self.app.mount(
                "/avatars",
                AvatarStaticFiles(directory="avatars"),
                name="avatars",
            )

            # Mount web tool directory for internal tools
            self.app.mount(
                "/web-tool",
                CustomStaticFiles(directory="web_tool", html=True),
                name="web_tool",
            )

            # Mount frontend static files (for local deployment)
            if os.path.exists("frontend"):
                self.app.mount(
                    "/",
                    CustomStaticFiles(directory="frontend", html=True),
                    name="frontend",
                )
                logger.info("✅ Frontend static files mounted at /")
            else:
                logger.warning("⚠️ Frontend directory not found, using separate frontend service")

            # 启动 MCP 配置热更新后台监听任务
            try:
                loop = asyncio.get_event_loop()
                loop.create_task(self.default_context_cache.watch_mcp_config())
            except Exception as e:
                # 记录但不阻塞启动
                print(f"无法启动 MCP 配置热更新监听: {e}")

    def run(self):
        pass

    @staticmethod
    def clean_cache():
        """Clean the cache directory by removing and recreating it."""
        cache_dir = "cache"
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir)
            os.makedirs(cache_dir)

