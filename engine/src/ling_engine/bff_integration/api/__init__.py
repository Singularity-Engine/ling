"""
API模块

提供BFF集成相关的API端点
"""

from .auth_routes import create_auth_router
from .user_routes import create_user_router

__all__ = [
    "create_auth_router",
    "create_user_router"
]
