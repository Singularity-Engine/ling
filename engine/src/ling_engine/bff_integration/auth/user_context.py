"""
用户上下文管理

提供用户上下文的设置、获取和清理功能
"""

import contextvars
from typing import Optional
from ..models.user_models import UserContext

# 创建上下文变量
user_context_var: contextvars.ContextVar[Optional[UserContext]] = contextvars.ContextVar(
    "user_context", default=None
)

class UserContextManager:
    """用户上下文管理器"""

    @staticmethod
    def set_user_context(user_context: UserContext) -> None:
        """设置当前用户上下文

        Args:
            user_context: 用户上下文对象
        """
        from loguru import logger
        import threading

        # 获取当前线程信息
        thread_id = threading.current_thread().ident
        thread_name = threading.current_thread().name

        logger.info(f"🔄 UserContextManager: 正在设置用户上下文")
        logger.info(f"   🧵 线程ID: {thread_id}")
        logger.info(f"   🧵 线程名: {thread_name}")
        logger.info(f"   👤 用户ID: {user_context.user_id}")
        logger.info(f"   📝 用户名: {user_context.username}")
        logger.info(f"   📧 邮箱: {user_context.email}")
        logger.info(f"   🏷️ 角色: {user_context.roles}")
        logger.info(f"   🎫 令牌存在: {bool(user_context.token)}")

        # 检查之前是否有上下文
        old_context = user_context_var.get()
        if old_context:
            logger.info(f"   🔄 替换现有上下文: {old_context.user_id} -> {user_context.user_id}")
        else:
            logger.info(f"   🆕 设置新的用户上下文")

        user_context_var.set(user_context)

        # 验证设置是否成功
        verify_context = user_context_var.get()
        if verify_context and verify_context.user_id == user_context.user_id:
            logger.info(f"✅ UserContextManager: 用户上下文设置成功")
            logger.info(f"   🔍 验证用户ID: {verify_context.user_id}")
            logger.info(f"   🔍 验证用户名: {verify_context.username}")
        else:
            logger.error(f"❌ UserContextManager: 用户上下文设置失败")
            if verify_context:
                logger.error(f"   🔍 实际获取到的用户ID: {verify_context.user_id}")
            else:
                logger.error(f"   🔍 获取到的上下文为空")

    @staticmethod
    def get_current_user_context() -> Optional[UserContext]:
        """获取当前用户上下文

        Returns:
            用户上下文对象，如果不存在则返回None
        """
        from loguru import logger
        import threading

        # 获取当前线程信息
        thread_id = threading.current_thread().ident
        thread_name = threading.current_thread().name

        context = user_context_var.get()
        
        if context:
            logger.debug(f"🔍 UserContextManager: 获取用户上下文成功")
            logger.debug(f"   🧵 线程ID: {thread_id}")
            logger.debug(f"   🧵 线程名: {thread_name}")
            logger.debug(f"   👤 用户ID: {context.user_id}")
            logger.debug(f"   📝 用户名: {context.username}")
        else:
            logger.debug(f"🔍 UserContextManager: 当前无用户上下文")
            logger.debug(f"   🧵 线程ID: {thread_id}")
            logger.debug(f"   🧵 线程名: {thread_name}")
        
        return context

    @staticmethod
    def clear() -> None:
        """清除当前用户上下文"""
        user_context_var.set(None)

    @staticmethod
    def get_current_user_id() -> Optional[str]:
        """获取当前用户ID

        Returns:
            用户ID，如果不存在则返回None
        """
        context = user_context_var.get()
        return context.user_id if context else None

    @staticmethod
    def get_current_username() -> Optional[str]:
        """获取当前用户名

        Returns:
            用户名，如果不存在则返回None
        """
        context = user_context_var.get()
        return context.username if context else None

    @staticmethod
    def has_role(role: str) -> bool:
        """检查当前用户是否具有指定角色

        Args:
            role: 角色名称

        Returns:
            是否具有该角色
        """
        context = user_context_var.get()
        return role in context.roles if context else False

    @staticmethod
    def is_authenticated() -> bool:
        """检查用户是否已认证

        Returns:
            是否已认证
        """
        return user_context_var.get() is not None
