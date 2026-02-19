"""
WebSocket用户缓存

为WebSocket连接提供基于客户端ID的用户信息缓存
"""

from typing import Optional, Dict, Any
from loguru import logger
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass
class CachedUserInfo:
    """缓存的用户信息"""
    user_id: str
    username: str
    email: Optional[str]
    roles: list
    token: str
    cached_at: datetime
    client_uid: str


class WebSocketUserCache:
    """WebSocket用户缓存管理器"""
    
    def __init__(self):
        self._cache: Dict[str, CachedUserInfo] = {}
        self._lock = threading.RLock()
        self._ttl_hours = 24  # 缓存过期时间
        
    def set_user_for_client(self, client_uid: str, user_id: str, username: str, 
                           email: Optional[str], roles: list, token: str) -> None:
        """为WebSocket客户端设置用户信息
        
        Args:
            client_uid: WebSocket客户端ID
            user_id: 用户ID
            username: 用户名
            email: 邮箱
            roles: 角色列表
            token: JWT token
        """
        with self._lock:
            user_info = CachedUserInfo(
                user_id=user_id,
                username=username,
                email=email,
                roles=roles,
                token=token,
                cached_at=datetime.now(),
                client_uid=client_uid
            )
            self._cache[client_uid] = user_info
            logger.info(f"✅ 为WebSocket客户端 {client_uid} 缓存用户信息: {user_id}")
            
    def get_user_for_client(self, client_uid: str) -> Optional[CachedUserInfo]:
        """获取WebSocket客户端的用户信息
        
        Args:
            client_uid: WebSocket客户端ID
            
        Returns:
            缓存的用户信息，如果不存在或已过期则返回None
        """
        with self._lock:
            user_info = self._cache.get(client_uid)
            if not user_info:
                return None
                
            # 检查是否过期
            if datetime.now() - user_info.cached_at > timedelta(hours=self._ttl_hours):
                logger.debug(f"WebSocket客户端 {client_uid} 的用户缓存已过期，删除")
                del self._cache[client_uid]
                return None
                
            return user_info
            
    def get_user_id_for_client(self, client_uid: str) -> Optional[str]:
        """获取WebSocket客户端的用户ID
        
        Args:
            client_uid: WebSocket客户端ID
            
        Returns:
            用户ID，如果不存在则返回None
        """
        user_info = self.get_user_for_client(client_uid)
        return user_info.user_id if user_info else None
        
    def clear_client(self, client_uid: str) -> None:
        """清除WebSocket客户端的缓存
        
        Args:
            client_uid: WebSocket客户端ID
        """
        with self._lock:
            if client_uid in self._cache:
                logger.debug(f"清除WebSocket客户端 {client_uid} 的用户缓存")
                del self._cache[client_uid]
                
    def cleanup_expired(self) -> None:
        """清理过期的缓存条目"""
        with self._lock:
            expired_clients = []
            for client_uid, user_info in self._cache.items():
                if datetime.now() - user_info.cached_at > timedelta(hours=self._ttl_hours):
                    expired_clients.append(client_uid)
                    
            for client_uid in expired_clients:
                logger.debug(f"清理过期的用户缓存: {client_uid}")
                del self._cache[client_uid]
                
    def get_all_cached_clients(self) -> Dict[str, str]:
        """获取所有缓存的客户端及其用户ID
        
        Returns:
            客户端ID到用户ID的映射
        """
        with self._lock:
            return {client_uid: user_info.user_id 
                   for client_uid, user_info in self._cache.items()}
                   
    def clear_all(self) -> None:
        """清除所有缓存"""
        with self._lock:
            self._cache.clear()
            logger.debug("清除所有WebSocket用户缓存")


# 全局缓存实例
websocket_user_cache = WebSocketUserCache()


def get_user_id_for_websocket_client(client_uid: str) -> Optional[str]:
    """获取WebSocket客户端的用户ID
    
    这是一个便捷函数，用于从WebSocket客户端ID获取对应的用户ID
    
    Args:
        client_uid: WebSocket客户端ID
        
    Returns:
        用户ID，如果不存在则返回None
    """
    return websocket_user_cache.get_user_id_for_client(client_uid)


def cache_user_for_websocket_client(client_uid: str, user_id: str, username: str,
                                  email: Optional[str], roles: list, token: str) -> None:
    """为WebSocket客户端缓存用户信息
    
    Args:
        client_uid: WebSocket客户端ID
        user_id: 用户ID
        username: 用户名
        email: 邮箱
        roles: 角色列表
        token: JWT token
    """
    websocket_user_cache.set_user_for_client(client_uid, user_id, username, email, roles, token)


def clear_websocket_client_cache(client_uid: str) -> None:
    """清除WebSocket客户端的缓存
    
    Args:
        client_uid: WebSocket客户端ID
    """
    websocket_user_cache.clear_client(client_uid)