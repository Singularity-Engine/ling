"""
JWT认证中间件

提供FastAPI的JWT认证中间件功能
"""

from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any
from loguru import logger

from .jwt_handler import JWTHandler
from .user_context import UserContext, UserContextManager
from ..models.user_models import TokenPayload

class JWTAuthMiddleware(HTTPBearer):
    """JWT认证中间件"""

    def __init__(self, jwt_handler: JWTHandler, auto_error: bool = True):
        """初始化中间件

        Args:
            jwt_handler: JWT处理器实例
            auto_error: 是否自动抛出错误
        """
        super().__init__(auto_error=auto_error)
        self.jwt_handler = jwt_handler

    async def __call__(self, request: Request) -> Optional[Dict[str, Any]]:
        """处理请求认证

        Args:
            request: FastAPI请求对象

        Returns:
            解码后的令牌负载

        Raises:
            HTTPException: 认证失败
        """
        try:
            # 获取认证凭据
            credentials: HTTPAuthorizationCredentials = await super().__call__(request)

            if not credentials:
                if self.auto_error:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="未提供认证凭据",
                        headers={"WWW-Authenticate": "Bearer"}
                    )
                return None

            # 验证令牌
            token = credentials.credentials
            logger.info(f"🔐 中间件开始处理JWT认证...")
            logger.info(f"🔐 请求路径: {request.url.path}")
            logger.info(f"🔐 请求方法: {request.method}")

            payload = self.jwt_handler.decode_token(token)

            # 设置用户上下文
            user_id = payload.get("sub") or payload.get("user_id")
            username = payload.get("username")
            email = payload.get("email")
            roles = payload.get("roles", [])

            # 为空用户名提供默认值
            if username is None:
                # 尝试从邮箱中提取用户名
                if email:
                    username = email.split('@')[0]
                else:
                    # 如果没有邮箱，使用用户ID的最后8位作为用户名
                    username = f"user_{user_id[-8:]}" if user_id else "unknown"
                logger.info(f"⚠️ JWT令牌中缺少username字段，使用默认值: {username}")

            user_context = UserContext(
                user_id=user_id,
                username=username,
                email=email,
                roles=roles,
                token=token
            )

            logger.info(f"👤 正在设置用户上下文...")
            UserContextManager.set_user_context(user_context)

            # 验证上下文是否设置成功
            current_context = UserContextManager.get_current_user_context()
            if current_context:
                logger.info(f"✅ 用户上下文设置成功！")
                logger.info(f"   👤 当前用户ID: {current_context.user_id}")
                logger.info(f"   📝 当前用户名: {current_context.username}")
                logger.info(f"   📧 当前邮箱: {current_context.email}")
                logger.info(f"   🏷️ 当前角色: {current_context.roles}")
            else:
                logger.warning(f"⚠️ 用户上下文设置可能失败")

            logger.info(f"🎯 JWT认证中间件处理完成")
            return payload

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"认证异常: {str(e)}")
            if self.auto_error:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="无效的认证凭据",
                    headers={"WWW-Authenticate": "Bearer"}
                )
            return None

def create_jwt_dependency(jwt_handler: JWTHandler, optional: bool = False):
    """创建JWT依赖项

    Args:
        jwt_handler: JWT处理器实例
        optional: 是否为可选认证

    Returns:
        FastAPI依赖项函数
    """
    security = HTTPBearer(auto_error=not optional)

    async def get_current_user(
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
    ) -> Optional[UserContext]:
        """获取当前用户"""
        if not credentials:
            if optional:
                return None
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="未提供认证凭据",
                headers={"WWW-Authenticate": "Bearer"}
            )

        try:
            token = credentials.credentials
            payload = jwt_handler.decode_token(token)

            # 提取用户信息
            user_id = payload.get("sub") or payload.get("user_id")
            username = payload.get("username")
            email = payload.get("email")
            roles = payload.get("roles", [])

            # 为空用户名提供默认值
            if username is None:
                # 尝试从邮箱中提取用户名
                if email:
                    username = email.split('@')[0]
                else:
                    # 如果没有邮箱，使用用户ID的最后8位作为用户名
                    username = f"user_{user_id[-8:]}" if user_id else "unknown"
                logger.info(f"⚠️ JWT令牌中缺少username字段，使用默认值: {username}")

            user_context = UserContext(
                user_id=user_id,
                username=username,
                email=email,
                roles=roles,
                token=token
            )

            # 设置到上下文变量中
            logger.info(f"🔄 JWT依赖项：正在设置用户上下文...")
            UserContextManager.set_user_context(user_context)
            
            # 验证上下文设置
            verify_context = UserContextManager.get_current_user_context()
            if verify_context and verify_context.user_id == user_context.user_id:
                logger.info(f"✅ JWT依赖项：用户上下文设置成功")
                logger.info(f"   👤 设置的用户ID: {verify_context.user_id}")
                logger.info(f"   📝 设置的用户名: {verify_context.username}")
            else:
                logger.warning(f"⚠️ JWT依赖项：用户上下文设置可能失败")

            return user_context

        except Exception as e:
            logger.error(f"认证失败: {str(e)}")
            if optional:
                return None
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的认证凭据",
                headers={"WWW-Authenticate": "Bearer"}
            )

    return get_current_user

def require_roles(*required_roles: str):
    """角色权限装饰器

    Args:
        required_roles: 必需的角色列表

    Returns:
        依赖项函数
    """
    def role_checker(current_user: UserContext = Depends()):
        """检查用户角色"""
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户未认证"
            )

        if required_roles and not any(role in current_user.roles for role in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要以下角色之一: {', '.join(required_roles)}"
            )

        return current_user

    return role_checker
