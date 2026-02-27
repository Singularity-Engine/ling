"""
认证相关的API路由

提供用户注册、登录验证等BFF集成端点
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Header, status
from typing import Optional, Dict, Any
from datetime import datetime
from loguru import logger

from ..auth.jwt_handler import JWTHandler
from ..auth.middleware import create_jwt_dependency
from ..models.user_models import UserCreate, UserResponse, UserContext
from ..database.user_repository import UserRepository

def create_auth_router(config: Any = None, db_manager: Any = None) -> APIRouter:
    """创建认证路由

    Args:
        config: 应用配置（可选）
        db_manager: 数据库管理器（可选）

    Returns:
        认证路由器
    """
    router = APIRouter(prefix="/api/auth", tags=["BFF认证"])

    # 初始化组件
    jwt_handler = JWTHandler(config)
    user_repo = UserRepository(db_manager)

    # 创建JWT依赖项
    get_current_user = create_jwt_dependency(jwt_handler, optional=False)
    get_current_user_optional = create_jwt_dependency(jwt_handler, optional=True)

    @router.post("/sync", response_model=Dict[str, Any])
    async def sync_user(request: Request, user_data: UserCreate):
        """用户同步端点（优化版本）

        接收来自Node.js的用户信息同步请求
        """
        request_id = f"SYNC-{id(request)}"
        logger.info(f"=== [{request_id}] 开始处理用户同步请求 ===")

        try:
            # 验证系统级JWT认证
            auth_header = request.headers.get("authorization")
            if not auth_header or not jwt_handler.verify_webhook_auth(auth_header):
                logger.warning(f"[{request_id}] ❌ 系统级JWT认证失败")
                raise HTTPException(status_code=401, detail="无效的系统级JWT认证")

            logger.info(f"[{request_id}] ✅ 系统级JWT认证成功")

            # 检查当前用户上下文状态
            from ..auth.user_context import UserContextManager
            current_context = UserContextManager.get_current_user_context()
            if current_context:
                logger.info(f"[{request_id}] 🔍 当前用户上下文存在:")
                logger.info(f"[{request_id}]    👤 上下文用户ID: {current_context.user_id}")
                logger.info(f"[{request_id}]    📝 上下文用户名: {current_context.username}")
            else:
                logger.info(f"[{request_id}] 🔍 当前无用户上下文（系统级操作）")

            # 提取用户信息
            user_id = user_data.clerk_user_id
            username = user_data.username
            email = user_data.email
            operation = user_data.operation

            logger.info(f"[{request_id}] 📋 同步用户信息: {user_id}, {username}, {email}")
            logger.info(f"[{request_id}] 📋 操作类型: {operation}")

            if not user_id or not username:
                raise HTTPException(status_code=400, detail="缺少必要参数")

            # 同步用户信息到本地数据库
            logger.info(f"[{request_id}] 开始同步用户信息到本地数据库...")
            user = user_repo.sync_user_from_jwt({
                "sub": user_id,
                "username": username,
                "email": email,
                "first_name": user_data.first_name,
                "last_name": user_data.last_name,
                "image_url": user_data.image_url
            })

            logger.info(f"[{request_id}] ✅ 用户同步成功: {user.username}")

            # 为同步的用户设置临时用户上下文（可选，用于后续操作）
            try:
                from ..models.user_models import UserContext
                sync_user_context = UserContext(
                    user_id=user.user_id,
                    username=user.username,
                    email=user.email,
                    roles=user.roles or ["USER"],
                    token=None  # 系统级操作不需要用户令牌
                )
                UserContextManager.set_user_context(sync_user_context)
                logger.info(f"[{request_id}] 🔄 已为同步用户设置临时上下文")
                
                # 验证上下文设置
                verify_context = UserContextManager.get_current_user_context()
                if verify_context and verify_context.user_id == user.user_id:
                    logger.info(f"[{request_id}] ✅ 用户上下文设置验证成功")
                else:
                    logger.warning(f"[{request_id}] ⚠️ 用户上下文设置验证失败")
            except Exception as ctx_error:
                logger.warning(f"[{request_id}] ⚠️ 设置用户上下文时出错: {str(ctx_error)}")

            # 构建响应（与Java端格式保持一致）
            response = {
                "success": True,
                "message": "用户同步成功",
                "user": {
                    "user_id": user.user_id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "image_url": user.avatar_url,
                    "operation": operation,
                    "synced_at": datetime.now().isoformat(),
                    "source": "python-backend"
                },
                "backend": "python",
                "version": "1.0.0"
            }

            logger.info(f"[{request_id}] 📤 返回响应: {response}")
            return response

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[{request_id}] ❌ 用户同步异常: {str(e)}")
            raise HTTPException(status_code=500, detail=f"用户同步失败: {str(e)}")

    @router.post("/register", response_model=Dict[str, Any])
    async def register_user(request: Request, user_data: UserCreate):
        """用户注册/更新端点（保留兼容性）

        由BFF网关在检测到新用户注册或用户信息更新时调用

        Args:
            request: FastAPI请求对象
            user_data: 用户数据

        Returns:
            注册/更新结果
        """
        request_id = f"REQ-{id(request)}"
        logger.info(f"=== [{request_id}] 开始处理用户注册请求 ===")

        try:
            # 打印请求基本信息
            logger.info(f"[{request_id}] 请求方法: {request.method}")
            logger.info(f"[{request_id}] 请求URL: {request.url}")
            logger.info(f"[{request_id}] 客户端IP: {request.client.host if request.client else 'unknown'}")

            # 打印请求头（敏感信息脱敏）
            logger.info(f"[{request_id}] === 请求头信息 ===")
            for header_name, header_value in request.headers.items():
                if header_name.lower() == "authorization" and header_value:
                    logger.info(f"[{request_id}] {header_name}: {header_value[:20]}...")
                else:
                    logger.info(f"[{request_id}] {header_name}: {header_value}")

            # 验证webhook认证
            auth_header = request.headers.get("authorization")
            logger.info(f"[{request_id}] 开始验证webhook认证...")

            if not auth_header:
                logger.warning(f"[{request_id}] ❌ Authorization头为空")
                raise HTTPException(status_code=401, detail="缺少Authorization头")

            if not jwt_handler.verify_webhook_auth(auth_header):
                logger.warning(f"[{request_id}] ❌ Webhook认证失败")
                raise HTTPException(status_code=401, detail="无效的webhook认证")

            logger.info(f"[{request_id}] ✅ Webhook认证成功，继续处理用户注册")

            # 提取用户信息
            user_id = user_data.clerk_user_id
            username = user_data.username
            email = user_data.email
            avatar_url = user_data.image_url
            operation = user_data.operation

            # 如果没有用户名，使用显示名称
            if not username and hasattr(user_data, 'get_display_name'):
                username = user_data.get_display_name()

            logger.info(f"[{request_id}] === 用户信息提取 ===")
            logger.info(f"[{request_id}] Clerk用户ID: {user_id}")
            logger.info(f"[{request_id}] 用户名: {username}")
            logger.info(f"[{request_id}] 邮箱: {email}")
            logger.info(f"[{request_id}] 头像URL: {avatar_url}")
            logger.info(f"[{request_id}] 操作类型: {operation}")

            if not user_id or not username:
                logger.warning(f"[{request_id}] ❌ 缺少必要参数 - userId: {user_id}, username: {username}")
                raise HTTPException(status_code=400, detail="缺少必要参数")

            # 查找或创建用户
            logger.info(f"[{request_id}] 开始查找或创建用户...")
            user = user_repo.find_or_create_user(user_id, username, avatar_url=avatar_url)
            logger.info(f"[{request_id}] 用户处理完成 - ID: {user.id}, 用户名: {user.username}")

            # 如果是更新操作且信息发生变化，则更新用户信息
            needs_update = False
            if operation == "updated":
                existing_user = user_repo.find_by_user_id(user_id)
                if existing_user:
                    if username != existing_user.username:
                        logger.info(f"[{request_id}] 检测到用户名变更，从 '{existing_user.username}' 更新为 '{username}'")
                        needs_update = True



                    if avatar_url and avatar_url != existing_user.avatar_url:
                        logger.info(f"[{request_id}] 检测到头像变更")
                        needs_update = True

                    if needs_update:
                        existing_user.username = username
                        existing_user.avatar_url = avatar_url
                        user_repo.update_user(existing_user)
                        user = user_repo.find_by_user_id(user_id)
                        logger.info(f"[{request_id}] 用户信息更新完成")

            result = {
                "id": user.id,
                "user_id": user.user_id,
                "username": user.username,
                "avatar_url": user.avatar_url,
                "operation": operation,
                "success": True
            }

            logger.info(f"[{request_id}] === 处理结果 ===")
            logger.info(f"[{request_id}] ✅ 用户注册/更新成功")

            return result

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[{request_id}] ❌ 处理异常: {type(e).__name__} - {str(e)}")
            import traceback
            logger.error(f"[{request_id}] 异常堆栈: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"注册/更新用户失败: {str(e)}")
        finally:
            logger.info(f"=== [{request_id}] 请求处理完成 ===")

    @router.get("/me", response_model=UserResponse)
    async def get_current_user_info(request: Request, current_user: UserContext = Depends(get_current_user)):
        """获取当前用户信息（支持JWT自动同步）

        Args:
            request: HTTP请求对象
            current_user: 当前用户上下文

        Returns:
            当前用户信息
        """
        request_id = f"ME-{int(datetime.now().timestamp() * 1000)}"
        logger.info(f"=== [{request_id}] API /api/auth/me 被调用 ===")

        try:
            logger.info(f"[{request_id}] 📥 接收到的用户上下文:")
            logger.info(f"[{request_id}]    👤 用户ID: {current_user.user_id}")
            logger.info(f"[{request_id}]    📝 用户名: {current_user.username}")
            logger.info(f"[{request_id}]    📧 邮箱: {current_user.email}")
            logger.info(f"[{request_id}]    🏷️ 角色: {current_user.roles}")
            logger.info(f"[{request_id}]    🎫 令牌存在: {bool(current_user.token)}")

            # 验证用户上下文管理器中的状态
            from ..auth.user_context import UserContextManager
            manager_context = UserContextManager.get_current_user_context()
            if manager_context:
                logger.info(f"[{request_id}] 🔍 UserContextManager中的上下文:")
                logger.info(f"[{request_id}]    👤 管理器用户ID: {manager_context.user_id}")
                logger.info(f"[{request_id}]    📝 管理器用户名: {manager_context.username}")
                logger.info(f"[{request_id}]    🔄 上下文匹配: {manager_context.user_id == current_user.user_id}")
            else:
                logger.warning(f"[{request_id}] ⚠️ UserContextManager中无用户上下文")

            # 尝试从JWT自动同步用户信息
            user = None
            source = "database_only"

            # 获取JWT令牌
            authorization = request.headers.get("authorization")
            if authorization and authorization.startswith("Bearer "):
                try:
                    token = authorization[7:]
                    payload = jwt_handler.decode_token(token)
                    logger.info(f"[{request_id}] 🔄 开始JWT自动同步...")

                    # 使用JWT信息同步用户
                    user = user_repo.sync_user_from_jwt(payload)
                    if user:
                        # 更新最后登录时间
                        user_repo.update_last_login_time(user.user_id)
                        source = "jwt_synced"
                        logger.info(f"[{request_id}] ✅ JWT自动同步成功")
                    else:
                        logger.warning(f"[{request_id}] ⚠️ JWT自动同步失败，尝试数据库查询")
                except Exception as jwt_error:
                    logger.warning(f"[{request_id}] ⚠️ JWT自动同步异常: {str(jwt_error)}")

            # 如果JWT同步失败，从数据库查询
            if not user:
                logger.info(f"[{request_id}] 🔍 从数据库查询用户信息...")
                user = user_repo.find_by_user_id(current_user.user_id)
                source = "database_fallback"

            if not user:
                logger.error(f"[{request_id}] ❌ 数据库中未找到用户: {current_user.user_id}")
                # 创建基础用户信息作为兜底
                response = UserResponse(
                    id=0,
                    user_id=current_user.user_id,
                    username=current_user.username or "unknown",
                    email=current_user.email,
                    roles=current_user.roles or ["USER"],
                    authenticated=True,
                    source="jwt_fallback"
                )
                logger.info(f"[{request_id}] 🎯 返回JWT兜底信息")
                return response

            logger.info(f"[{request_id}] ✅ 获取到用户信息:")
            logger.info(f"[{request_id}]    🆔 数据库ID: {user.id}")
            logger.info(f"[{request_id}]    👤 用户ID: {user.user_id}")
            logger.info(f"[{request_id}]    📝 用户名: {user.username}")
            logger.info(f"[{request_id}]    📧 邮箱: {user.email}")
            logger.info(f"[{request_id}]    🖼️ 头像URL: {user.avatar_url}")

            response = UserResponse(
                id=user.id,
                user_id=user.user_id,
                username=user.username,
                email=user.email,
                first_name=user.first_name,
                last_name=user.last_name,
                avatar_url=user.avatar_url,
                display_name=user.get_display_name(),
                is_active=user.is_active,
                last_login_at=user.last_login_at,
                roles=user.roles,
                authenticated=True,
                source=source
            )

            logger.info(f"[{request_id}] 🎯 API /api/auth/me 响应成功，数据源: {source}")
            return response

        except HTTPException as he:
            logger.error(f"❌ HTTP异常: {str(he)}")
            logger.error(f"   状态码: {he.status_code}")
            logger.error(f"   详情: {he.detail}")
            raise
        except Exception as e:
            logger.error(f"❌ 获取当前用户信息失败: {str(e)}")
            logger.error(f"❌ 异常类型: {type(e).__name__}")
            import traceback
            logger.error(f"❌ 异常堆栈: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"获取用户信息失败: {str(e)}")

    @router.post("/verify")
    async def verify_token(authorization: Optional[str] = Header(None)):
        """验证JWT令牌（支持自动同步用户信息）

        Args:
            authorization: Authorization头部值

        Returns:
            令牌验证结果和用户信息
        """
        request_id = f"VERIFY-{int(datetime.now().timestamp() * 1000)}"
        logger.info(f"=== [{request_id}] API /api/auth/verify 被调用 ===")

        if not authorization or not authorization.startswith("Bearer "):
            logger.warning(f"[{request_id}] ❌ 未提供有效的认证凭据: {authorization}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="未提供有效的认证凭据",
                headers={"WWW-Authenticate": "Bearer"}
            )

        try:
            token = authorization[7:]  # 移除"Bearer "前缀
            logger.info(f"[{request_id}] 🔑 解析JWT令牌，长度: {len(token)}")
            logger.info(f"[{request_id}] 🔑 令牌前50字符: {token[:50]}...")

            payload = jwt_handler.decode_token(token)
            logger.info(f"[{request_id}] ✅ JWT令牌解码成功")

            # 打印JWT声明用于调试
            logger.info(f"[{request_id}] JWT Claims:")
            for key, value in payload.items():
                logger.info(f"[{request_id}]   {key}: {value}")

            user_id = payload.get("sub")
            if not user_id:
                logger.error(f"[{request_id}] ❌ JWT中缺少用户ID (sub)")
                raise HTTPException(status_code=400, detail="JWT中缺少用户ID")

            # 尝试JWT自动同步
            user = None
            source = "jwt_only"

            try:
                logger.info(f"[{request_id}] 🔄 开始JWT自动同步...")
                user = user_repo.sync_user_from_jwt(payload)
                if user:
                    # 更新最后登录时间
                    user_repo.update_last_login_time(user.user_id)
                    source = "jwt_synced"
                    logger.info(f"[{request_id}] ✅ JWT自动同步成功")
                else:
                    logger.warning(f"[{request_id}] ⚠️ JWT自动同步失败")
            except Exception as sync_error:
                logger.warning(f"[{request_id}] ⚠️ JWT自动同步异常: {str(sync_error)}")

            # 如果同步失败，尝试从数据库查找
            if not user:
                logger.info(f"[{request_id}] 🔍 从数据库查找用户: {user_id}")
                user = user_repo.find_by_user_id(user_id)
                source = "database_fallback"

            # 构建响应
            if user:
                response = {
                    "valid": True,
                    "user_id": user.user_id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "avatar_url": user.avatar_url,
                    "display_name": user.get_display_name(),
                    "is_active": user.is_active,
                    "roles": user.roles,
                    "source": source,
                    "message": "令牌有效，用户信息已同步"
                }
                logger.info(f"[{request_id}] ✅ 找到用户: {user.username} (ID: {user.id})")
            else:
                # 即使数据库中没有用户，JWT有效也应该返回基础信息
                username = (payload.get('username') or
                           payload.get('preferred_username') or
                           payload.get('name'))
                if not username:
                    email = payload.get('email')
                    if email and '@' in email:
                        username = email.split('@')[0]
                    else:
                        username = user_id

                response = {
                    "valid": True,
                    "user_id": user_id,
                    "username": username,
                    "email": payload.get('email'),
                    "roles": ["USER"],
                    "source": "jwt_only",
                    "message": "令牌有效但数据库中未找到用户记录"
                }
                logger.warning(f"[{request_id}] ⚠️ 令牌有效但数据库中未找到用户: {user_id}")

            logger.info(f"[{request_id}] 🎯 API /api/auth/verify 响应成功，数据源: {source}")
            return response

        except HTTPException as he:
            logger.error(f"❌ HTTP异常: {str(he)}")
            logger.error(f"   状态码: {he.status_code}")
            logger.error(f"   详情: {he.detail}")
            raise
        except Exception as e:
            logger.error(f"❌ 令牌验证失败: {str(e)}")
            logger.error(f"❌ 异常类型: {type(e).__name__}")
            import traceback
            logger.error(f"❌ 异常堆栈: {traceback.format_exc()}")
            raise HTTPException(status_code=401, detail=f"令牌验证失败: {str(e)}")

    @router.post("/refresh")
    async def refresh_token(current_user: UserContext = Depends(get_current_user)):
        """刷新JWT令牌

        Args:
            current_user: 当前用户上下文

        Returns:
            新的JWT令牌
        """
        logger.info(f"🔍 API /api/auth/refresh 被调用")
        logger.info(f"📥 接收到的用户上下文:")
        logger.info(f"   👤 用户ID: {current_user.user_id}")
        logger.info(f"   📝 用户名: {current_user.username}")
        logger.info(f"   📧 邮箱: {current_user.email}")
        logger.info(f"   🏷️ 角色: {current_user.roles}")

        try:
            # 获取用户最新信息
            logger.info(f"🔍 正在从数据库查询用户信息: {current_user.user_id}")
            user = user_repo.find_by_user_id(current_user.user_id)

            if not user:
                logger.warning(f"⚠️ 数据库中未找到用户: {current_user.user_id}")
                raise HTTPException(status_code=404, detail="用户不存在")

            logger.info(f"✅ 从数据库获取到用户信息:")
            logger.info(f"   🆔 数据库ID: {user.id}")
            logger.info(f"   👤 用户ID: {user.user_id}")
            logger.info(f"   📝 用户名: {user.username}")
            logger.info(f"   🖼️ 头像URL: {user.avatar_url}")

            # 生成新令牌
            logger.info(f"🔑 正在生成新的JWT令牌...")
            logger.info(f"🔧 使用current_user.email代替user.email: {current_user.email}")
            new_token = jwt_handler.create_token(
                user_id=user.user_id,
                username=user.username,
                email=current_user.email,  # 使用当前用户上下文中的email
                roles=current_user.roles
            )
            logger.info(f"✅ 新JWT令牌生成成功，长度: {len(new_token)}")

            response = {
                "token": new_token,
                "user": {
                    "user_id": user.user_id,
                    "username": user.username,
                    "email": current_user.email  # 使用当前用户上下文中的email
                }
            }

            logger.info(f"🎯 API /api/auth/refresh 响应成功")
            return response

        except HTTPException as he:
            logger.error(f"❌ HTTP异常: {str(he)}")
            logger.error(f"   状态码: {he.status_code}")
            logger.error(f"   详情: {he.detail}")
            raise
        except Exception as e:
            logger.error(f"❌ 刷新令牌失败: {str(e)}")
            logger.error(f"❌ 异常类型: {type(e).__name__}")
            import traceback
            logger.error(f"❌ 异常堆栈: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"刷新令牌失败: {str(e)}")

    @router.get("/status")
    async def get_auth_status(current_user: Optional[UserContext] = Depends(get_current_user_optional)):
        """获取认证状态

        Args:
            current_user: 当前用户上下文（可选）

        Returns:
            认证状态信息
        """
        if current_user:
            return {
                "authenticated": True,
                "user_id": current_user.user_id,
                "username": current_user.username,
                "email": current_user.email,
                "roles": current_user.roles
            }
        else:
            return {
                "authenticated": False,
                "user_id": None,
                "username": None,
                "email": None,
                "roles": []
            }

    @router.get("/config")
    async def get_auth_config():
        """获取认证配置信息（公开信息）

        Returns:
            认证配置信息
        """
        return {
            "jwt_algorithm": jwt_handler.algorithm,
            "jwt_expiration_hours": jwt_handler.expiration_hours,
            "webhook_auth_enabled": bool(jwt_handler.webhook_secret),
            "version": "1.0.0"
        }

    @router.get("/context-test")
    async def test_user_context(current_user: UserContext = Depends(get_current_user)):
        """测试用户上下文获取（专门用于调试）

        Args:
            current_user: 当前用户上下文

        Returns:
            用户上下文详细信息
        """
        logger.info(f"🧪 用户上下文测试端点被调用")
        logger.info(f"🔍 当前请求的用户上下文详情:")
        logger.info(f"   👤 用户ID: {current_user.user_id}")
        logger.info(f"   📝 用户名: {current_user.username}")
        logger.info(f"   📧 邮箱: {current_user.email}")
        logger.info(f"   🏷️ 角色: {current_user.roles}")
        logger.info(f"   🎫 令牌长度: {len(current_user.token) if current_user.token else 0}")

        # 同时从UserContextManager获取上下文进行对比
        from ..auth.user_context import UserContextManager
        manager_context = UserContextManager.get_current_user_context()

        if manager_context:
            logger.info(f"✅ UserContextManager中的上下文:")
            logger.info(f"   👤 用户ID: {manager_context.user_id}")
            logger.info(f"   📝 用户名: {manager_context.username}")
            logger.info(f"   📧 邮箱: {manager_context.email}")
        else:
            logger.warning(f"⚠️ UserContextManager中没有找到用户上下文")

        return {
            "success": True,
            "message": "用户上下文获取成功",
            "context": {
                "user_id": current_user.user_id,
                "username": current_user.username,
                "email": current_user.email,
                "roles": current_user.roles,
                "has_token": bool(current_user.token),
                "token_length": len(current_user.token) if current_user.token else 0
            },
            "manager_context_available": manager_context is not None,
            "contexts_match": (
                manager_context and
                manager_context.user_id == current_user.user_id
            ) if manager_context else False
        }

    return router
