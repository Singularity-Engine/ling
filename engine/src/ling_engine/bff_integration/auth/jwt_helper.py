"""
JWT辅助工具

提供从WebSocket请求中提取Cookie并解码JWT令牌的功能
"""

import base64
import json
import jwt
from typing import Optional, Dict, Any
from urllib.parse import unquote
from loguru import logger
from .jwt_handler import JWTHandler


def parse_cookies_from_header(cookie_header: str) -> Dict[str, str]:
    """从Cookie头部解析所有cookie
    
    Args:
        cookie_header: Cookie头部字符串
        
    Returns:
        解析后的cookie字典
    """
    cookies = {}
    if not cookie_header:
        return cookies
        
    try:
        # 按分号分割cookie
        cookie_pairs = cookie_header.split(';')
        for pair in cookie_pairs:
            if '=' in pair:
                name, value = pair.strip().split('=', 1)
                cookies[name.strip()] = unquote(value.strip())
    except Exception as e:
        logger.warning(f"解析Cookie头部失败: {e}")
        
    return cookies


def extract_session_cookie_from_websocket(websocket_headers: Dict[str, Any]) -> Optional[str]:
    """从WebSocket请求头中提取internal_access_token Cookie

    Args:
        websocket_headers: WebSocket请求头字典

    Returns:
        internal_access_token Cookie值，如果不存在则返回None
    """
    try:
        # 尝试从不同可能的头部键中获取cookie
        cookie_header = None
        for key in ['cookie', 'Cookie', 'COOKIE']:
            if key in websocket_headers:
                cookie_header = websocket_headers[key]
                break
        
        if not cookie_header:
            logger.debug("WebSocket请求头中未找到Cookie信息")
            return None
            
        # 解析所有cookie
        cookies = parse_cookies_from_header(cookie_header)
        session_cookie = cookies.get('internal_access_token')
        
        if session_cookie:
            logger.info(f"✅ 从WebSocket中提取到internal_access_token Cookie，长度: {len(session_cookie)}")
            logger.debug(f"🍪 internal_access_token前30字符: {session_cookie[:30]}...")
        else:
            logger.debug("WebSocket Cookie中未找到internal_access_token")
            
        return session_cookie
        
    except Exception as e:
        logger.error(f"从WebSocket提取internal_access_token Cookie失败: {e}")
        return None


def decode_session_token(session_token: str) -> Optional[Dict[str, Any]]:
    """解码session token获取用户信息
    
    Args:
        session_token: session token字符串
        
    Returns:
        用户信息字典，如果解码失败则返回None
    """
    try:
        logger.info(f"🔐 开始解码session token，长度: {len(session_token)}")
        logger.debug(f"🔐 Token前50字符: {session_token[:50]}...")
        
        # 使用JWT处理器解码
        jwt_handler = JWTHandler()
        payload = jwt_handler.decode_token(session_token)
        
        # 提取用户信息
        user_id = payload.get("sub") or payload.get("user_id")
        username = payload.get("username")
        email = payload.get("email")
        roles = payload.get("roles", [])
        
        # 如果用户名为空，尝试从邮箱生成
        if not username and email:
            username = email.split('@')[0]
            
        if not username and user_id:
            username = f"user_{user_id[-8:]}"
            
        # 检查用户是否在数据库中存在，如果不存在则自动创建
        try:
            from ..database.user_repository import UserRepository
            user_repo = UserRepository()
            db_user = user_repo.find_by_user_id(user_id)

            if not db_user:
                # JWT 有效但用户不在数据库中，自动创建用户记录
                logger.info(f"🆕 用户 {user_id} 在JWT中有效但数据库中不存在，自动创建用户记录...")
                try:
                    new_user = user_repo.create_user(
                        user_id=user_id,
                        username=username or f"user_{user_id[-8:]}",
                        email=email
                    )
                    if new_user:
                        logger.info(f"✅ 自动创建用户成功: {user_id}")
                    else:
                        logger.warning(f"⚠️ 自动创建用户失败，但允许继续（JWT已验证）: {user_id}")
                except Exception as create_error:
                    logger.warning(f"⚠️ 自动创建用户时出错: {create_error}，但允许继续（JWT已验证）")
            else:
                logger.info(f"✅ 用户 {user_id} 在数据库中存在，验证通过")

        except Exception as e:
            logger.error(f"❌ 数据库用户验证失败: {e}")
            # 如果数据库连接失败，为了系统稳定性，暂时允许JWT用户通过
            logger.warning("⚠️ 数据库连接失败，跳过用户存在性检查")

        user_info = {
            "user_id": user_id,
            "username": username or "unknown",
            "email": email,
            "roles": roles,
            "raw_payload": payload
        }

        logger.info(f"✅ Session token解码成功!")
        logger.info(f"   👤 用户ID: {user_info['user_id']}")
        logger.info(f"   📝 用户名: {user_info['username']}")
        logger.info(f"   📧 邮箱: {user_info['email']}")
        logger.info(f"   🏷️ 角色: {user_info['roles']}")

        return user_info
        
    except jwt.ExpiredSignatureError:
        logger.warning("⚠️ Session token已过期，拒绝认证（用户需要重新登录）")
        return None
            
    except jwt.InvalidTokenError as e:
        logger.warning(f"❌ Session token无效: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"💥 解码session token时发生异常: {str(e)}")
        return None


def extract_user_id_from_websocket_cookie(websocket_headers: Dict[str, Any]) -> Optional[str]:
    """从WebSocket Cookie中提取用户ID的完整流程
    
    Args:
        websocket_headers: WebSocket请求头字典
        
    Returns:
        用户ID，如果提取失败则返回None
    """
    try:
        # 步骤1：提取internal_access_token Cookie
        session_cookie = extract_session_cookie_from_websocket(websocket_headers)
        if not session_cookie:
            logger.debug("无法从WebSocket Cookie中获取internal_access_token")
            return None
            
        # 步骤2：解码session token
        user_info = decode_session_token(session_cookie)
        if not user_info:
            logger.debug("无法解码session token")
            return None
            
        # 步骤3：返回用户ID
        user_id = user_info.get("user_id")
        if user_id:
            logger.info(f"🎯 成功从WebSocket Cookie中提取用户ID: {user_id}")
        else:
            logger.warning("⚠️ session token中未找到用户ID")
            
        return user_id
        
    except Exception as e:
        logger.error(f"💥 从WebSocket Cookie提取用户ID时发生异常: {str(e)}")
        return None