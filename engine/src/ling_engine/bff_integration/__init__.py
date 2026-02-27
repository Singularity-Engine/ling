"""
BFF集成模块

该模块提供与Node端BFF网关的集成功能，包括：
- JWT认证处理
- 用户数据同步
- Webhook处理
- 用户上下文管理
"""

__version__ = "1.0.0"
__author__ = "Ling Engine Team"

from .auth.jwt_handler import JWTHandler
from .auth.user_context import UserContext, UserContextManager
from .models.user_models import User, UserCreate, UserResponse
from .database.user_repository import UserRepository

__all__ = [
    "JWTHandler",
    "UserContext",
    "UserContextManager",
    "User",
    "UserCreate",
    "UserResponse",
    "UserRepository"
]
