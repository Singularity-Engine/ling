"""
数据库模块

提供BFF集成相关的数据库操作
"""

from .user_repository import UserRepository

__all__ = [
    "UserRepository"
]
