"""
用户上下文助手模块

提供统一的用户ID获取和用户上下文管理功能
"""

from typing import Optional
from loguru import logger


def get_current_user_id(fallback_user_id: str = "default_user") -> str:
    """
    统一获取当前用户ID的助手函数
    
    Args:
        fallback_user_id: 当无法获取真实用户ID时使用的默认值
        
    Returns:
        用户ID字符串
    """
    try:
        from ..bff_integration.auth.user_context import UserContextManager
        user_id = UserContextManager.get_current_user_id()
        
        if user_id:
            logger.debug(f"✅ 获取到真实用户ID: {user_id}")
            return user_id
        else:
            logger.warning(f"⚠️ 无法获取当前用户ID，使用默认值: {fallback_user_id}")
            return fallback_user_id
            
    except Exception as e:
        logger.warning(f"⚠️ 获取用户上下文失败: {e}，使用默认值: {fallback_user_id}")
        return fallback_user_id


def get_user_id_from_websocket_cookie_only(client_uid: str = None, websocket_headers: dict = None, fallback_user_id: str = "default_user") -> str:
    """
    仅从WebSocket Cookie获取用户ID的函数
    
    这个函数只从浏览器网页的Cookie中获取用户ID：
    1. 从WebSocket客户端缓存获取（之前成功解析过的）
    2. 从WebSocket Cookie直接解析 internal_access_token
    3. 使用默认值
    
    Args:
        client_uid: WebSocket客户端ID
        websocket_headers: WebSocket请求头字典
        fallback_user_id: 最终的默认值
        
    Returns:
        用户ID字符串
    """
    user_id = None
    
    # 第一优先级：从WebSocket客户端缓存获取（之前成功解析的结果）
    if client_uid:
        try:
            from ..bff_integration.auth.websocket_user_cache import get_user_id_for_websocket_client
            user_id = get_user_id_for_websocket_client(client_uid)
            if user_id:
                logger.debug(f"🎯 从WebSocket缓存获取用户ID: {user_id}")
                return user_id
        except Exception as e:
            logger.debug(f"从WebSocket缓存获取用户ID失败: {e}")
    
    # 第二优先级：从WebSocket Cookie直接解析
    if websocket_headers:
        try:
            from ..bff_integration.auth.jwt_helper import extract_user_id_from_websocket_cookie
            user_id = extract_user_id_from_websocket_cookie(websocket_headers)
            if user_id:
                logger.info(f"🎯 从WebSocket Cookie直接解析获取用户ID: {user_id}")
                
                # 如果有客户端ID，同时缓存到WebSocket用户缓存中供后续使用
                if client_uid:
                    try:
                        from ..bff_integration.auth.websocket_user_cache import cache_user_for_websocket_client
                        cache_user_for_websocket_client(client_uid, user_id, f"user_{user_id[-8:]}", None, ["USER"], "")
                    except Exception as cache_e:
                        logger.debug(f"缓存用户ID到WebSocket缓存失败: {cache_e}")
                
                return user_id
        except Exception as e:
            logger.debug(f"从WebSocket Cookie解析用户ID失败: {e}")
    
    # 最终回退：使用默认值
    logger.warning(f"⚠️ 无法从浏览器Cookie获取用户ID，使用默认值: {fallback_user_id}")
    return fallback_user_id


def get_current_username(fallback_username: str = "访客") -> str:
    """
    统一获取当前用户名的助手函数
    
    Args:
        fallback_username: 当无法获取真实用户名时使用的默认值
        
    Returns:
        用户名字符串
    """
    try:
        from ..bff_integration.auth.user_context import UserContextManager
        username = UserContextManager.get_current_username()
        
        if username:
            logger.debug(f"✅ 获取到真实用户名: {username}")
            return username
        else:
            logger.warning(f"⚠️ 无法获取当前用户名，使用默认值: {fallback_username}")
            return fallback_username
            
    except Exception as e:
        logger.warning(f"⚠️ 获取用户名失败: {e}，使用默认值: {fallback_username}")
        return fallback_username


def get_current_user_context_summary() -> dict:
    """
    获取当前用户上下文摘要信息
    
    Returns:
        包含用户信息的字典
    """
    try:
        from ..bff_integration.auth.user_context import UserContextManager
        context = UserContextManager.get_current_user_context()
        
        if context:
            return {
                "user_id": context.user_id,
                "username": context.username,
                "email": context.email,
                "roles": context.roles,
                "authenticated": True
            }
        else:
            return {
                "user_id": "default_user",
                "username": "访客",
                "email": None,
                "roles": ["GUEST"],
                "authenticated": False
            }
            
    except Exception as e:
        logger.warning(f"⚠️ 获取用户上下文摘要失败: {e}")
        return {
            "user_id": "default_user", 
            "username": "访客",
            "email": None,
            "roles": ["GUEST"],
            "authenticated": False,
            "error": str(e)
        }


def log_user_context_info(operation: str = "操作"):
    """
    记录当前用户上下文信息到日志
    
    Args:
        operation: 操作描述
    """
    try:
        context_summary = get_current_user_context_summary()
        logger.info(f"🔍 {operation} - 用户上下文信息:")
        logger.info(f"   👤 用户ID: {context_summary['user_id']}")
        logger.info(f"   📝 用户名: {context_summary['username']}")
        logger.info(f"   📧 邮箱: {context_summary.get('email', 'N/A')}")
        logger.info(f"   🔐 认证状态: {'已认证' if context_summary['authenticated'] else '未认证'}")
        
    except Exception as e:
        logger.warning(f"⚠️ 记录用户上下文信息失败: {e}")